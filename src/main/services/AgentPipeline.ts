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
    if (action.action === 'create') {
      return { before: '', after: action.content }
    }

    const existing = await this.fileService.readFile(action.file)
    const before = existing?.raw || ''
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
    // No section, no operation — smart append:
    // Try to merge by detecting sections in the new content and appending under matching sections
    else {
      body = this.smartMerge(body, action.content)
    }

    if (hasFrontmatter) {
      data.modified = new Date().toISOString().split('T')[0]
      return matter.stringify(body, data)
    }
    return body.trimStart()
  }

  /**
   * Smart merge: if the new content has sections that already exist in the body,
   * append new lines under those existing sections. Otherwise, append at the end.
   */
  private smartMerge(existingBody: string, newContent: string): string {
    const newLines = newContent.split('\n')
    let result = existingBody

    // Check if new content has section headings that match existing ones
    const newSections: Array<{ heading: string; content: string[] }> = []
    let currentHeading: string | null = null
    let currentContent: string[] = []

    for (const line of newLines) {
      const headingMatch = line.match(/^(#{1,6})\s+(.+)$/)
      if (headingMatch) {
        if (currentHeading) {
          newSections.push({ heading: currentHeading, content: currentContent })
        }
        currentHeading = headingMatch[2].trim()
        currentContent = []
      } else if (currentHeading) {
        currentContent.push(line)
      }
    }
    if (currentHeading) {
      newSections.push({ heading: currentHeading, content: currentContent })
    }

    if (newSections.length > 0) {
      // Merge each section's content into existing body
      let merged = false
      for (const sec of newSections) {
        const contentToAdd = sec.content.join('\n').trim()
        if (!contentToAdd) continue

        // Check if this section exists in the existing body
        const sectionRegex = new RegExp(`^(#{1,6})\\s+${sec.heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'mi')
        if (sectionRegex.test(result)) {
          // Section exists — append content under it
          result = this.modifySection(result, sec.heading, contentToAdd, 'append')
          merged = true
        } else {
          // Section doesn't exist — append the whole section at the end
          result = result.trimEnd() + `\n\n## ${sec.heading}\n${contentToAdd}`
          merged = true
        }
      }
      if (merged) return result
    }

    // No sections detected in new content — just append at the end
    // But avoid duplicating content that already exists
    const trimmedNew = newContent.trim()
    if (trimmedNew && !existingBody.includes(trimmedNew)) {
      result = existingBody.trimEnd() + '\n\n' + trimmedNew
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
          await this.fileService.writeFile(action.file, action.content)
        } else if (action.action === 'modify') {
          await this.applyModification(action)
        } else {
          await this.fileService.writeFile(action.file, action.content)
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
