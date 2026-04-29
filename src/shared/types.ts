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
  snippet?: string
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

// --- Agent streaming events (live UI) ---

export type AgentPhase =
  | 'retrieving'     // KB + library context search
  | 'fetching-web'   // web directive fetch in progress
  | 'thinking'       // LLM call started, waiting for first token
  | 'writing'        // LLM streaming tokens
  | 'proposing'      // parse + normalize actions
  | 'done'
  | 'error'

export interface WebFetchEvent {
  id: string
  kind: 'wikipedia' | 'url' | 'search'
  label: string
  url?: string
  status: 'pending' | 'done' | 'error'
  chars?: number
  resultCount?: number
  errorMessage?: string
}

export interface PartialAction {
  /** Stable index in the actions[] array of the streaming response */
  index: number
  action?: 'create' | 'modify'
  file?: string
  /** Content accumulated so far — may be incomplete */
  content?: string
  /** True once the JSON closing brace for this action has been parsed */
  complete: boolean
}

export type StreamEvent =
  | { kind: 'phase'; phase: AgentPhase; detail?: string }
  | { kind: 'delta'; text: string }
  | { kind: 'web-fetch'; fetch: WebFetchEvent }
  | { kind: 'partial-action'; action: PartialAction }
  | { kind: 'done' }
  | { kind: 'error'; message: string }

// --- Chat ---

