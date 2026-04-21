import { ipcMain } from 'electron'
import type { CanvasService } from '../services/CanvasService'
import type { CanvasConfig } from '../../shared/types'

export function registerCanvasHandlers(getService: () => CanvasService): void {
  ipcMain.handle('canvas:list', () => getService().list())
  ipcMain.handle('canvas:load', (_e, id: string) => getService().load(id))
  ipcMain.handle('canvas:save', (_e, config: CanvasConfig) => getService().save(config))
  ipcMain.handle('canvas:create', (_e, name: string) => getService().create(name))
  ipcMain.handle('canvas:delete', (_e, id: string) => getService().delete(id))
  ipcMain.handle('canvas:rename', (_e, id: string, newName: string) =>
    getService().rename(id, newName)
  )
  ipcMain.handle('canvas:agentSuggest', (_e, canvasId: string, prompt: string) =>
    getService().agentSuggest(canvasId, prompt)
  )
}
