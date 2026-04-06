import { ipcMain } from 'electron'
import type { DatabaseService } from '../services/DatabaseService'

export function registerDatabaseHandlers(db: DatabaseService): void {
  ipcMain.handle('db:getFiles', () => db.getFiles())
  ipcMain.handle('db:getEntities', () => db.getEntities())
  ipcMain.handle('db:getRelations', () => db.getRelations())
  ipcMain.handle('db:search', (_event, query: string) => db.search(query))
  ipcMain.handle('db:getGraphData', () => db.getGraphData())
  ipcMain.handle('db:getTags', () => db.getTags())
}
