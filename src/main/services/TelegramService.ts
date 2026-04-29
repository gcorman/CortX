import type { BrowserWindow } from 'electron'
import type { TelegramConfig, TelegramReplyData } from '../../shared/types'

// ── Minimal Telegram Bot API types ───────────────────────────────────────────

interface TgUpdate {
  update_id: number
  message?: TgMessage
  callback_query?: TgCallbackQuery
}

interface TgMessage {
  message_id: number
  from?: { id: number; username?: string; first_name?: string }
  chat: { id: number }
  text?: string
}

interface TgCallbackQuery {
  id: string
  from: { id: number }
  message?: TgMessage
  data?: string
}

interface TgSentMessage {
  message_id: number
  chat: { id: number }
}

const BATCH_DELAY_MS = 2000
const MAX_MSG_LEN = 4096
const POLL_TIMEOUT_SEC = 30
const BACKOFF_MS = 5000

// ── Reply formatting (no LLM) ─────────────────────────────────────────────────

function formatReply(data: TelegramReplyData): string {
  const { inputType, actions, summary, response, sources } = data

  if (inputType === 'question' || (actions.length === 0 && response)) {
    const body = response || summary || '(aucune réponse)'
    const srcLine = sources?.length
      ? `\n\n📚 Sources : ${sources.join(', ')}`
      : ''
    return `💬 Réponse CortX :\n\n${body}${srcLine}`
  }

  if (actions.length === 0) {
    return `ℹ️ ${summary || 'Aucune action nécessaire.'}`
  }

  const fileLines = actions
    .slice(0, 10)
    .map(a => `  ${a.action === 'create' ? '✨' : '✏️'} ${a.file}`)
    .join('\n')
  const more = actions.length > 10 ? `\n  …et ${actions.length - 10} autres` : ''
  const summaryLine = summary ? `\n\n💭 ${summary}` : ''

  return `📥 CortX — ${actions.length} fichier(s) à valider :\n\n${fileLines}${more}${summaryLine}\n\n💡 Valide ou refuse depuis l'app CortX, ou via les boutons ci-dessous.`
}

function formatExecuted(commitHash: string, files: string[]): string {
  const date = new Date().toLocaleDateString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric'
  })
  const fileLines = files.slice(0, 10).map(f => `  ✔ ${f}`).join('\n')
  const more = files.length > 10 ? `\n  …et ${files.length - 10} autres` : ''
  return `✅ Appliqué !\n\n${fileLines}${more}\n\n🔗 Commit : ${commitHash.slice(0, 7)}\n📅 ${date}`
}

function formatRejected(): string {
  return '❌ Annulé — les actions ont été refusées depuis CortX.'
}

// ─────────────────────────────────────────────────────────────────────────────

export class TelegramService {
  private polling = false
  private offset = 0
  private mainWindow: BrowserWindow | null = null

  // chatId → { waitMsgId } for the ⏳ message sent while renderer processes
  private activeRequests = new Map<number, { waitMsgId: number }>()

  // callbackKey → { chatId, chatMessageId } for inline-keyboard tracking
  private pendingCallbacks = new Map<string, { chatId: number; chatMessageId: string }>()

  // chatId → debounce state
  private batchTimers = new Map<number, { timer: ReturnType<typeof setTimeout>; lines: string[]; username: string }>()

  constructor(
    private cfg: TelegramConfig,
    private notifyRenderer: () => void
  ) {}

  setWindow(mw: BrowserWindow | null): void {
    this.mainWindow = mw
  }

  async start(): Promise<void> {
    if (this.polling || !this.cfg.token) return
    this.polling = true
    this.offset = 0
    console.log('[Telegram] Bot started (relay mode)')
    void this.pollLoop()
  }

  stop(): void {
    if (!this.polling) return
    this.polling = false
    for (const { timer } of this.batchTimers.values()) clearTimeout(timer)
    this.batchTimers.clear()
    console.log('[Telegram] Bot stopped')
  }

  isRunning(): boolean {
    return this.polling
  }

  async updateConfig(cfg: TelegramConfig): Promise<void> {
    this.stop()
    this.cfg = cfg
    if (cfg.enabled && cfg.token) {
      await this.start()
    }
  }

