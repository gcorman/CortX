import { ipcMain } from 'electron'
import type { AgentPipeline } from '../services/AgentPipeline'
import type { AgentAction } from '../../shared/types'

export function registerAgentHandlers(getAgent: () => AgentPipeline): void {
  ipcMain.handle('agent:process', (_event, input: string) => getAgent().process(input))

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
}
