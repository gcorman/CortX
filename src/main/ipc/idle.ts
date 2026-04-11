import { ipcMain } from 'electron'
import type { IdleService } from '../services/IdleService'

export function registerIdleHandlers(getIdleService: () => IdleService): void {
  ipcMain.handle('idle:start', async () => {
    await getIdleService().start()
  })

  ipcMain.handle('idle:stop', () => {
    getIdleService().stop()
  })

  ipcMain.handle('idle:getInsights', () => {
    return getIdleService().getInsights()
  })

  ipcMain.handle('idle:dismissInsight', (_event, id: string) => {
    getIdleService().dismissInsight(id)
  })

  ipcMain.handle('idle:saveInsightAsFiche', async (_event, id: string) => {
    return getIdleService().saveInsightAsFiche(id)
  })

  ipcMain.handle('idle:getConfig', () => {
    return getIdleService().getConfig()
  })

  ipcMain.handle('idle:setConfig', (_event, partial: { intervalSeconds?: number; confidenceThreshold?: number }) => {
    getIdleService().setConfig(partial)
  })
}
