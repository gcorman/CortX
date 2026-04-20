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

  // Helper to signal graph/file changes to the renderer (triggers graph reload)
  const notifyDbChanged = () => {
    const win = getWindow()
    if (win && !win.isDestroyed()) {
      win.webContents.send('db:changed')
    }
  }

  // ── Import ──────────────────────────────────────────────────────────────

  ipcMain.handle('library:ingest', async (_event, absolutePath: string) => {
    const result = await getLibrary().ingest(absolutePath, emitProgress)
    notifyDbChanged()
    return result
  })

  ipcMain.handle('library:ingestMany', async (_event, absolutePaths: string[]) => {
    const result = await getLibrary().ingestMany(absolutePaths, emitProgress)
    notifyDbChanged()
    return result
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
    getLibrary().ingestMany(result.filePaths, emitProgress).then(notifyDbChanged).catch(console.error)
    return result.filePaths
  })

  // ── CRUD ────────────────────────────────────────────────────────────────

  ipcMain.handle('library:list', (_event, folder?: string) => {
    return getLibrary().list(folder)
  })

  ipcMain.handle('library:get', (_event, id: string) => {
    return getLibrary().get(id)
  })

  ipcMain.handle('library:delete', async (_event, id: string) => {
    const result = await getLibrary().delete(id)
    notifyDbChanged()
    return result
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

  /**
   * Retrieve context chunks for a [[wikilink]]-referenced library document.
   * - ref: the wikilink target (e.g. "personnel_marine_nationale")
   * - contextQuery: surrounding text that helps find the relevant row/section
   *   (e.g. "Julien Robert matelot" extracted from the KB file line containing the wikilink)
   * Returns: chunk 0 (headers) + semantically relevant chunks scoped to that doc.
   */
  ipcMain.handle(
    'library:getLinkedContext',
    (_event, ref: string, contextQuery: string, limit?: number) => {
      return getLibrary().getLinkedDocContext(ref, contextQuery, limit)
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
