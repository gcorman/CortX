import { ipcMain } from 'electron'
import type { LLMService } from '../services/LLMService'
import type { LLMConfig } from '../../shared/types'

export function registerLLMHandlers(llm: LLMService): void {
  ipcMain.handle('llm:send', (_event, messages: Array<{ role: string; content: string }>, systemPrompt?: string) =>
    llm.sendMessage(messages, systemPrompt)
  )

  ipcMain.handle('llm:getConfig', () => llm.getConfig())

  ipcMain.handle('llm:setConfig', (_event, config: LLMConfig) => {
    llm.updateConfig(config)
  })
}
