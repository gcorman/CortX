import * as path from 'path'
import * as fs from 'fs'
import { FileService } from './FileService'
import { DatabaseService } from './DatabaseService'
import { GitService } from './GitService'
import { LLMService } from './LLMService'
import { libraryService } from './LibraryService'
import { webService } from './WebService'
import { buildSystemPrompt } from '../utils/promptBuilder'
import type { AgentResponse, AgentAction, LibraryChunkResult, AppLanguage, StreamEvent, WebFetchEvent, PartialAction } from '../../shared/types'
import { computeModifiedContent } from '../utils/contentMerge'
import { normalizeActions } from '../utils/actionNormalize'
import type { RawAction } from '../utils/actionNormalize'
import {
  extractBalancedJson,
  extractLastBalancedJson,
  closeUnclosedBraces,
  repairJson,
  toDisplayString,
  toStringArray
} from '../utils/jsonRepair'

interface RawAgentResponse {
  input_type?: string
  type?: string
  actions?: RawAction[]
  summary?: string
  response?: string
  sources?: string[]
  conflicts?: string[]
  ambiguities?: string[]
  suggestions?: string[]
  clarification?: {
    question?: string
    options?: unknown[]
  }
  proposed_actions?: Array<{
    description: string
    action: RawAction
  }>
}

/**
 * Tolerant streaming parser for the `actions: [...]` array in the LLM's JSON
 * response. Scans the accumulated buffer each feed(), emits a PartialAction
 * per action object it can locate — even before that object is closed.
 * Only re-emits when the shape changes (to throttle IPC traffic).
 */
class PartialActionParser {
  private lastKey: string[] = []
  private emitted = new Set<number>()

  constructor(private onAction: (pa: PartialAction) => void) {}

  feed(buffer: string): void {
    // Locate the actions array start.
    const arrMatch = buffer.match(/"actions"\s*:\s*\[/)
    if (!arrMatch) return
    const start = arrMatch.index! + arrMatch[0].length

    // Walk the array, splitting into top-level object slices by brace depth.
    const slices: Array<{ text: string; closed: boolean }> = []
    let depth = 0
    let objStart = -1
    let inStr = false
    let escape = false
    let arrEnded = false

    for (let i = start; i < buffer.length; i++) {
      const c = buffer[i]
      if (inStr) {
        if (escape) { escape = false; continue }
        if (c === '\\') { escape = true; continue }
        if (c === '"') { inStr = false }
        continue
      }
      if (c === '"') { inStr = true; continue }
      if (c === '{') {
        if (depth === 0) objStart = i
        depth++
      } else if (c === '}') {
        depth--
        if (depth === 0 && objStart !== -1) {
          slices.push({ text: buffer.slice(objStart, i + 1), closed: true })
          objStart = -1
        }
      } else if (c === ']' && depth === 0) {
        arrEnded = true
        break
      }
    }
    if (!arrEnded && depth > 0 && objStart !== -1) {
      slices.push({ text: buffer.slice(objStart), closed: false })
    }

    for (let idx = 0; idx < slices.length; idx++) {
      const slice = slices[idx]
      const pa = this.extractPartial(idx, slice.text, slice.closed)
      const key = `${pa.action ?? ''}|${pa.file ?? ''}|${(pa.content ?? '').length}|${pa.complete}`
      if (this.lastKey[idx] === key) continue
      this.lastKey[idx] = key
      // Only emit once per completion so UI locks the final state.
      if (pa.complete && this.emitted.has(idx)) continue
      if (pa.complete) this.emitted.add(idx)
      this.onAction(pa)
    }
  }

  private extractPartial(index: number, slice: string, closed: boolean): PartialAction {
    const action = this.extractField(slice, 'action') as 'create' | 'modify' | undefined
    const file = this.extractField(slice, 'file')
      ?? this.extractField(slice, 'path')
      ?? this.extractField(slice, 'filename')
    const content = this.extractField(slice, 'content')
    return {
      index,
      action: action === 'create' || action === 'modify' ? action : undefined,
      file,
      content,
      complete: closed
    }
  }

  /**
   * Extract `"key": "value"` from a JSON-ish slice. Handles escaped quotes
   * and lets an unterminated trailing string pass through (for in-flight
   * streaming of the `content` field).
   */
  private extractField(slice: string, key: string): string | undefined {
    const re = new RegExp(`"${key}"\\s*:\\s*"`, 'g')
    const m = re.exec(slice)
    if (!m) return undefined
    const start = m.index + m[0].length
    let out = ''
    let escape = false
    for (let i = start; i < slice.length; i++) {
      const c = slice[i]
      if (escape) {
        if (c === 'n') out += '\n'
        else if (c === 't') out += '\t'
        else if (c === 'r') out += '\r'
        else out += c
        escape = false
        continue
      }
      if (c === '\\') { escape = true; continue }
      if (c === '"') return out
      out += c
    }
    return out // string unterminated — mid-stream
  }
}

export class AgentPipeline {
  private notifyRenderer?: () => void

  constructor(
    private fileService: FileService,
    private dbService: DatabaseService,
    private gitService: GitService,
    private llmService: LLMService,
    private basePath: string,
    private language: AppLanguage = 'fr',
    notifyRenderer?: () => void
  ) {
    this.notifyRenderer = notifyRenderer
  }

  setLanguage(language: AppLanguage): void {
    this.language = language
  }

  /** Fetch web context for /wiki and /internet directives without calling the LLM. */
  async previewWebContext(input: string): Promise<string> {
    return this.fetchWebContext(input)
  }

