import { app, BrowserWindow, ipcMain, dialog, shell, net } from 'electron'
import { join, resolve, parse, isAbsolute } from 'path'
import * as fs from 'fs'
import { registerDatabaseHandlers } from './ipc/database'
import { registerFileHandlers } from './ipc/files'
import { registerLLMHandlers } from './ipc/llm'
import { registerGitHandlers } from './ipc/git'
import { registerAgentHandlers, setIdleServiceForAgent } from './ipc/agent'
import { registerLibraryHandlers } from './ipc/library'
import { registerIdleHandlers } from './ipc/idle'
import { registerCanvasHandlers } from './ipc/canvas'
import { registerGalaxyHandlers } from './ipc/galaxy'
import { registerTelegramHandlers } from './ipc/telegram'
import { DatabaseService } from './services/DatabaseService'
import { FileService } from './services/FileService'
import { GitService } from './services/GitService'
import { LLMService } from './services/LLMService'
import { AgentPipeline } from './services/AgentPipeline'
import { IdleService } from './services/IdleService'
import { CanvasService } from './services/CanvasService'
import { ExportService } from './services/ExportService'
import { GalaxyService } from './services/GalaxyService'
import { TelegramService } from './services/TelegramService'
import { libraryService } from './services/LibraryService'
import { pythonSidecar } from './services/PythonSidecar'
import type { AppConfig } from '../shared/types'

let mainWindow: BrowserWindow | null = null

// --- Update check ---

function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

async function checkForUpdates(): Promise<void> {
  try {
    const res = await net.fetch('https://api.github.com/repos/gcorman/CortX/releases/latest', {
      headers: { 'User-Agent': 'CortX-App' }
    })
    if (!res.ok) return
    const data = await res.json() as { tag_name: string; html_url: string }
    const latest = data.tag_name.replace(/^v/, '')
    const current = app.getVersion()
    if (compareVersions(latest, current) > 0) {
      mainWindow?.webContents.send('app:updateAvailable', { version: latest, url: data.html_url })
    }
  } catch {
    // Network unavailable — silently skip
  }
}

// --- Config persistence ---

const configPath = join(app.getPath('userData'), 'cortx-config.json')
const defaultBasePath = join(app.getPath('documents'), 'CortX-Base')

function isDriveRootPath(input: string): boolean {
  return /^[A-Za-z]:[\\/]?$/.test(input.trim())
}

function normalizeBasePath(input: string): string {
  const trimmed = input.trim()
  if (!trimmed) {
    throw new Error('Le dossier de la base de connaissances ne peut pas être vide.')
  }
  if (!isAbsolute(trimmed) || isDriveRootPath(trimmed)) {
    throw new Error('Choisissez un dossier précis, pas la racine du disque.')
  }

  const normalized = resolve(trimmed)
  if (normalized === parse(normalized).root) {
    throw new Error('Choisissez un dossier précis, pas la racine du disque.')
  }

  return normalized
}

function resolveConfiguredBasePath(basePath: string | undefined, fallback: string): string {
  if (!basePath?.trim()) {
    return fallback
  }

  try {
    return normalizeBasePath(basePath)
  } catch (err) {
    console.warn('[Config] Invalid basePath, falling back to default:', err)
    return fallback
  }
}

function loadConfig(): AppConfig {
  const defaults: AppConfig = {
    basePath: defaultBasePath,
    llm: {
      provider: 'anthropic',
      apiKey: '',
      model: 'claude-sonnet-4-20250514'
    },
    validationMode: 'always',
    language: 'fr'
  }

  try {
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, 'utf-8')
      const saved = JSON.parse(raw) as Partial<AppConfig>
      return {
        basePath: resolveConfiguredBasePath(saved.basePath, defaults.basePath),
        llm: {
          provider: saved.llm?.provider || defaults.llm.provider,
          apiKey: saved.llm?.apiKey || defaults.llm.apiKey,
          model: saved.llm?.model || defaults.llm.model,
          baseUrl: saved.llm?.baseUrl
        },
        validationMode: saved.validationMode || defaults.validationMode,
        language: saved.language || defaults.language,
        telegram: saved.telegram
      }
    }
  } catch (err) {
    console.error('[Config] Failed to load config:', err)
  }

  return defaults
}

function saveConfig(config: AppConfig): void {
  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8')
  } catch (err) {
    console.error('[Config] Failed to save config:', err)
  }
}

const config = loadConfig()

