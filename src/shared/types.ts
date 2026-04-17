// ============================================================
// Shared types between main process and renderer
// ============================================================

// --- File system ---

export type EntityType = 'personne' | 'entreprise' | 'domaine' | 'projet' | 'journal' | 'note'

export interface CortxFile {
  path: string
  type: EntityType
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
  type: 'personne' | 'entreprise' | 'domaine' | 'projet' | 'note' | 'journal' | 'document'
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

export interface AgentClarification {
  question: string
  options: string[]
  /** Index of the option chosen by the user; undefined while pending */
  answeredIndex?: number
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
  /** Optional clarification: when present, the agent is asking the user to choose */
  clarification?: AgentClarification
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
  provider: 'anthropic' | 'openai-compatible' | 'google-ai'
  apiKey: string
  model: string
  baseUrl?: string
}

// --- App Config ---

export type AppLanguage = 'fr' | 'en'

export interface AppConfig {
  basePath: string
  llm: LLMConfig
  validationMode: 'always' | 'creations-only' | 'automatic'
  language: AppLanguage
}

// --- Library ---

export type LibraryDocumentStatus = 'pending' | 'extracting' | 'indexed' | 'error'

export interface LibraryDocument {
  id: string
  /** Path relative to Bibliotheque/ */
  path: string
  filename: string
  mimeType: string | null
  size: number | null
  title: string | null
  author: string | null
  pageCount: number | null
  summary: string | null
  tags: string[]
  addedAt: string
  indexedAt: string | null
  status: LibraryDocumentStatus
  errorMessage?: string
}

export interface LibraryChunkResult {
  chunkId: number
  documentId: string
  documentTitle: string | null
  documentPath: string
  heading: string | null
  text: string
  pageFrom: number | null
  pageTo: number | null
  /** FTS rank or cosine similarity score */
  score: number
}

export interface LibrarySearchResult {
  document: LibraryDocument
  chunks: LibraryChunkResult[]
}

export interface LibraryIngestProgress {
  documentId: string
  filename: string
  stage: 'copying' | 'extracting' | 'chunking' | 'embedding' | 'linking' | 'done' | 'error'
  message?: string
}

// --- Idle Mode ---

export interface IdleInsight {
  id: string
  timestamp: string
  entityIds: string[]
  entityNames: string[]
  edgeKeys: string[]
  content: string
  confidence: number
  category: 'hidden_connection' | 'pattern' | 'contradiction' | 'gap' | 'cluster' | 'opportunity' | 'development'
  status: 'new' | 'dismissed' | 'saved'
}

export interface IdleAttempt {
  id: string
  timestamp: string
  entityNames: string[]
  strategy: string
  result: 'none' | 'draft' | 'insight'
  category?: IdleInsight['category']
  snippet?: string        // first ~70 chars of content if draft/insight
  webEnriched?: boolean   // true if DuckDuckGo search was used
}

export interface IdleExplorationEvent {
  phase: 'selecting' | 'examining' | 'thinking' | 'insight' | 'resting'
  activeNodeIds: string[]
  activeEdgeKeys: string[]
  /** Short description of what the agent is currently searching for */
  currentThought?: string
  /** Number of draft insights accumulated (not yet promoted) */
  draftCount?: number
  insight?: IdleInsight
  /** Result of the just-completed cycle, emitted on transition to resting */
  lastAttempt?: IdleAttempt
}

export interface IdleConfig {
  intervalSeconds: number
  confidenceThreshold: number
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
    openMarkdownDialog(): Promise<{ path: string; filename: string; content: string } | null>
    readExternal(absolutePath: string): Promise<{ path: string; filename: string; content: string } | null>
    create(type: EntityType, title: string): Promise<{ path: string }>
    updateTitle(filePath: string, newTitle: string): Promise<{ updatedLinks: number }>
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
    processStream(input: string, requestId: string): Promise<AgentResponse>
    execute(actions: AgentAction[], summary: string): Promise<string>
    preview(action: AgentAction): Promise<{ before: string; after: string }>
    undo(commitHash: string): Promise<void>
    saveManualEdit(filePath: string, content: string): Promise<string>
    saveBrief(subject: string, body: string, kind?: string): Promise<string>
    listFiches(): Promise<Fiche[]>
    deleteFiche(filePath: string): Promise<void>
    rewriteFile(filePath: string): Promise<string>
    deleteFile(filePath: string): Promise<void>
    wikiToMd(topic: string, lang?: string): Promise<AgentResponse>
  }
  app: {
    getBasePath(): Promise<string>
    setBasePath(path: string): Promise<void>
    openDirectoryDialog(): Promise<string | null>
    getConfig(): Promise<AppConfig>
    setConfig(config: Partial<AppConfig>): Promise<void>
    resetBase(): Promise<void>
  }
  library: {
    ingest(absolutePath: string): Promise<LibraryDocument>
    ingestMany(absolutePaths: string[]): Promise<LibraryDocument[]>
    list(folder?: string): Promise<LibraryDocument[]>
    get(id: string): Promise<LibraryDocument | null>
    delete(id: string): Promise<void>
    rename(id: string, newFilename: string): Promise<void>
    getPreview(id: string): Promise<{ markdown: string; pageCount: number | null }>
    openOriginal(id: string): Promise<void>
    search(query: string, mode?: 'lexical' | 'semantic' | 'hybrid', limit?: number): Promise<LibraryChunkResult[]>
    getLinkedContext(ref: string, contextQuery: string, limit?: number): Promise<LibraryChunkResult[]>
    reindexAll(): Promise<{ added: number; updated: number; removed: number }>
    getStatus(): Promise<{ sidecarReady: boolean; queueLength: number }>
    openImportDialog(): Promise<string[]>
  }
  idle: {
    start(): Promise<void>
    stop(): Promise<void>
    pause(): Promise<void>
    resume(): Promise<void>
    getInsights(): Promise<IdleInsight[]>
    dismissInsight(id: string): Promise<void>
    saveInsightAsFiche(id: string): Promise<string>
    getConfig(): Promise<IdleConfig>
    setConfig(config: Partial<IdleConfig>): Promise<void>
  }
  on(channel: string, callback: (...args: unknown[]) => void): void
  off(channel: string, callback: (...args: unknown[]) => void): void
}