  // ── Called from IPC after renderer finishes processing ────────────────────

  async sendReply(chatId: number, chatMessageId: string, data: TelegramReplyData): Promise<void> {
    const text = formatReply(data)
    const pending = this.activeRequests.get(chatId)

    if (data.actions.length > 0 && data.inputType !== 'question') {
      const key = `${chatId}:${chatMessageId}`
      this.pendingCallbacks.set(key, { chatId, chatMessageId })

      const keyboard = {
        inline_keyboard: [[
          { text: '✔ Valider', callback_data: `accept:${key}` },
          { text: '✗ Refuser', callback_data: `reject:${key}` }
        ]]
      }

      if (pending?.waitMsgId) {
        await this.callApi('editMessageText', {
          chat_id: chatId,
          message_id: pending.waitMsgId,
          text: text.slice(0, MAX_MSG_LEN),
          reply_markup: keyboard
        })
      } else {
        const sent = await this.callApi<TgSentMessage>('sendMessage', {
          chat_id: chatId,
          text: text.slice(0, MAX_MSG_LEN),
          reply_markup: keyboard
        })
        if (sent) this.activeRequests.set(chatId, { waitMsgId: sent.message_id })
      }
    } else {
      // Question or no-action response: plain text, no keyboard
      if (pending?.waitMsgId) {
        await this.editMessageText(chatId, pending.waitMsgId, text)
      } else {
        await this.send(chatId, text)
      }
      this.activeRequests.delete(chatId)
    }
  }

  async notifyExecuted(chatId: number, chatMessageId: string, commitHash: string, files: string[]): Promise<void> {
    const text = formatExecuted(commitHash, files)
    await this.resolveAndClose(chatId, chatMessageId, text)
  }

  async notifyRejected(chatId: number, chatMessageId: string): Promise<void> {
    await this.resolveAndClose(chatId, chatMessageId, formatRejected())
  }

  // ── Polling loop ──────────────────────────────────────────────────────────

  private async pollLoop(): Promise<void> {
    while (this.polling) {
      try {
        const updates = await this.callApi<TgUpdate[]>('getUpdates', {
          offset: this.offset,
          timeout: POLL_TIMEOUT_SEC,
          allowed_updates: ['message', 'callback_query']
        })
        for (const update of updates) {
          this.offset = update.update_id + 1
          if (update.message) this.onMessage(update.message)
          if (update.callback_query) void this.onCallbackQuery(update.callback_query)
        }
      } catch (err) {
        if (this.polling) {
          console.error('[Telegram] Poll error:', err instanceof Error ? err.message : err)
          await sleep(BACKOFF_MS)
        }
      }
    }
  }

  // ── Message handling ──────────────────────────────────────────────────────

  private onMessage(msg: TgMessage): void {
    const chatId = msg.chat.id
    const text = msg.text?.trim() ?? ''
    if (!this.isAllowed(chatId) || !text) return

    const username = msg.from?.username ?? msg.from?.first_name ?? String(chatId)

    if (text.startsWith('/')) {
      void this.handleCommand(chatId, username, text)
      return
    }

    // Debounce: merge rapid successive messages
    const existing = this.batchTimers.get(chatId)
    if (existing) {
      clearTimeout(existing.timer)
      existing.lines.push(text)
    }
    const lines = existing?.lines ?? [text]
    const timer = setTimeout(() => {
      this.batchTimers.delete(chatId)
      void this.flush(chatId, username, lines)
    }, BATCH_DELAY_MS)
    this.batchTimers.set(chatId, { timer, lines, username })
  }

  private async handleCommand(chatId: number, username: string, text: string): Promise<void> {
    const [cmd, ...rest] = text.split(/\s+/)
    const arg = rest.join(' ').trim()

    switch (cmd) {
      case '/ask':
        await this.relayToRenderer(chatId, this.formatInput(username, arg || 'donne-moi le statut', 'question'))
        break
      case '/note':
        if (arg) await this.relayToRenderer(chatId, this.formatInput(username, arg, 'capture'))
        else await this.send(chatId, 'Usage : /note <texte à capturer>')
        break
      case '/status':
        await this.relayToRenderer(chatId, this.formatInput(
          username,
          'Donne-moi un résumé court de l\'état de la base de connaissance (nb fichiers, dernière action, rien d\'autre).',
          'question'
        ))
        break
      default:
        await this.send(chatId, 'Commandes : /ask, /note, /status\nOu envoie directement du texte.')
    }
  }