// Services (initialized after app ready)
let dbService: DatabaseService
let fileService: FileService
let gitService: GitService
let llmService: LLMService
let agentPipeline: AgentPipeline
let idleService: IdleService
let canvasService: CanvasService
let exportService: ExportService
let galaxyService: GalaxyService
let telegramService: TelegramService

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0F172A',
    ...(process.platform === 'darwin' ? { titleBarStyle: 'hiddenInset' as const, frame: false } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  // Open DevTools in dev mode
  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.webContents.openDevTools({ mode: 'detach' })
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

async function initializeServices(): Promise<void> {
  config.basePath = normalizeBasePath(config.basePath)

  fileService = new FileService(config.basePath)
  await fileService.ensureBaseStructure()

  dbService = new DatabaseService(join(config.basePath, '_System', 'cortx.db'))
  dbService.initialize()

  gitService = new GitService(config.basePath)
  await gitService.initialize()

  llmService = new LLMService(config.llm)

  agentPipeline = new AgentPipeline(
    fileService,
    dbService,
    gitService,
    llmService,
    config.basePath,
    config.language,
    () => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('db:changed') }
  )

  // Initialise library service (creates Bibliotheque/ if needed)
  libraryService.initialize(dbService.getDb(), config.basePath)

  // Initialise idle service
  idleService = new IdleService(dbService, fileService, llmService, config.basePath, config.language)

  // Canvas service (spatial canvas persistence + agent-suggest)
  canvasService = new CanvasService(config.basePath, dbService, llmService)

  exportService = new ExportService(fileService, config.basePath)

  galaxyService = new GalaxyService(dbService, fileService, config.basePath)

  const notifyRenderer = (): void => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('db:changed')
  }
  telegramService = new TelegramService(
    config.telegram ?? { token: '', allowedChatIds: [], enabled: false },
    () => agentPipeline,
    notifyRenderer
  )
  if (config.telegram?.enabled && config.telegram.token) {
    await telegramService.start()
  }

  // Index existing files
  await indexAllFiles()
}

async function indexAllFiles(): Promise<void> {
  const files = await fileService.listMarkdownFiles()
  for (const filePath of files) {
    try {
      const content = await fileService.readFile(filePath)
      if (content) {
        dbService.indexFile(content)
      }
    } catch {
      // Skip files that fail to parse
    }
  }
}

// ── File-system watcher ───────────────────────────────────────────────────────
// Reindex any .md that changes outside of the agent (manual edits, external tools)
// and push a 'db:changed' event so the renderer refreshes the graph + file list.

let fsWatcher: fs.FSWatcher | null = null
let reindexTimer: ReturnType<typeof setTimeout> | null = null

function startFileWatcher(basePath: string): void {
  if (fsWatcher) { fsWatcher.close(); fsWatcher = null }

  try {
    fsWatcher = fs.watch(basePath, { recursive: true }, (_event, filename) => {
      if (!filename) return
      // Only care about .md files outside _System/ and Bibliotheque/
      if (!filename.endsWith('.md')) return
      if (filename.startsWith('_System') || filename.startsWith('Bibliotheque')) return

      // Debounce: coalesce rapid saves (editors write multiple times) into one reindex
      if (reindexTimer) clearTimeout(reindexTimer)
      reindexTimer = setTimeout(async () => {
        reindexTimer = null
        try {
          await indexAllFiles()
          // Notify renderer so graph + file list refresh immediately
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('db:changed')
          }
        } catch (err) {
          console.error('[FileWatcher] reindex error:', err)
        }
      }, 800)
    })
  } catch (err) {
    // fs.watch recursive not supported on all platforms — silently skip
    console.warn('[FileWatcher] Could not start watcher:', err)
  }
}