  /**
   * Process user input: call LLM, parse response, return proposed actions.
   * Actions are NOT executed — they are proposals for the user to review.
   */
  async process(
    input: string,
    onStreamDelta?: (delta: string) => void,
    onEvent?: (ev: StreamEvent) => void
  ): Promise<AgentResponse> {
    const emit = (ev: StreamEvent): void => { try { onEvent?.(ev) } catch { /* swallow */ } }

    emit({ kind: 'phase', phase: 'retrieving' })
    const [contextFiles, libraryChunks] = await Promise.all([
      this.retrieveContext(input),
      this.retrieveLibraryContext(input),
    ])

    // ── Multi-hop expansion ─────────────────────────────────────────────────
    // Round 1 KB files + Round 1 library chunks may reference each other via
    // [[wikilinks]].  We do one additional pass to pull in the linked resources
    // so the agent sees a coherent, cross-file picture.
    const [extraLibraryChunks, extraKbText] = await this.expandMultiHop(
      contextFiles, libraryChunks
    )

    const mergedLibraryChunks = this.deduplicateChunks([...libraryChunks, ...extraLibraryChunks])
    const mergedContextFiles = extraKbText
      ? contextFiles + '\n\n' + extraKbText
      : contextFiles

    // ── Web context injection ───────────────────────────────────────────────
    // Detect /wiki <topic> and /internet <url> directives in user input.
    // Fetched content is appended to the system prompt so the LLM can reference
    // it when proposing actions — nothing is written yet (propose-then-execute).
    const webContext = await this.fetchWebContext(input, emit)

    let systemPrompt = buildSystemPrompt(
      this.dbService,
      this.fileService,
      mergedContextFiles,
      this.basePath,
      mergedLibraryChunks,
      this.language
    )

    if (webContext) {
      systemPrompt += `\n\n==================================================\nSOURCES WEB RÉCUPÉRÉES\n==================================================\n${webContext}`
    }

    emit({ kind: 'phase', phase: 'thinking' })

    // Track streaming text to parse partial actions in-flight.
    let streamAccum = ''
    let phaseSwitched = false
    const partialParser = new PartialActionParser((pa) => emit({ kind: 'partial-action', action: pa }))

    const wrappedOnDelta = (delta: string): void => {
      if (!delta) return
      if (!phaseSwitched) {
        phaseSwitched = true
        emit({ kind: 'phase', phase: 'writing' })
      }
      streamAccum += delta
      emit({ kind: 'delta', text: delta })
      partialParser.feed(streamAccum)
      onStreamDelta?.(delta)
    }

    // For Anthropic: prefill the assistant turn with `{` to force JSON-only output.
    // The model continues after `{` — we prepend it back to the response for parsing.
    const provider = this.llmService.getConfig().provider
    const usesPrefill = provider === 'anthropic'
    const messages: Array<{ role: string; content: string }> = [
      { role: 'user', content: input }
    ]
    if (usesPrefill) {
      messages.push({ role: 'assistant', content: '{' })
    }

    const rawResponseStream = await this.llmService.sendMessage(
      messages,
      systemPrompt,
      wrappedOnDelta
    )
    const rawResponse = usesPrefill ? '{' + rawResponseStream : rawResponseStream

    emit({ kind: 'phase', phase: 'proposing' })
    console.log('[AgentPipeline] Raw LLM response length:', rawResponse.length)

    const parsed = this.parseResponse(rawResponse)
    const normalizedActions = this.deduplicateSameFileActions(this.normalizeActions(parsed.actions || []))
    const inputType = parsed.input_type || parsed.type || 'capture'

    console.log('[AgentPipeline] Proposed', normalizedActions.length, 'actions:', normalizedActions.map((a) => `${a.action}:${a.file}`))

    // Build proposed actions — NOT executed yet
    const actions: AgentAction[] = normalizedActions.map((a, i) => ({
      id: `${Date.now().toString(36)}-${i}`,
      action: a.action as 'create' | 'modify',
      file: a.file,
      content: a.content || '',
      section: a.section,
      operation: a.operation as AgentAction['operation'],
      oldContent: a.old_content,
      status: 'proposed' as const
    }))

    // Normalize clarification: only emit it if both a question and >=2 options are present.
    // The LLM sometimes returns null/empty options or a single trivial option, which we ignore.
    let clarification: AgentResponse['clarification']
    if (parsed.clarification?.question && Array.isArray(parsed.clarification.options)) {
      const opts = parsed.clarification.options
        .map((o) => (typeof o === 'string' ? o.trim() : String(o ?? '').trim()))
        .filter((o) => o.length > 0)
      if (opts.length >= 2) {
        clarification = { question: parsed.clarification.question.trim(), options: opts }
      }
    }

    return {
      inputType: inputType as AgentResponse['inputType'],
      actions,
      summary: parsed.summary || '',
      response: parsed.response,
      sources: parsed.sources,
      conflicts: parsed.conflicts || [],
      ambiguities: parsed.ambiguities || [],
      suggestions: parsed.suggestions || [],
      clarification,
      proposedActions: parsed.proposed_actions?.map((pa) => ({
        description: pa.description,
        action: {
          id: Date.now().toString(36) + '-p',
          action: (pa.action?.action || pa.action?.type || 'create') as 'create' | 'modify',
          file: pa.action?.file || pa.action?.path || pa.action?.filename || '',
          content: pa.action?.content || '',
          status: 'proposed' as const
        }
      }))
    }
  }

  /**
   * Execute approved actions: write files, git commit, re-index.
   * Called only after user clicks "Accepter".
   */
  async execute(actions: AgentAction[], summary: string): Promise<string> {
    const execActions = actions.map((a) => ({
      action: a.action,
      file: a.file,
      content: a.content,
      section: a.section,
      operation: a.operation,
      old_content: a.oldContent
    }))

    await this.executeActions(execActions)

    let commitHash = ''
    try {
      commitHash = await this.gitService.commitAll(summary || 'CortX: actions validees')
      console.log('[AgentPipeline] Git commit:', commitHash)
    } catch (err) {
      console.error('[AgentPipeline] Git commit failed:', err)
    }

    await this.reindexFiles(execActions.map((a) => a.file))

    this.dbService.logAgentAction(
      summary,
      'execute',
      JSON.stringify(execActions),
      commitHash
    )

    return commitHash
  }

  /**
   * Get a preview of what a modify action would produce.
   * Returns { before, after } content strings.
   */
  async preview(action: AgentAction): Promise<{ before: string; after: string }> {
    const existing = await this.fileService.readFile(action.file)
    const before = existing?.raw || ''

    // Pure creation — file doesn't exist yet
    if (action.action === 'create' && !existing) {
      return { before: '', after: action.content }
    }

    // Either modify, or "create" on a file that already exists — always safe-merge
    const after = this.computeModifiedContent(before, action)
    return { before, after }
  }

