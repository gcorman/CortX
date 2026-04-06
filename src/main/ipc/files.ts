import { ipcMain } from 'electron'
import type { FileService } from '../services/FileService'

export function registerFileHandlers(files: FileService): void {
  ipcMain.handle('files:read', (_event, path: string) => files.readFile(path))
  ipcMain.handle('files:write', (_event, path: string, content: string) => files.writeFile(path, content))
  ipcMain.handle('files:list', (_event, dir?: string) => files.listMarkdownFiles(dir))
  ipcMain.handle('files:exists', (_event, path: string) => files.fileExists(path))
}
