import { ipcMain } from 'electron'
import type { DatabaseService } from '../services/DatabaseService'

export function registerDatabaseHandlers(getDb: () => DatabaseService): void {
  ipcMain.handle('db:getFiles', () => getDb().getFiles())
  ipcMain.handle('db:getEntities', () => getDb().getEntities())
  ipcMain.handle('db:getRelations', () => getDb().getRelations())
  ipcMain.handle('db:search', (_event, query: string) => getDb().search(query))
  ipcMain.handle('db:getGraphData', () => getDb().getGraphData())
  ipcMain.handle('db:getTags', () => getDb().getTags())
}