  async undo(commitHash: string): Promise<void> {
    await this.gitService.revert(commitHash)
    await this.reindexAll()
  }

  /**
   * Save a long-form synthesis (a "fiche") generated by the agent into the
   * Fiches/ directory. Returns the path of the created file.
   *
   * Fiches are the high-value output of the agent — long-form briefs and
   * summaries — and live in their own dedicated archive panel.
   */
  async saveBrief(subject: string, body: string, kind: string = 'brief'): Promise<string> {
    const date = new Date().toISOString().split('T')[0]
    const time = new Date().toISOString().split('T')[1].slice(0, 5).replace(':', '-')
    const slug = subject
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 60) || 'fiche'

    const filePath = `Fiches/${date}_${time}_${slug}.md`

    // Sanitize the body before composition:
    //  1. Strip any leading frontmatter block the LLM may have prepended
    //     (common cause of a duplicated `---` block in the saved file).
    //  2. Strip a duplicate top-level H1 if the LLM re-emitted "# Brief — Subject".
    //  3. Strip stray code-fence wrappers around the whole response.
    let cleanBody = body.trim()

    // Drop ```markdown ... ``` or ``` ... ``` wrapping the entire response
    const fenceMatch = cleanBody.match(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```\s*$/i)
    if (fenceMatch) cleanBody = fenceMatch[1].trim()

    // Drop a leading frontmatter block (between the first two `---` markers)
    if (cleanBody.startsWith('---')) {
      const end = cleanBody.indexOf('\n---', 3)
      if (end !== -1) {
        cleanBody = cleanBody.slice(end + 4).replace(/^\s*\n/, '').trim()
      }
    }

    // Drop a leading top-level H1 — we always emit our own heading just below
    cleanBody = cleanBody.replace(/^#\s+[^\n]*\n+/, '').trim()

    const frontmatter = [
      '---',
      'type: fiche',
      `kind: ${kind}`,
      `subject: ${JSON.stringify(subject)}`,
      `created: ${date}`,
      `modified: ${date}`,
      'status: actif',
      '---',
      ''
    ].join('\n')

    const heading = `# ${kind === 'brief' ? 'Brief' : 'Fiche'} — ${subject}\n\n`
    const content = frontmatter + heading + cleanBody + '\n'

    await this.fileService.writeFile(filePath, content)

    let commitHash = ''
    try {
      commitHash = await this.gitService.commitAll(`Fiche: ${subject}`)
    } catch (err) {
      console.error('[AgentPipeline] Git commit failed on saveBrief:', err)
    }

    await this.reindexFiles([filePath])

    this.dbService.logAgentAction(
      `Fiche generee : ${subject}`,
      'brief',
      JSON.stringify([{ action: 'create', file: filePath }]),
      commitHash
    )

    return filePath
  }

