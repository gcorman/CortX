import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import * as fs from 'fs'
import { registerDatabaseHandlers } from './ipc/database'
import { registerFileHandlers } from './ipc/files'
import { registerLLMHandlers } from './ipc/llm'
import { registerGitHandlers } from './ipc/git'
import { registerAgentHandlers, setIdleServiceForAgent } from './ipc/agent'
import { registerLibraryHandlers } from './ipc/library'
import { registerIdleHandlers } from './ipc/idle'
import { DatabaseService } from './services/DatabaseService'
import { FileService } from './services/FileService'
import { GitService } from './services/GitService'
import { LLMService } from './services/LLMService'
import { AgentPipeline } from './services/AgentPipeline'
import { IdleService } from './services/IdleService'
import { libraryService } from './services/LibraryService'
import { pythonSidecar } from './services/PythonSidecar'
import type { AppConfig } from '../shared/types'

let mainWindow: BrowserWindow | null = null

// --- Config persistence ---

const configPath = join(app.getPath('userData'), 'cortx-config.json')
const defaultBasePath = join(app.getPath('documents'), 'CortX-Base')

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
        basePath: saved.basePath || defaults.basePath,
        llm: {
          provider: saved.llm?.provider || defaults.llm.provider,
          apiKey: saved.llm?.apiKey || defaults.llm.apiKey,
          model: saved.llm?.model || defaults.llm.model,
          baseUrl: saved.llm?.baseUrl
        },
        validationMode: saved.validationMode || defaults.validationMode,
        language: saved.language || defaults.language
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

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

async function initializeServices(): Promise<void> {
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
    config.language
  )

  // Initialise library service (creates Bibliotheque/ if needed)
  libraryService.initialize(dbService.getDb(), config.basePath)

  // Initialise idle service
  idleService = new IdleService(dbService, fileService, llmService, config.basePath)

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
    config.basePath = path
    saveConfig(config)
    fileService = new FileService(path)
    await fileService.ensureBaseStructure()
    dbService = new DatabaseService(join(path, '_System', 'cortx.db'))
    dbService.initialize()
    gitService = new GitService(path)
    await gitService.initialize()
    agentPipeline = new AgentPipeline(fileService, dbService, gitService, llmService, path, config.language)
    await indexAllFiles()
    startFileWatcher(path)
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
    llm: { ...config.llm, apiKey: config.llm.apiKey ? '***' : '' }
  }))

  ipcMain.handle('app:resetBase', async () => {
    const basePath = config.basePath
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

    console.log('[Reset] Base de connaissances réinitialisée')
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
    }
    saveConfig(config)
  })
}

app.whenReady().then(async () => {
  await initializeServices()
  startFileWatcher(config.basePath)

  registerAppHandlers()
  registerDatabaseHandlers(() => dbService)
  registerFileHandlers(() => fileService, () => dbService)
  registerLLMHandlers(llmService)
  registerGitHandlers(() => gitService)
  registerAgentHandlers(() => agentPipeline)
  registerLibraryHandlers(() => libraryService, () => mainWindow)
  registerIdleHandlers(() => idleService, () => agentPipeline)
  setIdleServiceForAgent(idleService)

  createWindow()
  // Give IdleService access to the main window for IPC events
  if (mainWindow) idleService.setWindow(mainWindow)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('before-quit', async () => {
  await pythonSidecar.shutdown()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
