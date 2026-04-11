import { ipcMain, dialog, BrowserWindow } from 'electron'
import * as fs from 'fs'
import type { FileService } from '../services/FileService'

export function registerFileHandlers(getFiles: () => FileService): void {
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
}
