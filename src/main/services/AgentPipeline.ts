import matter from 'gray-matter'
import { FileService } from './FileService'
import { DatabaseService } from './DatabaseService'
import { GitService } from './GitService'
import { LLMService } from './LLMService'
import { buildSystemPrompt } from '../utils/promptBuilder'
import type { AgentResponse, AgentAction } from '../../shared/types'

interface RawAction {
  action?: string
  type?: string
  file?: string
  path?: string
  filename?: string
  filepath?: string
  content?: string
  section?: string
  operation?: string
  old_content?: string
}

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
  proposed_actions?: Array<{
    description: string
    action: RawAction
  }>
}

export class AgentPipeline {
  constructor(
    private fileService: FileService,
    private dbService: DatabaseService,
    private gitService: GitService,
    private llmService: LLMService,
    private basePath: string
  ) {}

  /**
   * Process user input: call LLM, parse response, return proposed actions.
   * Actions are NOT executed — they are proposals for the user to review.
   */
  async process(input: string): Promise<AgentResponse> {
    const contextFiles = await this.retrieveContext(input)

    const systemPrompt = buildSystemPrompt(
      this.dbService,
      this.fileService,
      contextFiles,
      this.basePath
    )

    const rawResponse = await this.llmService.sendMessage(
      [{ role: 'user', content: input }],
      systemPrompt
    )

    console.log('[AgentPipeline] Raw LLM response length:', rawResponse.length)

    const parsed = this.parseResponse(rawResponse)
    const normalizedActions = this.normalizeActions(parsed.actions || [])
    const inputType = parsed.input_type || parsed.type || 'question'

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

    return {
      inputType: inputType as AgentResponse['inputType'],
      actions,
      summary: parsed.summary || '',
      response: parsed.response,
      sources: parsed.sources,
      conflicts: parsed.conflicts || [],
      ambiguities: parsed.ambiguities || [],
      suggestions: parsed.suggestions || [],
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

    await this.reindexAll()

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

  // --- Compute modified content without writing to disk ---

  private computeModifiedContent(existingRaw: string, action: {
    content: string
    section?: string
    operation?: string
    oldContent?: string
    old_content?: string
  }): string {
    if (!existingRaw) return action.content

    const hasFrontmatter = existingRaw.trimStart().startsWith('---')
    const oldContent = action.oldContent || action.old_content
    const operation = action.operation?.toLowerCase()

    const parsed = matter(existingRaw)
    let body = parsed.content
    const data = parsed.data as Record<string, unknown>

    // --- Frontmatter modifications ---
    if (action.section?.startsWith('frontmatter.')) {
      const field = action.section.replace('frontmatter.', '')
      if (operation === 'add_item') {
        const current = (data[field] as string[]) || []
        const newItem = action.content.replace(/^"|"$/g, '')
        if (!current.includes(newItem)) current.push(newItem)
        data[field] = current
      } else {
        data[field] = action.content
      }
      data.modified = new Date().toISOString().split('T')[0]
      return hasFrontmatter ? matter.stringify(body, data) : body
    }

    // --- Body modifications ---

    // Explicit replace_line with old_content
    if (operation === 'replace_line' && oldContent) {
      body = body.replace(oldContent, action.content)
    }
    // Explicit full replace (only when explicitly requested)
    else if (operation === 'replace') {
      if (action.section && action.section !== 'root') {
        body = this.modifySection(body, action.section, action.content, 'replace')
      } else {
        body = action.content
      }
    }
    // Explicit prepend
    else if (operation === 'prepend') {
      if (action.section && action.section !== 'root') {
        body = this.modifySection(body, action.section, action.content, 'prepend')
      } else {
        body = action.content + '\n' + body
      }
    }
    // Section-targeted (append by default)
    else if (action.section && action.section !== 'root') {
      body = this.modifySection(body, action.section, action.content, operation || 'append')
    }
    // No section, no operation — SAFE APPEND only:
    // Strip frontmatter from incoming content, dedupe lines that already exist,
    // and append the rest. NEVER overwrites existing content.
    else {
      body = this.safeAppend(body, action.content)
    }

    if (hasFrontmatter) {
      data.modified = new Date().toISOString().split('T')[0]
      return matter.stringify(body, data)
    }
    return body.trimStart()
  }

  /**
   * Safe append: never overwrites. Strips frontmatter from incoming content,
   * dedupes any line that already exists in the body, and merges the remainder.
   *
   * If the new content contains headings matching existing ones, the lines under
   * each heading are appended under the corresponding existing section.
   * Otherwise the deduped remainder is appended at the end.
   */
  private safeAppend(existingBody: string, newContent: string): string {
    // Strip frontmatter from incoming content if present
    let clean = newContent
    if (clean.trimStart().startsWith('---')) {
      try {
        clean = matter(clean).content
      } catch { /* keep as-is */ }
    }
    clean = clean.trim()
    if (!clean) return existingBody

    // Build a set of trimmed non-empty lines already present in the body
    const existingLineSet = new Set(
      existingBody.split('\n').map((l) => l.trim()).filter(Boolean)
    )

    // Parse incoming content into sections by heading
    const lines = clean.split('\n')
    const sections: Array<{ heading: string | null; lines: string[] }> = []
    let current: { heading: string | null; lines: string[] } = { heading: null, lines: [] }
    for (const line of lines) {
      const headingMatch = line.match(/^(#{1,6})\s+(.+?)\s*$/)
      if (headingMatch) {
        if (current.lines.length || current.heading) sections.push(current)
        current = { heading: headingMatch[2].trim(), lines: [] }
      } else {
        current.lines.push(line)
      }
    }
    if (current.lines.length || current.heading) sections.push(current)

    let result = existingBody

    for (const sec of sections) {
      // Drop top-level H1 that just repeats an existing H1 (LLMs often re-emit it)
      if (sec.heading && /^#\s+/.test(`# ${sec.heading}`)) {
        const h1Existing = new RegExp(`^#\\s+${sec.heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'mi')
        if (h1Existing.test(result) && sec.lines.every((l) => !l.trim() || existingLineSet.has(l.trim()))) {
          continue
        }
      }

      // Dedupe: keep only lines that don't already exist in the body
      const dedupedLines: string[] = []
      for (const ln of sec.lines) {
        const t = ln.trim()
        if (!t) {
          dedupedLines.push(ln)
        } else if (!existingLineSet.has(t)) {
          dedupedLines.push(ln)
          existingLineSet.add(t)
        }
      }
      const addition = dedupedLines.join('\n').trim()
      if (!addition && !sec.heading) continue

      if (sec.heading) {
        // Look for an existing section with the same heading
        const sectionRegex = new RegExp(
          `^(#{1,6})\\s+${sec.heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`,
          'mi'
        )
        if (sectionRegex.test(result)) {
          if (addition) {
            result = this.modifySection(result, sec.heading, addition, 'append')
          }
        } else {
          // New section — append at the end
          result = result.trimEnd() + `\n\n## ${sec.heading}\n${addition}`.trimEnd()
          existingLineSet.add(`## ${sec.heading}`.trim())
        }
      } else if (addition) {
        // Loose lines with no heading — append to the end of the body
        result = result.trimEnd() + '\n\n' + addition
      }
    }

    return result
  }

  // --- Private methods ---

  private async reindexAll(): Promise<void> {
    const files = await this.fileService.listMarkdownFiles()
    for (const filePath of files) {
      try {
        const content = await this.fileService.readFile(filePath)
        if (content) this.dbService.indexFile(content)
      } catch (err) {
        console.error('[AgentPipeline] Failed to index', filePath, err)
      }
    }
  }

  private normalizeActions(rawActions: RawAction[]): Array<{
    action: string; file: string; content: string; section?: string; operation?: string; old_content?: string
  }> {
    return rawActions
      .map((a) => ({
        action: this.normalizeActionType(a.action || a.type || 'create'),
        file: a.file || a.path || a.filename || a.filepath || '',
        content: a.content || '',
        section: a.section,
        operation: a.operation,
        old_content: a.old_content
      }))
      .filter((a) => {
        if (!a.file) {
          console.warn('[AgentPipeline] Skipping action with missing file path:', a)
          return false
        }
        return true
      })
      .map((a) => {
        if (!a.file.endsWith('.md')) {
          a.file = `${a.file.replace(/[<>:"|?*]/g, '').replace(/\s+/g, '_')}.md`
        }
        if (!a.file.includes('/') && !a.file.includes('\\')) {
          const typeMatch = a.content.match(/type:\s*['"]?(personne|entreprise|domaine|projet|journal|note)['"]?/i)
          if (typeMatch) {
            const typeToDir: Record<string, string> = {
              personne: 'Reseau', entreprise: 'Entreprises', domaine: 'Domaines',
              projet: 'Projets', journal: 'Journal', note: 'Journal'
            }
            a.file = `${typeToDir[typeMatch[1].toLowerCase()] || 'Journal'}/${a.file}`
          }
        }
        return a
      })
  }

  private normalizeActionType(action: string): string {
    const lower = action.toLowerCase().trim()
    if (['create', 'créer', 'creer', 'new', 'add', 'create_file'].includes(lower)) return 'create'
    if (['modify', 'modifier', 'update', 'edit', 'append', 'modify_file', 'change'].includes(lower)) return 'modify'
    return lower
  }

  private async retrieveContext(input: string): Promise<string> {
    const results = this.dbService.search(input)
    const contextParts: string[] = []
    for (const result of results.slice(0, 8)) {
      if (!result.path) continue
      try {
        const content = await this.fileService.readFile(result.path)
        if (content) contextParts.push(`--- ${result.path} ---\n${content.raw}`)
      } catch { /* skip */ }
    }
    return contextParts.join('\n\n') || 'Aucun fichier pertinent trouve.'
  }

  private parseResponse(raw: string): RawAgentResponse {
    try { return JSON.parse(raw) } catch { /* continue */ }
    const codeBlockMatch = raw.match(/```(?:json)?\s*\n?([\s\S]*?)```/)
    if (codeBlockMatch) { try { return JSON.parse(codeBlockMatch[1]) } catch { /* continue */ } }
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (jsonMatch) { try { return JSON.parse(jsonMatch[0]) } catch { /* continue */ } }
    return { input_type: 'question', actions: [], response: raw, conflicts: [], ambiguities: [], suggestions: [] }
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

  private modifySection(body: string, sectionName: string, content: string, operation: string): string {
    const lines = body.split('\n')
    const sectionClean = sectionName.replace(/^#+\s*/, '')
    let sectionStart = -1, sectionLevel = 0
    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].match(/^(#{1,6})\s+(.+)$/)
      if (match && match[2].trim().toLowerCase() === sectionClean.toLowerCase()) {
        sectionStart = i; sectionLevel = match[1].length; break
      }
    }
    if (sectionStart === -1) return body + `\n\n## ${sectionClean}\n${content}`
    let sectionEnd = lines.length
    for (let i = sectionStart + 1; i < lines.length; i++) {
      const match = lines[i].match(/^(#{1,6})\s+/)
      if (match && match[1].length <= sectionLevel) { sectionEnd = i; break }
    }
    if (operation === 'prepend') lines.splice(sectionStart + 1, 0, content)
    else if (operation === 'replace') lines.splice(sectionStart + 1, sectionEnd - sectionStart - 1, content)
    else lines.splice(sectionEnd, 0, content)
    return lines.join('\n')
  }
}
