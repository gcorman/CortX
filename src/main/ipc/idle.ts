import { ipcMain } from 'electron'
import type { IdleService } from '../services/IdleService'
import type { AgentPipeline } from '../services/AgentPipeline'

export function registerIdleHandlers(
  getIdleService: () => IdleService,
  getAgentPipeline: () => AgentPipeline
): void {
  ipcMain.handle('idle:start', async () => {
    await getIdleService().start()
  })

  ipcMain.handle('idle:stop', () => {
    getIdleService().stop()
  })

  ipcMain.handle('idle:pause', () => {
    getIdleService().pause()
  })

  ipcMain.handle('idle:resume', () => {
    getIdleService().resume()
  })

  ipcMain.handle('idle:getInsights', () => {
    return getIdleService().getInsights()
  })

  ipcMain.handle('idle:dismissInsight', (_event, id: string) => {
    getIdleService().dismissInsight(id)
  })

  ipcMain.handle('idle:saveInsightAsFiche', async (_event, id: string) => {
    // Build fiche content in IdleService (wikilinks, formatting)
    const { subject, body } = getIdleService().buildInsightFicheContent(id)

    // Delegate actual write + git commit + reindex to AgentPipeline.saveBrief
    // so the fiche lands in Fiches/ with the right format and appears in FichePanel
    const filePath = await getAgentPipeline().saveBrief(subject, body, 'idle-insight')

    // Mark insight as saved in IdleService (persists to disk)
    getIdleService().markInsightSaved(id)

    return filePath
  })

  ipcMain.handle('idle:getConfig', () => {
    return getIdleService().getConfig()
  })

  ipcMain.handle('idle:setConfig', (_event, partial: { intervalSeconds?: number; confidenceThreshold?: number }) => {
    getIdleService().setConfig(partial)
  })
}
