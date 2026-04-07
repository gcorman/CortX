import { ipcMain } from 'electron'
import type { FileService } from '../services/FileService'

export function registerFileHandlers(getFiles: () => FileService): void {
  ipcMain.handle('files:read', (_event, path: string) => getFiles().readFile(path))
  ipcMain.handle('files:write', (_event, path: string, content: string) => getFiles().writeFile(path, content))
  ipcMain.handle('files:list', (_event, dir?: string) => getFiles().listMarkdownFiles(dir))
  ipcMain.handle('files:exists', (_event, path: string) => getFiles().fileExists(path))
}