function registerAppHandlers(): void {
  ipcMain.handle('app:getBasePath', () => config.basePath)

  ipcMain.handle('app:setBasePath', async (_event, path: string) => {
    const normalizedPath = normalizeBasePath(path)
    config.basePath = normalizedPath
    saveConfig(config)
    fileService = new FileService(normalizedPath)
    await fileService.ensureBaseStructure()
    dbService = new DatabaseService(join(normalizedPath, '_System', 'cortx.db'))
    dbService.initialize()
    gitService = new GitService(normalizedPath)
    await gitService.initialize()
    agentPipeline = new AgentPipeline(fileService, dbService, gitService, llmService, normalizedPath, config.language)
    canvasService = new CanvasService(normalizedPath, dbService, llmService)
    galaxyService = new GalaxyService(dbService, fileService, normalizedPath)
    await indexAllFiles()
    startFileWatcher(normalizedPath)
  })

  ipcMain.handle('app:openDirectoryDialog', async () => {
    if (!mainWindow) return null
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory', 'createDirectory']
    })
    return result.canceled ? null : result.filePaths[0]
  })

  // API key masking: the real key lives only in config (in-memory) and in
  // cortx-config.json on disk (plain-text — keep that file out of version control).
  // The renderer receives '***' so it can't read the key; on save it sends '***'
  // back and setConfig below preserves the real key unchanged.
  ipcMain.handle('app:getConfig', () => ({
    ...config,
    llm: { ...config.llm, apiKey: config.llm.apiKey ? '***' : '' },
    telegram: config.telegram
      ? { ...config.telegram, token: config.telegram.token ? '***' : '' }
      : undefined
  }))

  ipcMain.handle('app:resetBase', async () => {
    const basePath = normalizeBasePath(config.basePath)
    const dbPath = join(basePath, '_System', 'cortx.db')

    // Close DB before wiping it
    try { dbService.close() } catch { /* ignore */ }

    // Delete everything inside basePath except _System (we'll clear the DB files separately)
    if (fs.existsSync(basePath)) {
      for (const entry of fs.readdirSync(basePath)) {
        if (entry === '_System') continue
        const fullPath = join(basePath, entry)
        try {
          fs.rmSync(fullPath, { recursive: true, force: true })
        } catch (err) {
          console.error('[Reset] Failed to remove', fullPath, err)
        }
      }
    }

    // Remove the SQLite DB files inside _System
    for (const p of [dbPath, dbPath + '-wal', dbPath + '-shm']) {
      try { if (fs.existsSync(p)) fs.unlinkSync(p) } catch { /* ignore */ }
    }

    // Reinitialise all services (IPC handlers use getters so they pick up new instances)
    fileService = new FileService(basePath)
    await fileService.ensureBaseStructure()
    dbService = new DatabaseService(dbPath)
    dbService.initialize()
    gitService = new GitService(basePath)
    await gitService.initialize()
    agentPipeline = new AgentPipeline(fileService, dbService, gitService, llmService, basePath, config.language)
    canvasService = new CanvasService(basePath, dbService, llmService)

    console.log('[Reset] Base de connaissances réinitialisée')
  })

  ipcMain.handle('app:openExternal', (_event, url: string) => {
    if (url.startsWith('https://') || url.startsWith('http://')) {
      shell.openExternal(url)
    }
  })

  ipcMain.handle('app:setConfig', (_event, partial: Partial<AppConfig>) => {
    if (partial.llm) {
      // '***' = masked placeholder from renderer; '' = field left blank — both preserve existing key
      if (partial.llm.apiKey === '***' || partial.llm.apiKey === '') {
        partial.llm.apiKey = config.llm.apiKey
      }
      Object.assign(config.llm, partial.llm)
      llmService.updateConfig(config.llm)
    }
    if (partial.validationMode) {
      config.validationMode = partial.validationMode
    }
    if (partial.language) {
      config.language = partial.language
      agentPipeline.setLanguage(config.language)
      idleService.setLanguage(config.language)
    }
    if (partial.telegram) {
      // Preserve real token when renderer sends '***' placeholder
      const incoming = partial.telegram
      if (incoming.token === '***' || incoming.token === '') {
        incoming.token = config.telegram?.token ?? ''
      }
      config.telegram = { ...(config.telegram ?? { token: '', allowedChatIds: [], enabled: false }), ...incoming }
      void telegramService.updateConfig(config.telegram)
    }
    saveConfig(config)
  })
}

app.whenReady().then(async () => {
  await initializeServices()
  startFileWatcher(config.basePath)

  registerAppHandlers()
  registerDatabaseHandlers(() => dbService)
  registerFileHandlers(() => fileService, () => dbService, () => exportService)
  registerLLMHandlers(llmService)
  registerGitHandlers(() => gitService)
  registerAgentHandlers(() => agentPipeline)
  registerLibraryHandlers(() => libraryService, () => mainWindow)
  registerIdleHandlers(() => idleService, () => agentPipeline)
  registerCanvasHandlers(() => canvasService)
  registerGalaxyHandlers(() => galaxyService)
  registerTelegramHandlers(() => telegramService)
  setIdleServiceForAgent(idleService)

  createWindow()
  // Give IdleService and TelegramService access to the main window for IPC events
  if (mainWindow) idleService.setWindow(mainWindow)
  telegramService.setWindow(mainWindow)

  // Check for new GitHub release after window is ready
  mainWindow?.webContents.once('did-finish-load', () => {
    setTimeout(() => checkForUpdates(), 3000)
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('before-quit', async () => {
  telegramService?.stop()
  await pythonSidecar.shutdown()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
