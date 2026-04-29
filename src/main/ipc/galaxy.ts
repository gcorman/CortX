import { ipcMain } from 'electron'
import type { GalaxyService } from '../services/GalaxyService'

export function registerGalaxyHandlers(getService: () => GalaxyService): void {
  ipcMain.handle('galaxy:getData', () => getService().getData())
  ipcMain.handle(
    'galaxy:renameCluster',
    (_event, topMemberLabel: string, newLabel: string) =>
      getService().renameCluster(topMemberLabel, newLabel)
  )
}
