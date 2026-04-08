/**
 * IPC handlers for the library namespace.
 * Follows the same pattern as the other ipc/*.ts modules.
 */

import { ipcMain, dialog, BrowserWindow } from 'electron'
import type { LibraryService } from '../services/LibraryService'
import { pythonSidecar } from '../services/PythonSidecar'
import type { LibraryIngestProgress } from '../../shared/types'

export function registerLibraryHandlers(
  getLibrary: () => LibraryService,
  getWindow: () => BrowserWindow | null
): void {

  // Helper to push progress events to the renderer
  const emitProgress = (p: LibraryIngestProgress) => {
    const win = getWindow()
    if (win && !win.isDestroyed()) {
      win.webContents.send('library:progress', p)
    }
  }

  // ── Import ──────────────────────────────────────────────────────────────

  ipcMain.handle('library:ingest', async (_event, absolutePath: string) => {
    return getLibrary().ingest(absolutePath, emitProgress)
  })

  ipcMain.handle('library:ingestMany', async (_event, absolutePaths: string[]) => {
    return getLibrary().ingestMany(absolutePaths, emitProgress)
  })

  ipcMain.handle('library:openImportDialog', async () => {
    const win = getWindow()
    if (!win) return []
    const result = await dialog.showOpenDialog(win, {
      title: 'Importer des documents dans la bibliothèque',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Documents', extensions: ['pdf', 'docx', 'xlsx', 'pptx', 'html', 'txt', 'md'] },
        { name: 'Tous les fichiers', extensions: ['*'] }
      ]
    })
    if (result.canceled || result.filePaths.length === 0) return []
    // Kick off ingestion and return immediately (progress via events)
    getLibrary().ingestMany(result.filePaths, emitProgress).catch(console.error)
    return result.filePaths
  })

  // ── CRUD ────────────────────────────────────────────────────────────────

  ipcMain.handle('library:list', (_event, folder?: string) => {
    return getLibrary().list(folder)
  })

  ipcMain.handle('library:get', (_event, id: string) => {
    return getLibrary().get(id)
  })

  ipcMain.handle('library:delete', (_event, id: string) => {
    return getLibrary().delete(id)
  })

  ipcMain.handle('library:rename', (_event, id: string, newFilename: string) => {
    return getLibrary().rename(id, newFilename)
  })

  // ── Preview & open ───────────────────────────────────────────────────────

  ipcMain.handle('library:getPreview', (_event, id: string) => {
    return getLibrary().getPreview(id)
  })

  ipcMain.handle('library:openOriginal', (_event, id: string) => {
    return getLibrary().openOriginal(id)
  })

  // ── Search ───────────────────────────────────────────────────────────────

  ipcMain.handle(
    'library:search',
    (_event, query: string, mode?: 'lexical' | 'semantic' | 'hybrid', limit?: number) => {
      return getLibrary().search(query, mode, limit)
    }
  )

  // ── Maintenance ──────────────────────────────────────────────────────────

  ipcMain.handle('library:reindexAll', () => {
    return getLibrary().reindexAll(emitProgress)
  })

  ipcMain.handle('library:getStatus', () => {
    return {
      sidecarReady: pythonSidecar.isAvailable(),
      queueLength: 0,
    }
  })
}
