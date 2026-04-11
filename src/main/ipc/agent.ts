import { ipcMain } from 'electron'
import type { AgentPipeline } from '../services/AgentPipeline'
import type { IdleService } from '../services/IdleService'
import type { AgentAction } from '../../shared/types'

let _idleService: IdleService | null = null

export function setIdleServiceForAgent(idle: IdleService): void {
  _idleService = idle
}

export function registerAgentHandlers(getAgent: () => AgentPipeline): void {
  ipcMain.handle('agent:process', (_event, input: string) => {
    _idleService?.pause()
    return getAgent().process(input).finally(() => _idleService?.resume())
  })

  ipcMain.handle('agent:processStream', async (event, input: string, requestId: string) => {
    _idleService?.pause()
    const onDelta = (delta: string) => {
      if (!delta) return
      event.sender.send('agent:stream', { requestId, delta })
    }
    try {
      const response = await getAgent().process(input, onDelta)
      event.sender.send('agent:stream', { requestId, done: true })
      return response
    } catch (err) {
      event.sender.send('agent:stream', {
        requestId,
        error: err instanceof Error ? err.message : String(err)
      })
      throw err
    } finally {
      _idleService?.resume()
    }
  })

  ipcMain.handle('agent:execute', (_event, actions: AgentAction[], summary: string) =>
    getAgent().execute(actions, summary)
  )

  ipcMain.handle('agent:preview', (_event, action: AgentAction) =>
    getAgent().preview(action)
  )

  ipcMain.handle('agent:undo', (_event, commitHash: string) => getAgent().undo(commitHash))

  ipcMain.handle('agent:saveManualEdit', (_event, filePath: string, content: string) =>
    getAgent().saveManualEdit(filePath, content)
  )

  ipcMain.handle('agent:saveBrief', (_event, subject: string, body: string, kind?: string) =>
    getAgent().saveBrief(subject, body, kind)
  )

  ipcMain.handle('agent:listFiches', () => getAgent().listFiches())

  ipcMain.handle('agent:deleteFiche', (_event, filePath: string) => getAgent().deleteFiche(filePath))

  ipcMain.handle('agent:rewriteFile', (_event, filePath: string) => getAgent().rewriteFile(filePath))

  ipcMain.handle('agent:deleteFile', (_event, filePath: string) => getAgent().deleteFile(filePath))
}
