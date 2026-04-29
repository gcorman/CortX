import { ipcMain } from 'electron'
import type { TelegramService } from '../services/TelegramService'
import type { TelegramConfig, TelegramReplyData } from '../../shared/types'

export function registerTelegramHandlers(getTelegram: () => TelegramService): void {
  ipcMain.handle('telegram:getStatus', () => ({
    running: getTelegram().isRunning()
  }))

  ipcMain.handle('telegram:setConfig', async (_event, partial: Partial<TelegramConfig>) => {
    await getTelegram().updateConfig(partial as TelegramConfig)
  })

  ipcMain.handle('telegram:sendReply', async (
    _event,
    chatId: number,
    chatMessageId: string,
    data: TelegramReplyData
  ) => {
    await getTelegram().sendReply(chatId, chatMessageId, data)
  })

  ipcMain.handle('telegram:notifyExecuted', async (
    _event,
    chatId: number,
    chatMessageId: string,
    commitHash: string,
    files: string[]
  ) => {
    await getTelegram().notifyExecuted(chatId, chatMessageId, commitHash, files)
  })

  ipcMain.handle('telegram:notifyRejected', async (
    _event,
    chatId: number,
    chatMessageId: string
  ) => {
    await getTelegram().notifyRejected(chatId, chatMessageId)
  })
}
