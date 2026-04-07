// ============================================================
// Shared types between main process and renderer
// ============================================================

// --- File system ---

export interface CortxFile {
  path: string
  type: 'personne' | 'entreprise' | 'domaine' | 'projet' | 'journal' | 'note'
  title: string
  tags: string[]
  created: string
  modified: string
  related: string[]
  status: 'actif' | 'archivé' | 'brouillon'
}

export interface FileContent {
  path: string
  frontmatter: Record<string, unknown>
  body: string
  raw: string
}

// --- Entities & Relations ---

export interface Entity {
  id: number
  name: string
  type: 'personne' | 'entreprise' | 'domaine' | 'projet' | 'note' | 'journal'
  filePath: string
  aliases: string[]
}

export interface Relation {
  id: number
  sourceEntityId: number
  targetEntityId: number
  relationType: string
  sourceFile: string
}

// --- Graph ---

export interface GraphNode {
  id: string
  label: string
  type: 'personne' | 'entreprise' | 'domaine' | 'projet' | 'note' | 'journal'
  filePath: string
}

export interface GraphEdge {
  source: string
  target: string
  label: string
}

export interface GraphData {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

// --- Agent ---

export type InputType = 'capture' | 'question' | 'commande' | 'réflexion'

export interface AgentAction {
  id: string
  action: 'create' | 'modify'
  file: string
  content: string
  section?: string
  operation?: 'append' | 'prepend' | 'replace_line' | 'add_item'
  oldContent?: string
  status: 'proposed' | 'pending' | 'validated' | 'undone' | 'rejected'
}

export interface AgentResponse {
  inputType: InputType
  actions: AgentAction[]
  summary: string
  response?: string
  sources?: string[]
  conflicts: string[]
  ambiguities: string[]
  suggestions: string[]
  proposedActions?: Array<{
    description: string
    action: AgentAction
  }>
  commitHash?: string
}

export interface Fiche {
  path: string
  subject: string
  kind: string
  created: string
  excerpt: string
}

export interface AgentLogEntry {
  id: number
  timestamp: string
  inputText: string
  inputType: InputType
  actionsJson: string
  commitHash: string
  status: 'success' | 'error' | 'partial'
}

// --- Chat ---

export interface ChatMessage {
  id: string
  role: 'user' | 'agent'
  content: string
  timestamp: string
  agentResponse?: AgentResponse
}

// --- LLM Config ---

export interface LLMConfig {
  provider: 'anthropic' | 'openai-compatible'
  apiKey: string
  model: string
  baseUrl?: string
}

// --- App Config ---

export interface AppConfig {
  basePath: string
  llm: LLMConfig
  validationMode: 'always' | 'creations-only' | 'automatic'
}

// --- IPC API surface ---

export interface CortxAPI {
  db: {
    getFiles(): Promise<CortxFile[]>
    getEntities(): Promise<Entity[]>
    getRelations(): Promise<Relation[]>
    search(query: string): Promise<CortxFile[]>
    getGraphData(): Promise<GraphData>
    getTags(): Promise<Array<{ tag: string; count: number }>>
  }
  files: {
    read(path: string): Promise<FileContent>
    write(path: string, content: string): Promise<void>
    list(dir?: string): Promise<string[]>
    exists(path: string): Promise<boolean>
  }
  llm: {
    send(messages: Array<{ role: string; content: string }>, systemPrompt?: string): Promise<string>
    getConfig(): Promise<LLMConfig>
    setConfig(config: LLMConfig): Promise<void>
  }
  git: {
    commit(message: string): Promise<string>
    revert(hash: string): Promise<void>
    log(count?: number): Promise<Array<{ hash: string; message: string; date: string }>>
    status(): Promise<string[]>
  }
  agent: {
    process(input: string): Promise<AgentResponse>
    execute(actions: AgentAction[], summary: string): Promise<string>
    preview(action: AgentAction): Promise<{ before: string; after: string }>
    undo(commitHash: string): Promise<void>
    saveManualEdit(filePath: string, content: string): Promise<string>
    saveBrief(subject: string, body: string, kind?: string): Promise<string>
    listFiches(): Promise<Fiche[]>
    deleteFiche(filePath: string): Promise<void>
  }
  app: {
    getBasePath(): Promise<string>
    setBasePath(path: string): Promise<void>
    openDirectoryDialog(): Promise<string | null>
    getConfig(): Promise<AppConfig>
    setConfig(config: Partial<AppConfig>): Promise<void>
    resetBase(): Promise<void>
  }
  on(channel: string, callback: (...args: unknown[]) => void): void
  off(channel: string, callback: (...args: unknown[]) => void): void
}
