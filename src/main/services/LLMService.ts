import Anthropic from '@anthropic-ai/sdk'
import type { LLMConfig } from '../../shared/types'

export class LLMService {
  private config: LLMConfig
  private anthropicClient: Anthropic | null = null

  constructor(config: LLMConfig) {
    this.config = config
    this.initClient()
  }

  updateConfig(config: LLMConfig): void {
    this.config = config
    this.initClient()
  }

  private initClient(): void {
    if (this.config.provider === 'anthropic' && this.config.apiKey) {
      this.anthropicClient = new Anthropic({ apiKey: this.config.apiKey })
    } else {
      this.anthropicClient = null
    }
  }

  async sendMessage(
    messages: Array<{ role: string; content: string }>,
    systemPrompt?: string,
    onDelta?: (delta: string) => void
  ): Promise<string> {
    if (this.config.provider === 'anthropic' && !this.config.apiKey) {
      throw new Error('Cle API non configuree. Va dans Settings pour ajouter ta cle.')
    }

    if (this.config.provider === 'anthropic') {
      return this.sendAnthropic(messages, systemPrompt, onDelta)
    } else {
      return this.sendOpenAICompatible(messages, systemPrompt, onDelta)
    }
  }

  private async sendAnthropic(
    messages: Array<{ role: string; content: string }>,
    systemPrompt?: string,
    onDelta?: (delta: string) => void
  ): Promise<string> {
    if (!this.anthropicClient) {
      this.initClient()
      if (!this.anthropicClient) {
        throw new Error('Client Anthropic non initialise.')
      }
    }

    if (onDelta) {
      let full = ''
      const stream = this.anthropicClient.messages.stream({
        model: this.config.model,
        max_tokens: 8192,
        system: systemPrompt || undefined,
        messages: messages.map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content
        }))
      })

      stream.on('text', (delta) => {
        if (!delta) return
        full += delta
        onDelta(delta)
      })

      await stream.finalMessage()
      return full
    }

    const response = await this.anthropicClient.messages.create({
      model: this.config.model,
      max_tokens: 8192,
      system: systemPrompt || undefined,
      messages: messages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content
      }))
    })

    const textBlock = response.content.find((b) => b.type === 'text')
    return textBlock ? textBlock.text : ''
  }

  private async sendOpenAICompatible(
    messages: Array<{ role: string; content: string }>,
    systemPrompt?: string,
    onDelta?: (delta: string) => void
  ): Promise<string> {
    const baseUrl = this.config.baseUrl || 'http://localhost:11434/v1'

    const allMessages = systemPrompt
      ? [{ role: 'system', content: systemPrompt }, ...messages]
      : messages

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(onDelta ? { Accept: 'text/event-stream' } : {}),
        ...(this.config.apiKey ? { Authorization: `Bearer ${this.config.apiKey}` } : {})
      },
      body: JSON.stringify({
        model: this.config.model,
        messages: allMessages,
        max_tokens: 8192,
        temperature: 0.3,
        ...(onDelta ? { stream: true } : {})
      })
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`LLM API error ${response.status}: ${text}`)
    }

    if (!onDelta) {
      const data = (await response.json()) as {
        choices: Array<{ message: { content: string } }>
      }
      return data.choices[0]?.message?.content || ''
    }

    const reader = response.body?.getReader()
    if (!reader) {
      const text = await response.text()
      const direct = this.extractOpenAIContent(text)
      if (direct) onDelta(direct)
      return direct || text
    }

    const decoder = new TextDecoder()
    let buffer = ''
    let rawText = ''
    let full = ''
    let sawData = false

    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      const chunk = decoder.decode(value, { stream: true })
      rawText += chunk
      buffer += chunk

      const lines = buffer.split(/\r?\n/)
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) continue
        if (!trimmed.startsWith('data:')) continue
        sawData = true
        const data = trimmed.slice(5).trim()
        if (data === '[DONE]') continue
        try {
          const parsed = JSON.parse(data) as {
            choices?: Array<{ delta?: { content?: string }; message?: { content?: string } }>
          }
          const delta = parsed.choices?.[0]?.delta?.content
            ?? (parsed.choices?.[0]?.delta as { text?: string } | undefined)?.text
            ?? (parsed.choices?.[0] as { text?: string } | undefined)?.text
            ?? parsed.choices?.[0]?.message?.content
            ?? ''
          if (delta) {
            full += delta
            onDelta(delta)
          }
        } catch {
          // ignore parse errors on partial lines
        }
      }
    }

    const flush = decoder.decode()
    if (flush) {
      rawText += flush
      buffer += flush
      const lines = buffer.split(/\r?\n/)
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) continue
        if (!trimmed.startsWith('data:')) continue
        sawData = true
        const data = trimmed.slice(5).trim()
        if (data === '[DONE]') continue
        try {
          const parsed = JSON.parse(data) as {
            choices?: Array<{ delta?: { content?: string }; message?: { content?: string } }>
          }
          const delta = parsed.choices?.[0]?.delta?.content
            ?? (parsed.choices?.[0]?.delta as { text?: string } | undefined)?.text
            ?? (parsed.choices?.[0] as { text?: string } | undefined)?.text
            ?? parsed.choices?.[0]?.message?.content
            ?? ''
          if (delta) {
            full += delta
            onDelta(delta)
          }
        } catch {
          // ignore parse errors on partial lines
        }
      }
    }

    if (!sawData) {
      const direct = this.extractOpenAIContent(rawText)
      if (direct) {
        onDelta(direct)
        return direct
      }
      return rawText
    }

    return full
  }

  private extractOpenAIContent(raw: string): string {
    try {
      const data = JSON.parse(raw) as {
        choices?: Array<{ message?: { content?: string }; text?: string }>
      }
      return data.choices?.[0]?.message?.content || data.choices?.[0]?.text || ''
    } catch {
      return ''
    }
  }

  getConfig(): LLMConfig {
    return { ...this.config, apiKey: this.config.apiKey ? '***' : '' }
  }
}
