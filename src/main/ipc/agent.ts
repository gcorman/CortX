import { ipcMain } from 'electron'
import type { AgentPipeline } from '../services/AgentPipeline'
import type { IdleService } from '../services/IdleService'
import type { AgentAction, StreamEvent } from '../../shared/types'

let _idleService: IdleService | null = null
const _controllers = new Map<string, AbortController>()

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
    const controller = new AbortController()
    _controllers.set(requestId, controller)
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
      const response = await getAgent().process(input, onDelta, onEvent, controller.signal)
      event.sender.send('agent:stream', { requestId, event: { kind: 'done' } as StreamEvent })
      event.sender.send('agent:stream', { requestId, done: true })
      return response
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      const aborted = controller.signal.aborted
      event.sender.send('agent:stream', { requestId, event: { kind: 'error', message } as StreamEvent })
      event.sender.send('agent:stream', { requestId, error: aborted ? 'aborted' : message })
      if (!aborted) throw err
      // Aborted — return empty response so IPC resolves cleanly
      return null
    } finally {
      _controllers.delete(requestId)
      _idleService?.resume()
    }
  })

  ipcMain.handle('agent:abort', (_event, requestId: string) => {
    const controller = _controllers.get(requestId)
    if (controller) {
      controller.abort()
      _controllers.delete(requestId)
    }
  })

  ipcMain.handle('agent:execute', async (event, actions: AgentAction[], summary: string) => {
    const result = await getAgent().execute(actions, summary)
    event.sender.send('db:changed')
    return result
  })

  ipcMain.handle('agent:preview', (_event, action: AgentAction) =>
    getAgent().preview(action)
  )

  ipcMain.handle('agent:undo', async (event, commitHash: string) => {
    const result = await getAgent().undo(commitHash)
    event.sender.send('db:changed')
    return result
  })

  ipcMain.handle('agent:saveManualEdit', async (event, filePath: string, content: string) => {
    const result = await getAgent().saveManualEdit(filePath, content)
    event.sender.send('db:changed')
    return result
  })

  ipcMain.handle('agent:saveBrief', async (event, subject: string, body: string, kind?: string) => {
    const result = await getAgent().saveBrief(subject, body, kind)
    event.sender.send('db:changed')
    return result
  })

  ipcMain.handle('agent:listFiches', () => getAgent().listFiches())

  ipcMain.handle('agent:deleteFiche', async (event, filePath: string) => {
    const result = await getAgent().deleteFiche(filePath)
    event.sender.send('db:changed')
    return result
  })

  ipcMain.handle('agent:rewriteFile', async (event, filePath: string) => {
    const result = await getAgent().rewriteFile(filePath)
    event.sender.send('db:changed')
    return result
  })

  ipcMain.handle('agent:deleteFile', async (event, filePath: string) => {
    const result = await getAgent().deleteFile(filePath)
    event.sender.send('db:changed')
    return result
  })

  ipcMain.handle('agent:wikiToMd', (_event, topic: string, lang?: string) =>
    getAgent().wikiToMd(topic, lang)
  )

  ipcMain.handle('agent:previewWebContext', (_event, input: string) =>
    getAgent().previewWebContext(input)
  )

  ipcMain.handle('agent:importRawMarkdown', async (event, filename: string, content: string) => {
    const result = await getAgent().importRawMarkdown(filename, content)
    event.sender.send('db:changed')
    return result
  })
}