  private async flush(chatId: number, username: string, lines: string[]): Promise<void> {
    await this.relayToRenderer(chatId, this.formatInput(username, lines.join('\n')))
  }

  private async relayToRenderer(chatId: number, text: string): Promise<void> {
    const waitMsg = await this.send(chatId, '⏳ Traitement en cours…')
    if (waitMsg) this.activeRequests.set(chatId, { waitMsgId: waitMsg.message_id })
    this.mainWindow?.webContents.send('telegram:incoming', { chatId, text })
  }

  // ── Callback query (✔/✗ buttons) ─────────────────────────────────────────

  private async onCallbackQuery(query: TgCallbackQuery): Promise<void> {
    if (!query.data || !query.message) return
    const chatId = query.message.chat.id
    if (!this.isAllowed(chatId)) return

    await this.callApi('answerCallbackQuery', { callback_query_id: query.id })

    const colonIdx = query.data.indexOf(':')
    const action = query.data.slice(0, colonIdx)
    const key = query.data.slice(colonIdx + 1)

    const pending = this.pendingCallbacks.get(key)
    if (!pending) {
      await this.send(chatId, '⚠️ Action expirée ou déjà traitée.')
      return
    }

    const { chatMessageId } = pending

    if (action === 'accept') {
      this.mainWindow?.webContents.send('telegram:triggerAccept', { chatMessageId })
    } else if (action === 'reject') {
      this.mainWindow?.webContents.send('telegram:triggerReject', { chatMessageId })
    }
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private async resolveAndClose(chatId: number, chatMessageId: string, text: string): Promise<void> {
    const key = `${chatId}:${chatMessageId}`
    this.pendingCallbacks.delete(key)

    const pending = this.activeRequests.get(chatId)
    if (pending?.waitMsgId) {
      // Remove inline keyboard + update text
      await this.callApi('editMessageText', {
        chat_id: chatId,
        message_id: pending.waitMsgId,
        text: text.slice(0, MAX_MSG_LEN),
        reply_markup: { inline_keyboard: [] }
      })
    } else {
      await this.send(chatId, text)
    }
    this.activeRequests.delete(chatId)
    this.notifyRenderer()
  }

  private formatInput(username: string, text: string, hint?: string): string {
    const date = new Date().toISOString().slice(0, 10)
    const hintLine = hint ? `\nIntent: ${hint}` : ''
    return `[Telegram]\nDate: ${date}\nUser: ${username}${hintLine}\n\n${text}`
  }

  private isAllowed(chatId: number): boolean {
    return this.cfg.allowedChatIds.length > 0 && this.cfg.allowedChatIds.includes(chatId)
  }

  private async callApi<T = unknown>(method: string, body?: Record<string, unknown>): Promise<T> {
    const url = `https://api.telegram.org/bot${this.cfg.token}/${method}`
    const opts: RequestInit = body
      ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
      : { method: 'GET' }
    const res = await fetch(url, opts)
    const json = await res.json() as { ok: boolean; result: T; description?: string }
    if (!json.ok) throw new Error(`Telegram API [${method}]: ${json.description ?? 'unknown error'}`)
    return json.result
  }

  private async send(chatId: number, text: string): Promise<TgSentMessage | null> {
    try {
      return await this.callApi<TgSentMessage>('sendMessage', {
        chat_id: chatId,
        text: text.slice(0, MAX_MSG_LEN)
      })
    } catch (err) {
      console.error('[Telegram] sendMessage error:', err)
      return null
    }
  }

  private async editMessageText(chatId: number, messageId: number, text: string): Promise<void> {
    try {
      await this.callApi('editMessageText', {
        chat_id: chatId,
        message_id: messageId,
        text: text.slice(0, MAX_MSG_LEN)
      })
    } catch { /* message may already be deleted or unchanged */ }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}