  /**
   * List all archived fiches by reading the Fiches/ directory.
   * Returns a sorted list (newest first) with metadata for the side panel.
   */
  async listFiches(): Promise<Array<{
    path: string
    subject: string
    kind: string
    created: string
    excerpt: string
  }>> {
    const files = await this.fileService.listMarkdownFiles('Fiches')
    const result = []
    for (const filePath of files) {
      try {
        const content = await this.fileService.readFile(filePath)
        if (!content) continue
        const fm = content.frontmatter
        const subject = (fm.subject as string) || filePath.split('/').pop() || ''
        const kind = (fm.kind as string) || 'brief'
        // gray-matter parses bare YAML dates (2026-04-07) as Date objects —
        // always stringify before sending through IPC so the renderer never
        // receives a Date where it expects a string.
        const rawCreated = fm.created
        const created = rawCreated instanceof Date
          ? rawCreated.toISOString().split('T')[0]
          : String(rawCreated || '')
        const excerpt = content.body
          .replace(/^#.*$/gm, '')
          .replace(/\[\[([^\]]+)\]\]/g, '$1')
          .replace(/[*_`#>]/g, '')
          .trim()
          .slice(0, 140)
        result.push({ path: filePath, subject, kind, created, excerpt })
      } catch {
        // ignore
      }
    }
    // Newest first — filenames start with date_time_ so reverse-sort by path works
    result.sort((a, b) => b.path.localeCompare(a.path))
    return result
  }

  /**
   * Rewrite a file: ask the LLM to reorganize its content while preserving
   * every piece of information and all [[wikilinks]]. Commits the result so
   * the user can undo it via agent:undo. Returns the commit hash.
   */
  async rewriteFile(filePath: string): Promise<string> {
    const content = await this.fileService.readFile(filePath)
    if (!content) throw new Error(`Fichier introuvable : ${filePath}`)

    const systemPrompt = this.language === 'en'
      ? [
          'You are an expert Markdown notes organizer.',
          'Reorganize this Markdown file WITHOUT losing any information and WITHOUT modifying [[wikilinks]].',
          '',
          'ABSOLUTE RULES:',
          '1. Keep ALL existing information — nothing must disappear.',
          '2. Do NOT modify wikilinks [[Name]] — leave them exactly as-is.',
          '3. Keep YAML frontmatter unchanged (between --- markers), except update the "modified" field to today.',
          '4. Restructure the body into logical sections with clear ## headings.',
          '5. Remove obvious duplicates, group related info, use bullet points when relevant.',
          '6. Return ONLY the final Markdown content, no commentary, no explanation, no code fence.'
        ].join('\n')
      : [
          'Tu es un expert en organisation de notes Markdown.',
          'Reorganise proprement ce fichier Markdown SANS perdre la moindre information et SANS modifier les wikilinks [[...]].',
          '',
          'REGLES ABSOLUES :',
          '1. Conserve TOUTES les informations existantes — rien ne doit disparaitre.',
          '2. Ne modifie pas les wikilinks [[Nom]] — laisse-les exactement tels quels.',
          '3. Conserve le frontmatter YAML tel quel (entre les --- markers), sauf mettre a jour le champ "modified" avec la date du jour.',
          '4. Restructure le corps en sections logiques avec des titres ## clairs.',
          '5. Elimine les doublons evidents, regroupe les informations liees, utilise des bullet points si pertinent.',
          '6. Retourne UNIQUEMENT le contenu Markdown final, sans commentaire, sans explication, sans bloc de code.'
        ].join('\n')

    const userContent = this.language === 'en'
      ? `Here is the file to reorganize:\n\n${content.raw}`
      : `Voici le fichier a reorganiser :\n\n${content.raw}`

    const raw = await this.llmService.sendMessage(
      [{ role: 'user', content: userContent }],
      systemPrompt
    )

    // Strip potential code fence — handles both exact wrapping and cases where
    // the LLM adds a preamble sentence before the code block.
    let clean = raw.trim()
    const fenceExact = clean.match(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```\s*$/i)
    if (fenceExact) {
      clean = fenceExact[1].trim()
    } else {
      const fenceInner = clean.match(/```(?:markdown|md)?\s*\n([\s\S]*?)\n```/i)
      if (fenceInner) clean = fenceInner[1].trim()
    }

    await this.fileService.writeFile(filePath, clean + '\n')

    let commitHash = ''
    try {
      commitHash = await this.gitService.commitAll(`Rewrite: ${filePath}`)
    } catch (err) {
      console.error('[AgentPipeline] Git commit failed on rewriteFile:', err)
    }

    await this.reindexFiles([filePath])

    this.dbService.logAgentAction(
      `Reecriture de ${filePath}`,
      'rewrite',
      JSON.stringify([{ action: 'modify', file: filePath }]),
      commitHash
    )

    return commitHash
  }

  /**
   * Delete any Markdown file in the knowledge base (excluding _System/).
   * Commits the deletion and reindexes.
   */
  async deleteFile(filePath: string): Promise<void> {
    if (filePath.startsWith('_System/') || filePath.startsWith('_System\\')) {
      throw new Error('deleteFile refuses to delete system files')
    }
    // Remove from DB immediately so the graph/FTS are clean before commit
    this.dbService.removeFile(filePath)
    await this.fileService.deleteFile(filePath)
    let commitHash = ''
    try {
      commitHash = await this.gitService.commitAll(`Delete: ${filePath}`)
    } catch (err) {
      console.error('[AgentPipeline] Git commit failed on deleteFile:', err)
    }
    // removeFile already cleaned entities/relations/FTS — just notify renderer
    this.dbService.logAgentAction(
      `Suppression fichier : ${filePath}`,
      'delete_file',
      JSON.stringify([{ action: 'delete', file: filePath }]),
      commitHash
    )
    this.updateKbEmbeddingsAsync().catch(() => {})
    this.notifyRenderer?.()
  }

  /**
   * Delete a fiche file, commit and reindex.
   */
  async deleteFiche(filePath: string): Promise<void> {
    if (!filePath.startsWith('Fiches/')) {
      throw new Error('deleteFiche refuses any path outside Fiches/')
    }
    this.dbService.removeFile(filePath)
    await this.fileService.deleteFile(filePath)
    let commitHash = ''
    try {
      commitHash = await this.gitService.commitAll(`Delete fiche: ${filePath}`)
    } catch (err) {
      console.error('[AgentPipeline] Git commit failed on deleteFiche:', err)
    }
    this.dbService.logAgentAction(
      `Suppression fiche : ${filePath}`,
      'delete_fiche',
      JSON.stringify([{ action: 'delete', file: filePath }]),
      commitHash
    )
    this.notifyRenderer?.()
  }

  /**
   * Copy a raw .md file (provided as content string) directly into the KB root.
   * No LLM involved — content is written as-is.
   */
  async importRawMarkdown(filename: string, content: string): Promise<{ path: string }> {
    const safe = filename.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim()
    const baseName = safe.endsWith('.md') ? safe : `${safe}.md`

    let relPath = baseName
    let i = 2
    while (fs.existsSync(path.join(this.basePath, relPath))) {
      relPath = `${baseName.replace(/\.md$/, '')}_${i}.md`
      i++
    }

    await this.fileService.writeFile(relPath, content)
    try {
      await this.gitService.commitAll(`Import: ${relPath}`)
    } catch (err) {
      console.error('[AgentPipeline] importRawMarkdown: git error', err)
    }
    await this.reindexFiles([relPath])
    return { path: relPath }
  }

  /**
   * Save a manual edit made by the user from the file preview.
   * Writes the file, commits, and reindexes everything so the graph,
   * tag browser and entity index pick up the changes immediately.
   */
  async saveManualEdit(filePath: string, content: string): Promise<string> {
    // Capture old effective title before overwriting so we can propagate renames
    const oldTitle = this.fileService.getEffectiveTitle(filePath)

    await this.fileService.writeFile(filePath, content)

    // If the title changed (H1 or frontmatter), rewrite [[wikilinks]] in all other KB files
    const newTitle = this.fileService.getEffectiveTitle(filePath)
    if (oldTitle !== newTitle) {
      await this.fileService.updateWikilinksForRename(oldTitle, newTitle)
    }

    let commitHash = ''
    try {
      commitHash = await this.gitService.commitAll(`Manual edit: ${filePath}`)
    } catch (err) {
      console.error('[AgentPipeline] Git commit failed on manual edit:', err)
    }

    // Title rename updates wikilinks in all KB files → must full reindex.
    // No rename → targeted reindex of the single edited file is sufficient.
    if (oldTitle !== newTitle) {
      await this.reindexAll()
    } else {
      await this.reindexFiles([filePath])
    }

    this.dbService.logAgentAction(
      `Edition manuelle de ${filePath}`,
      'manual_edit',
      JSON.stringify([{ action: 'modify', file: filePath }]),
      commitHash
    )

    return commitHash
  }

  // --- Compute modified content without writing to disk ---
  // Pure logic lives in src/main/utils/contentMerge.ts (tested independently).

  private computeModifiedContent(existingRaw: string, action: {
    content: string; section?: string; operation?: string; oldContent?: string; old_content?: string
  }): string {
    return computeModifiedContent(existingRaw, action)
  }

  // --- Private methods ---

  private async reindexAll(): Promise<void> {
    const files = await this.fileService.listMarkdownFiles()
    // Two-pass indexing: the first pass creates all entity rows so that the
    // second pass can resolve every [[wikilink]] and infer relation types.
    // Without this, a link to an entity whose file hasn't been indexed yet
    // would be silently dropped.
    const contents = []
    for (const filePath of files) {
      try {
        const content = await this.fileService.readFile(filePath)
        if (content) contents.push(content)
      } catch (err) {
        console.error('[AgentPipeline] Failed to read', filePath, err)
      }
    }
    // Pass 1: register all file rows, FTS entries, and entity nodes.
    for (const content of contents) this.dbService.indexFileEntities(content)
    // Pass 2: resolve [[wikilinks]] into relations now that all entity rows exist.
    for (const content of contents) this.dbService.indexFileRelations(content)

    // Remove DB entries for files that no longer exist on disk (e.g. after deletion).
    this.dbService.purgeStaleFiles(new Set(files))

    // Generate semantic embeddings for new/modified KB files (best-effort, non-blocking).
    // Runs after the sync indexing so it never delays the agent response.
    this.updateKbEmbeddingsAsync().catch((err) =>
      console.warn('[AgentPipeline] KB embedding update failed:', err)
    )

    this.notifyRenderer?.()
  }

  /**
   * Incremental reindex: only process the given files rather than the full KB.
   * Use for targeted operations (create/modify a few files). All entities from
   * the rest of the KB are already in the DB, so two-pass within the subset is
   * sufficient for wikilink resolution.
   * Do NOT call this after deletions (use reindexAll or removeFile + notify).
   */
  private async reindexFiles(paths: string[]): Promise<void> {
    const unique = [...new Set(paths)]
    const contents = []
    for (const filePath of unique) {
      try {
        const content = await this.fileService.readFile(filePath)
        if (content) contents.push(content)
      } catch (err) {
        console.error('[AgentPipeline] reindexFiles: failed to read', filePath, err)
      }
    }
    for (const content of contents) this.dbService.indexFileEntities(content)
    for (const content of contents) this.dbService.indexFileRelations(content)

    this.updateKbEmbeddingsAsync().catch((err) =>
      console.warn('[AgentPipeline] KB embedding update failed:', err)
    )

    this.notifyRenderer?.()
  }

  /**
   * Generate and store semantic embeddings for KB files that are new or stale.
   * Uses the same e5-small model as the library (via LibraryService.embedText).
   * Runs asynchronously so it never blocks the agent pipeline.
   */
  private async updateKbEmbeddingsAsync(): Promise<void> {
    const paths = this.dbService.getKbPathsNeedingEmbedding()
    if (paths.length === 0) return
    console.log(`[AgentPipeline] Embedding ${paths.length} KB file(s)...`)

    for (const filePath of paths) {
      try {
        const content = await this.fileService.readFile(filePath)
        if (!content) continue

        // Build a compact, representative text for embedding (fits in e5's 512-token window):
        // frontmatter metadata + first 400 words of body.
        const fm = content.frontmatter as Record<string, unknown>
        const lines: string[] = []
        const title = fm['title'] ?? fm['titre']
        const type  = fm['type']
        const tags  = fm['tags']
        if (title) lines.push(String(title))
        if (type)  lines.push(`type: ${type}`)
        if (Array.isArray(tags) && tags.length) lines.push(`tags: ${tags.join(', ')}`)
        lines.push(content.body.split(/\s+/).slice(0, 400).join(' '))

        const vector = await libraryService.embedText(lines.join('\n'))
        if (vector) this.dbService.storeKbEmbedding(filePath, vector)
      } catch (err) {
        console.warn('[AgentPipeline] Failed to embed KB file:', filePath, err)
      }
    }
    console.log('[AgentPipeline] KB embeddings updated.')
  }

  // normalizeActions / normalizeActionType live in src/main/utils/actionNormalize.ts.
  private normalizeActions(rawActions: RawAction[]): ReturnType<typeof normalizeActions> {
    return normalizeActions(rawActions)
  }

  /**
   * Merge multiple actions targeting the same file into one.
   * LLMs frequently emit 2-3 partial actions for the same path — e.g. one with
   * the frontmatter block and another with body sections. Merging them keeps the
   * proposal UI clean and prevents the user from having to accept the same file
   * twice. Content blocks are joined with a blank line separator so smartMerge
   * can distribute them correctly under their respective headings.
   */
  private deduplicateSameFileActions(
    actions: ReturnType<typeof normalizeActions>
  ): ReturnType<typeof normalizeActions> {
    const order: string[] = []
    const map = new Map<string, (typeof actions)[number]>()

    for (const action of actions) {
      const key = action.file.toLowerCase()
      const existing = map.get(key)
      if (!existing) {
        order.push(key)
        map.set(key, { ...action })
      } else {
        // Prefer 'create' over 'modify' so a create + modify pair produces a create
        const mergedAction = existing.action === 'create' ? 'create' : action.action
        const mergedContent = [existing.content, action.content]
          .filter(Boolean)
          .join('\n\n')
        map.set(key, { ...existing, action: mergedAction, content: mergedContent })
      }
    }

    return order.map(k => map.get(k)!)
  }

  private async retrieveLibraryContext(input: string): Promise<LibraryChunkResult[]> {
    try {
      return await libraryService.getContextChunks(input, 6)
    } catch {
      return []
    }
  }

  private async retrieveContext(input: string): Promise<string> {
    // ── 1. Lexical FTS5 OR search ────────────────────────────────────────────
    const lexicalResults = this.dbService.search(input)
    const orderedPaths: string[] = []
    const seenPaths = new Set<string>()
    for (const r of lexicalResults.slice(0, 8)) {
      if (r.path && !seenPaths.has(r.path)) {
        orderedPaths.push(r.path)
        seenPaths.add(r.path)
      }
    }

    // ── 2. Semantic KB search (best-effort — sidecar may not be running) ─────
    try {
      const queryVector = await libraryService.embedQuery(input)
      if (queryVector && queryVector.length > 0) {
        const semanticPaths = this.dbService.semanticSearchKb(queryVector, 8)
        for (const p of semanticPaths) {
          if (!seenPaths.has(p) && orderedPaths.length < 12) {
            orderedPaths.push(p)
            seenPaths.add(p)
          }
        }
      }
    } catch {
      // Sidecar not ready or embeddings not yet generated — lexical only
    }

    // ── 3. Read and assemble context ─────────────────────────────────────────
    const contextParts: string[] = []
    for (const filePath of orderedPaths) {
      try {
        const content = await this.fileService.readFile(filePath)
        if (content) contextParts.push(`--- ${filePath} ---\n${content.raw}`)
      } catch { /* skip missing/unreadable files */ }
    }
    return contextParts.join('\n\n') || 'Aucun fichier pertinent trouve.'
  }

  /**
   * Multi-hop expansion: given the KB text and library chunks from round 1,
   * follow [[wikilinks]] and file_library_links to pull in additional resources.
   *
   * Handles three cases:
   *  a) KB file → library doc (forward):   project.md has [[planning.xlsx]] → fetch its chunks
   *  b) Library doc → KB files (reverse):  found planning.xlsx → find all .md files mentioning it
   *  c) KB file → other KB files (wikilink expansion): one level deep for cross-file context
   *
   * Limits: max 3 extra library docs × 6 chunks + max 4 extra KB files to keep context sane.
   */
  private async expandMultiHop(
    kbContext: string,
    libraryChunks: LibraryChunkResult[]
  ): Promise<[LibraryChunkResult[], string]> {
    const extraLibChunks: LibraryChunkResult[] = []
    const extraKbParts: string[] = []

    // ── Extract file paths already in KB context ──────────────────────────
    const kbPathsInContext = new Set<string>()
    for (const m of kbContext.matchAll(/^--- (.+?) ---$/gm)) {
      kbPathsInContext.add(m[1])
    }

    // ── (a) KB files → linked library docs (forward wikilink) ─────────────
    const libDocIdsAlreadyInContext = new Set(libraryChunks.map((c) => c.documentId))
    const libDocIdsToFetch = new Set<string>()

    for (const kbPath of kbPathsInContext) {
      const docIds = this.dbService.getLibraryDocIdsLinkedFrom(kbPath)
      for (const docId of docIds) {
        if (!libDocIdsAlreadyInContext.has(docId)) {
          libDocIdsToFetch.add(docId)
        }
      }
    }

    // Also parse raw [[wikilinks]] from KB context text for docs not yet in DB links
    // (handles the case where indexing is slightly behind)
    // NOTE: try name-match for ALL wikilinks, not just those with file extensions —
    // wikilinks like [[personnel_marine_nationale]] (no extension) are valid library refs.
    const wikilinkTargets = [...kbContext.matchAll(/\[\[([^\]]+)\]\]/g)].map((m) => m[1])
    for (const target of wikilinkTargets) {
      const chunks = libraryService.getChunksByNameMatch(target, 4)
      for (const chunk of chunks) {
        if (!libDocIdsAlreadyInContext.has(chunk.documentId) && !libDocIdsToFetch.has(chunk.documentId)) {
          libDocIdsToFetch.add(chunk.documentId)
        }
      }
    }

    // Fetch chunks for all newly discovered library docs (cap at 3 docs)
    let libDocCount = 0
    for (const docId of libDocIdsToFetch) {
      if (libDocCount >= 3) break
      const chunks = libraryService.getChunksByDocId(docId, 6)
      if (chunks.length > 0) {
        extraLibChunks.push(...chunks)
        libDocCount++
      }
    }

    // ── (b) Library docs found → reverse: which KB files mention them? ────
    const allLibDocIds = new Set([
      ...libDocIdsAlreadyInContext,
      ...libDocIdsToFetch
    ])
    const kbPathsToFetch = new Set<string>()

    for (const docId of allLibDocIds) {
      const kbPaths = this.dbService.getKbFilesLinkingToLibDoc(docId)
      for (const kbPath of kbPaths) {
        if (!kbPathsInContext.has(kbPath)) kbPathsToFetch.add(kbPath)
      }
    }

    // ── (c) KB wikilink expansion: KB file → other KB files (forward) ───────
    for (const kbPath of kbPathsInContext) {
      const linkedKbPaths = this.dbService.getKbFilesLinkedFrom(kbPath)
      for (const p of linkedKbPaths) {
        if (!kbPathsInContext.has(p)) kbPathsToFetch.add(p)
      }
    }

    // ── (d) Backlink expansion: files that LINK TO the KB files in context ──
    // e.g. if we found "Julien Robert", also pull in "James Nguyen" which mentions him.
    // Capped tightly (2) to avoid pulling in the entire graph for popular entities.
    let backlinkCount = 0
    for (const kbPath of kbPathsInContext) {
      if (backlinkCount >= 2) break
      const backlinks = this.dbService.getKbFilesLinkingTo(kbPath)
      for (const p of backlinks) {
        if (!kbPathsInContext.has(p) && !kbPathsToFetch.has(p)) {
          kbPathsToFetch.add(p)
          backlinkCount++
          if (backlinkCount >= 2) break
        }
      }
    }

    // Fetch extra KB files (cap raised to 6 — OR search now returns higher-quality seeds)
    let kbFileCount = 0
    for (const kbPath of kbPathsToFetch) {
      if (kbFileCount >= 6) break
      try {
        const content = await this.fileService.readFile(kbPath)
        if (content) {
          extraKbParts.push(`--- ${kbPath} [contexte lié] ---\n${content.raw}`)
          kbFileCount++
        }
      } catch { /* skip */ }
    }

    return [extraLibChunks, extraKbParts.join('\n\n')]
  }

  /** Remove duplicate library chunks (same chunkId), keeping the highest-score copy. */
  private deduplicateChunks(chunks: LibraryChunkResult[]): LibraryChunkResult[] {
    const seen = new Map<number, LibraryChunkResult>()
    for (const chunk of chunks) {
      const existing = seen.get(chunk.chunkId)
      if (!existing || chunk.score > existing.score) {
        seen.set(chunk.chunkId, chunk)
      }
    }
    return [...seen.values()]
  }

  private parseResponse(raw: string): RawAgentResponse {
    const candidates: string[] = []
    const trimmed = raw.trim()
    candidates.push(trimmed)

    const codeBlockMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)```/i)
    if (codeBlockMatch) candidates.push(codeBlockMatch[1].trim())

    // First balanced {...} slice — survives prose after JSON.
    const balanced = extractBalancedJson(trimmed)
    if (balanced) candidates.push(balanced)

    // Last balanced {...} slice — survives reasoning prose BEFORE JSON.
    // LLMs sometimes emit bullet-point analysis before the actual JSON object.
    const lastBalanced = extractLastBalancedJson(trimmed)
    if (lastBalanced && lastBalanced !== balanced) candidates.push(lastBalanced)

    const jsonMatch = trimmed.match(/\{[\s\S]*\}/)
    if (jsonMatch) candidates.push(jsonMatch[0].trim())

    for (const c of candidates) {
      const direct = this.tryParseJson(c)
      if (direct) return this.normalizeParsed(direct)
      const repaired = this.tryParseJson(repairJson(c))
      if (repaired) return this.normalizeParsed(repaired)
    }

    // Last-ditch: LLM truncated mid-object. Close open strings/brackets/braces
    // and try once more on the best candidate we have.
    const bestCandidate = lastBalanced ?? balanced ?? jsonMatch?.[0] ?? trimmed
    const closed = this.tryParseJson(repairJson(closeUnclosedBraces(bestCandidate)))
    if (closed) return this.normalizeParsed(closed)

    // All strategies failed — do NOT dump raw JSON into the chat.
    // Log for debug, show a friendly message to the user.
    console.warn('[AgentPipeline] Unable to parse LLM response. First 500 chars:', raw.slice(0, 500))
    return {
      input_type: 'question',
      actions: [],
      response: "L'agent a répondu dans un format non reconnu. Réessaie, ou raccourcis ta demande si le fichier importé est volumineux.",
      summary: '',
      conflicts: [],
      ambiguities: [],
      suggestions: []
    }
  }

  /** Coerce LLM-drifted fields (arrays, objects) back to UI-renderable shapes. */
  private normalizeParsed(parsed: RawAgentResponse): RawAgentResponse {
    return {
      ...parsed,
      summary: parsed.summary !== undefined ? toDisplayString(parsed.summary) : undefined,
      response: parsed.response !== undefined ? toDisplayString(parsed.response) : undefined,
      conflicts: toStringArray(parsed.conflicts),
      ambiguities: toStringArray(parsed.ambiguities),
      suggestions: toStringArray(parsed.suggestions),
      sources: toStringArray(parsed.sources)
    }
  }

  private tryParseJson(input: string): RawAgentResponse | null {
    if (!input) return null
    try {
      return JSON.parse(input) as RawAgentResponse
    } catch {
      return null
    }
  }

  private async executeActions(actions: Array<{
    action: string; file: string; content: string; section?: string; operation?: string; old_content?: string
  }>): Promise<void> {
    for (const action of actions) {
      try {
        if (action.action === 'create') {
          // Guard: if the file already exists, never overwrite — treat as a modification.
          // LLMs often emit "create" with a full re-render of an existing file.
          const existing = await this.fileService.readFile(action.file)
          if (existing) {
            console.warn(`[AgentPipeline] create on existing file ${action.file} — routing to safe modify`)
            await this.applyModification(action)
          } else {
            await this.fileService.writeFile(action.file, action.content)
          }
        } else if (action.action === 'modify') {
          await this.applyModification(action)
        } else {
          // Unknown action type — be safe, never overwrite an existing file
          const existing = await this.fileService.readFile(action.file)
          if (existing) {
            await this.applyModification(action)
          } else {
            await this.fileService.writeFile(action.file, action.content)
          }
        }
        console.log(`[AgentPipeline] Executed ${action.action} on ${action.file}`)
      } catch (err) {
        console.error(`[AgentPipeline] Error on ${action.file}:`, err)
      }
    }
  }

  private async applyModification(action: {
    file: string; content: string; section?: string; operation?: string; old_content?: string
  }): Promise<void> {
    const existing = await this.fileService.readFile(action.file)
    if (!existing) {
      await this.fileService.writeFile(action.file, action.content)
      return
    }
    const result = this.computeModifiedContent(existing.raw, action)
    await this.fileService.writeFile(action.file, result)
  }

  // ── Web context ─────────────────────────────────────────────────────────────

  /**
   * Detect /wiki <topic> and /internet <url> directives in user input.
   * Fetches content and returns a formatted string to inject into the system prompt.
   * Returns empty string if no directives found or all fetches fail.
   */
  private async fetchWebContext(input: string, emit?: (ev: StreamEvent) => void): Promise<string> {
    const parts: string[] = []
    const emitFetch = (fetch: WebFetchEvent): void => {
      if (emit) emit({ kind: 'web-fetch', fetch })
    }
    const hasAny =
      /\/wiki\s+[^\n/]+/i.test(input) || /\/internet\b/i.test(input)
    if (hasAny && emit) emit({ kind: 'phase', phase: 'fetching-web' })

    // /wiki <topic> — fetch Wikipedia
    const wikiMatches = [...input.matchAll(/\/wiki\s+([^\n/]+)/gi)]
    for (const m of wikiMatches) {
      const topic = m[1].trim()
      const id = `wiki-${topic}`
      emitFetch({ id, kind: 'wikipedia', label: topic, status: 'pending' })
      try {
        const result = await webService.fetchWikipedia(topic, this.language === 'en' ? 'en' : 'fr')
        const formatted = webService.formatWikipediaAsContext(result)
        parts.push(formatted)
        console.log(`[AgentPipeline] Fetched Wikipedia: ${result.title} (${result.lang})`)
        emitFetch({
          id, kind: 'wikipedia', label: result.title,
          url: `https://${result.lang}.wikipedia.org/wiki/${encodeURIComponent(result.title.replace(/\s+/g, '_'))}`,
          status: 'done', chars: formatted.length
        })
      } catch (err) {
        console.warn(`[AgentPipeline] Wikipedia fetch failed for "${topic}":`, err)
        parts.push(`## Source web — Wikipedia\nErreur : impossible de récupérer "${topic}"`)
        emitFetch({
          id, kind: 'wikipedia', label: topic, status: 'error',
          errorMessage: err instanceof Error ? err.message : String(err)
        })
      }
    }

    // /internet <url|query> — fetch a specific URL, or run a DuckDuckGo search
    // and pull in the top pages. If the directive has no argument, the remaining
    // user input (minus other directives) is used as the query.
    const internetMatches = [...input.matchAll(/\/internet(?:\s+([^\n]*))?/gi)]
    const seen = new Set<string>()
    const lang: 'fr' | 'en' = this.language === 'en' ? 'en' : 'fr'

    for (const m of internetMatches) {
      const arg = (m[1] ?? '').trim()
      let target: { type: 'url' | 'query'; value: string } | null = null

      if (!arg) {
        const auto = input
          .replace(/\/internet(?:\s+[^\n]*)?/gi, ' ')
          .replace(/\/wiki\s+[^\n/]+/gi, ' ')
          .replace(/\s+/g, ' ')
          .trim()
        if (auto) target = { type: 'query', value: auto.slice(0, 200) }
      } else if (/^https?:\/\//i.test(arg)) {
        target = { type: 'url', value: arg.split(/\s+/)[0] }
      } else {
        target = { type: 'query', value: arg }
      }

      if (!target) continue
      const key = `${target.type}:${target.value}`
      if (seen.has(key)) continue
      seen.add(key)

      if (target.type === 'url') {
        const id = `url-${target.value}`
        emitFetch({ id, kind: 'url', label: target.value, url: target.value, status: 'pending' })
        try {
          const text = await webService.fetchUrl(target.value)
          parts.push(webService.formatUrlAsContext(target.value, text))
          console.log(`[AgentPipeline] Fetched URL: ${target.value}`)
          emitFetch({ id, kind: 'url', label: target.value, url: target.value, status: 'done', chars: text.length })
        } catch (err) {
          console.warn(`[AgentPipeline] URL fetch failed for "${target.value}":`, err)
          parts.push(`## Source web — ${target.value}\nErreur : impossible de récupérer cette URL`)
          emitFetch({
            id, kind: 'url', label: target.value, url: target.value, status: 'error',
            errorMessage: err instanceof Error ? err.message : String(err)
          })
        }
      } else {
        const id = `search-${target.value}`
        emitFetch({ id, kind: 'search', label: target.value, status: 'pending' })
        try {
          const batch = await webService.searchAndFetch(target.value, {
            limit: 4,
            perPageChars: 3500,
            timeoutMs: 8000,
            lang
          })
          if (batch.results.length === 0) {
            parts.push(`## Recherche web — "${target.value}"\nAucun résultat DuckDuckGo.`)
            emitFetch({ id, kind: 'search', label: target.value, status: 'done', resultCount: 0 })
          } else {
            parts.push(webService.formatSearchAsContext(batch))
            const ok = batch.results.filter(r => !r.error).length
            console.log(`[AgentPipeline] Web search "${target.value}" — ${ok}/${batch.results.length} pages récupérées`)
            emitFetch({
              id, kind: 'search', label: target.value, status: 'done',
              resultCount: ok,
              chars: batch.results.reduce((n, r) => n + (r.content?.length ?? 0), 0)
            })
          }
        } catch (err) {
          console.warn(`[AgentPipeline] Web search failed for "${target.value}":`, err)
          parts.push(`## Recherche web — "${target.value}"\nErreur : ${err instanceof Error ? err.message : String(err)}`)
          emitFetch({
            id, kind: 'search', label: target.value, status: 'error',
            errorMessage: err instanceof Error ? err.message : String(err)
          })
        }
      }
    }

    return parts.join('\n\n')
  }

  /**
   * Fetch a Wikipedia article and return a proposed AgentAction to create a .md file.
   * The LLM converts the raw Wikipedia content into a structured knowledge base entry.
   * Result is a full AgentResponse (status: 'proposed') — user must accept before any file is written.
   */
  async wikiToMd(topic: string, lang?: string): Promise<AgentResponse> {
    const effectiveLang = lang ?? (this.language === 'en' ? 'en' : 'fr')
    const wikiResult = await webService.fetchWikipedia(topic, effectiveLang)
    const wikiContext = webService.formatWikipediaAsContext(wikiResult)

    const systemPrompt = buildSystemPrompt(
      this.dbService,
      this.fileService,
      'Aucun fichier pertinent trouvé.',
      this.basePath,
      [],
      this.language
    ) + `\n\n==================================================\nSOURCES WEB RÉCUPÉRÉES\n==================================================\n${wikiContext}`

    const userMessage = this.language === 'en'
      ? `Create a structured knowledge base note about "${wikiResult.title}" using the Wikipedia content provided above. Use "create" action, choose the appropriate folder (Domaines/ for topics, Projets/ for projects, etc.), write complete frontmatter, and structure the content with clear headings. Include the Wikipedia URL as a source.`
      : `Crée une fiche structurée sur "${wikiResult.title}" en te basant sur le contenu Wikipedia fourni ci-dessus. Utilise l'action "create", choisis le dossier approprié (Domaines/ pour les sujets, Projets/ pour les projets, etc.), écris un frontmatter complet, et structure le contenu avec des titres clairs. Inclus l'URL Wikipedia comme source.`

    const rawResponse = await this.llmService.sendMessage(
      [{ role: 'user', content: userMessage }],
      systemPrompt
    )

    const parsed = this.parseResponse(rawResponse)
    const normalizedActions = this.deduplicateSameFileActions(this.normalizeActions(parsed.actions || []))

    const actions: AgentAction[] = normalizedActions.map((a, i) => ({
      id: `wiki-${Date.now().toString(36)}-${i}`,
      action: a.action as 'create' | 'modify',
      file: a.file,
      content: a.content || '',
      section: a.section,
      operation: a.operation as AgentAction['operation'],
      oldContent: a.old_content,
      status: 'proposed' as const
    }))

    return {
      inputType: 'commande',
      actions,
      summary: parsed.summary || `Fiche Wikipedia : ${wikiResult.title}`,
      response: parsed.response,
      sources: [wikiResult.url],
      conflicts: parsed.conflicts || [],
      ambiguities: parsed.ambiguities || [],
      suggestions: parsed.suggestions || []
    }
  }

}
