import { ipcMain, dialog, BrowserWindow } from 'electron'
import * as fs from 'fs'
import type { FileService } from '../services/FileService'
import type { DatabaseService } from '../services/DatabaseService'
import type { ExportService } from '../services/ExportService'
import type { EntityType } from '../../shared/types'

export function registerFileHandlers(getFiles: () => FileService, getDatabase?: () => DatabaseService, getExport?: () => ExportService): void {
  ipcMain.handle('files:read', (_event, path: string) => getFiles().readFile(path))
  ipcMain.handle('files:write', (_event, path: string, content: string) => getFiles().writeFile(path, content))
  ipcMain.handle('files:list', (_event, dir?: string) => getFiles().listMarkdownFiles(dir))
  ipcMain.handle('files:exists', (_event, path: string) => getFiles().fileExists(path))

  /**
   * Opens a native file picker filtered to .md files.
   * Returns { path, content } for the chosen file, or null if cancelled.
   */
  ipcMain.handle('files:openMarkdownDialog', async () => {
    const win = BrowserWindow.getFocusedWindow()
    if (!win) return null
    const result = await dialog.showOpenDialog(win, {
      title: 'Importer un fichier Markdown',
      properties: ['openFile'],
      filters: [
        { name: 'Markdown', extensions: ['md', 'txt'] },
        { name: 'Tous les fichiers', extensions: ['*'] }
      ]
    })
    if (result.canceled || result.filePaths.length === 0) return null
    const filePath = result.filePaths[0]
    const content = fs.readFileSync(filePath, 'utf-8')
    const filename = filePath.split(/[\\/]/).pop() ?? filePath
    return { path: filePath, filename, content }
  })

  /**
   * Reads a file from an absolute path (for drag & drop from outside the app).
   */
  ipcMain.handle('files:readExternal', async (_event, absolutePath: string) => {
    if (!fs.existsSync(absolutePath)) return null
    const content = fs.readFileSync(absolutePath, 'utf-8')
    const filename = absolutePath.split(/[\\/]/).pop() ?? absolutePath
    return { path: absolutePath, filename, content }
  })

  /**
   * Creates a new Markdown file with the given type and title.
   */
  ipcMain.handle('files:create', async (_event, { type, title }: { type: EntityType; title: string }) => {
    const filePath = await getFiles().createNewFile(type, title)
    return { path: filePath }
  })

  /**
   * Updates the title of a Markdown file (in frontmatter and H1 heading),
   * then rewrites [[OldTitle]] wikilinks in all other KB files.
   * Returns { updatedLinks: number } — count of files where wikilinks were rewritten.
   */
  ipcMain.handle('files:updateTitle', async (_event, { path: filePath, newTitle }: { path: string; newTitle: string }) => {
    const fileService = getFiles()
    const oldTitle = fileService.getEffectiveTitle(filePath)
    await fileService.updateFileTitle(filePath, newTitle)
    const modifiedFiles = await fileService.updateWikilinksForRename(oldTitle, newTitle)
    if (getDatabase) {
      const db = getDatabase()
      await db.indexFile(filePath)
      for (const mp of modifiedFiles) {
        await db.indexFile(mp)
      }
    }
    return { updatedLinks: modifiedFiles.length }
  })

  ipcMain.handle('files:export', (_event, format: 'html' | 'json') => {
    if (!getExport) return { success: false, error: 'Export service not available' }
    return getExport().exportInteractive(format)
  })
}