export interface ChatMessage {
  id: string
  role: 'user' | 'agent'
  content: string
  timestamp: string
  agentResponse?: AgentResponse
  /** Message originated from a Telegram user */
  telegramSource?: boolean
  /** Agent reply was forwarded to Telegram */
  telegramReplied?: boolean
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

export interface TelegramConfig {
  token: string
  allowedChatIds: number[]
  enabled: boolean
}

export interface TelegramReplyData {
  inputType: InputType
  summary: string
  response?: string
  sources?: string[]
  actions: Array<{ action: 'create' | 'modify'; file: string }>
}

export interface AppConfig {
  basePath: string
  llm: LLMConfig
  validationMode: 'always' | 'creations-only' | 'automatic'
  language: AppLanguage
  telegram?: TelegramConfig
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
  fullContent?: string    // full LLM output (even if below confidence threshold)
  webEnriched?: boolean   // true if DuckDuckGo search was used
}

export interface IdleDraft {
  id: string
  content: string
  confidence: number
  category: IdleInsight['category']
  entityNames: string[]
  entityIds: string[]
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

// --- Timeline ---

export interface TimelineEntry {
  id: string
  timestamp: string
  kind: 'agent' | 'journal'
  title: string
  body: string
  commitHash?: string
  status?: string
  filePath?: string
  inputType?: string
  actionCount?: number
  actionVerbs?: string[]
}

// --- Galaxy (cosmic view of the KB) ---

export interface GalaxyNode {
  id: string
  label: string
  type: 'personne' | 'entreprise' | 'domaine' | 'projet' | 'note' | 'journal'
  filePath: string
  degree: number
  clusterId: number
  modifiedAt: string
  createdAt: string
}

export interface GalaxyEdge {
  source: string
  target: string
  label: string
  createdAt: string
}

export interface GalaxyCluster {
  id: number
  /** Default label = name of the most-connected member (unique per cluster) */
  label: string
  /** Human-readable category of the dominant entity type (e.g. "Entreprises") */
  typeLabel: string
  /** User override label, persisted to galaxy-clusters.json */
  customLabel: string | null
  color: string
  memberIds: string[]
  /** Fraction of members modified in last 90 days */
  activity: number
}

export interface GalaxyComet {
  id: string
  label: string
  filePath: string
  addedAt: string
  targetEntityIds: string[]
}

export interface GalaxyConstellation {
  filePath: string
  label: string
  createdAt: string
  entityIds: string[]
}

export interface GalaxyData {
  nodes: GalaxyNode[]
  edges: GalaxyEdge[]
  clusters: GalaxyCluster[]
  comets: GalaxyComet[]
  constellations: GalaxyConstellation[]
  timeRange: { min: string; max: string }
}

// --- Implicit backlinks ---

export interface ImplicitBacklink {
  path: string
  title: string
  type: string
  score: number
}

// --- Spatial Canvas ---

export type CanvasNodeKind = 'entity' | 'note' | 'group'
export type CanvasEdgeKind = 'relation' | 'freeform'
export type StickyColor = 'teal' | 'orange' | 'purple' | 'blue' | 'pink' | 'neutral'

export interface CanvasNode {
  id: string
  kind: CanvasNodeKind
  position: { x: number; y: number }
  width?: number
  height?: number
  data: {
    /** Entity nodes: KB file path */
    filePath?: string
    /** Entity nodes: resolved title */
    title?: string
    /** Entity nodes: entity type (personne/entreprise/domaine/projet/note/journal) */
    entityType?: string
    /** Entity nodes: tags snapshot */
    tags?: string[]
    /** Note/group nodes: body text */
    text?: string
    /** Note/group nodes: pastel color key */
    color?: StickyColor
  }
}

export type CanvasLineStyle = 'solid' | 'dashed' | 'dotted'
export type CanvasArrow    = 'forward' | 'backward' | 'both' | 'none'

export interface CanvasEdge {
  id: string
  source: string
  target: string
  sourceHandle?: string | null
  targetHandle?: string | null
  label?: string
  kind?: CanvasEdgeKind
  lineStyle?: CanvasLineStyle
  arrow?: CanvasArrow
}

export interface CanvasViewport {
  x: number
  y: number
  zoom: number
}

export interface CanvasConfig {
  id: string
  name: string
  description?: string
  created: string
  modified: string
  nodes: CanvasNode[]
  edges: CanvasEdge[]
  viewport?: CanvasViewport
}

export interface CanvasSummary {
  id: string
  name: string
  description?: string
  created: string
  modified: string
  nodeCount: number
  edgeCount: number
}

export interface AgentCanvasSuggestion {
  nodes: CanvasNode[]
  edges: CanvasEdge[]
  /** Short text shown to user explaining the suggestion */
  summary: string
  /** Diagnostic info shown when nodes is empty — helps debug without DevTools */
  _debug?: string
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
    getFilesByTag(tag: string): Promise<CortxFile[]>
    getImplicitBacklinks(filePath: string, limit?: number, threshold?: number): Promise<ImplicitBacklink[]>
    getTimeline(limit?: number): Promise<TimelineEntry[]>
  }
  canvas: {
    list(): Promise<CanvasSummary[]>
    load(id: string): Promise<CanvasConfig | null>
    save(config: CanvasConfig): Promise<void>
    create(name: string): Promise<CanvasConfig>
    delete(id: string): Promise<void>
    rename(id: string, newName: string): Promise<void>
    agentSuggest(canvasId: string, prompt: string, useInternet?: boolean): Promise<AgentCanvasSuggestion>
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
    export(format: 'html' | 'json'): Promise<{ success: boolean; path?: string; error?: string }>
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
    previewWebContext(input: string): Promise<string>
    importRawMarkdown(filename: string, content: string): Promise<{ path: string }>
  }
  app: {
    getBasePath(): Promise<string>
    setBasePath(path: string): Promise<void>
    openDirectoryDialog(): Promise<string | null>
    getConfig(): Promise<AppConfig>
    setConfig(config: Partial<AppConfig>): Promise<void>
    resetBase(): Promise<void>
    openExternal(url: string): Promise<void>
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
  galaxy: {
    getData(): Promise<GalaxyData>
    renameCluster(topMemberLabel: string, newLabel: string): Promise<void>
  }
  idle: {
    start(): Promise<void>
    stop(): Promise<void>
    pause(): Promise<void>
    resume(): Promise<void>
    getInsights(): Promise<IdleInsight[]>
    getDraftInsights(): Promise<IdleDraft[]>
    dismissInsight(id: string): Promise<void>
    saveInsightAsFiche(id: string): Promise<string>
    promoteDraft(id: string): Promise<IdleInsight | null>
    getConfig(): Promise<IdleConfig>
    setConfig(config: Partial<IdleConfig>): Promise<void>
  }
  telegram: {
    getStatus(): Promise<{ running: boolean }>
    setConfig(partial: Partial<TelegramConfig>): Promise<void>
    sendReply(chatId: number, chatMessageId: string, data: TelegramReplyData): Promise<void>
    notifyExecuted(chatId: number, chatMessageId: string, commitHash: string, files: string[]): Promise<void>
    notifyRejected(chatId: number, chatMessageId: string): Promise<void>
  }
  on(channel: string, callback: (...args: unknown[]) => void): void
  off(channel: string, callback: (...args: unknown[]) => void): void
}
