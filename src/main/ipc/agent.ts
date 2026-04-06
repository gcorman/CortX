import { ipcMain } from 'electron'
import type { AgentPipeline } from '../services/AgentPipeline'
import type { AgentAction } from '../../shared/types'

export function registerAgentHandlers(agent: AgentPipeline): void {
  ipcMain.handle('agent:process', (_event, input: string) => agent.process(input))

  ipcMain.handle('agent:execute', (_event, actions: AgentAction[], summary: string) =>
    agent.execute(actions, summary)
  )

  ipcMain.handle('agent:preview', (_event, action: AgentAction) =>
    agent.preview(action)
  )

  ipcMain.handle('agent:undo', (_event, commitHash: string) => agent.undo(commitHash))
}
