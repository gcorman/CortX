import { ipcMain } from 'electron'
import type { AgentPipeline } from '../services/AgentPipeline'
import type { IdleService } from '../services/IdleService'
import type { AgentAction, StreamEvent } from '../../shared/types'

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
    // Legacy `delta` field kept for backwards-compat with older renderer code;
    // the new `event` field carries structured StreamEvent payloads.
    const onDelta = (delta: string) => {
      if (!delta) return
      event.sender.send('agent:stream', { requestId, delta })
    }
    const onEvent = (ev: StreamEvent) => {
      event.sender.send('agent:stream', { requestId, event: ev })
    }
    try {
      const response = await getAgent().process(input, onDelta, onEvent)
      event.sender.send('agent:stream', { requestId, event: { kind: 'done' } as StreamEvent })
      event.sender.send('agent:stream', { requestId, done: true })
      return response
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      event.sender.send('agent:stream', { requestId, event: { kind: 'error', message } as StreamEvent })
      event.sender.send('agent:stream', { requestId, error: message })
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

  ipcMain.handle('agent:wikiToMd', (_event, topic: string, lang?: string) =>
    getAgent().wikiToMd(topic, lang)
  )

  ipcMain.handle('agent:previewWebContext', (_event, input: string) =>
    getAgent().previewWebContext(input)
  )

  ipcMain.handle('agent:importRawMarkdown', (_event, filename: string, content: string) =>
    getAgent().importRawMarkdown(filename, content)
  )
}
