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
    onDelta?: (delta: string) => void,
    signal?: AbortSignal
  ): Promise<string> {
    if (this.config.provider === 'anthropic' && !this.config.apiKey) {
      throw new Error('Cle API non configuree. Va dans Settings pour ajouter ta cle.')
    }
    if (this.config.provider === 'google-ai' && !this.config.apiKey) {
      throw new Error('Cle API Google AI non configuree. Va dans Settings pour ajouter ta cle.')
    }

    if (this.config.provider === 'anthropic') {
      return this.sendAnthropic(messages, systemPrompt, onDelta, signal)
    } else if (this.config.provider === 'google-ai') {
      return this.sendGoogleAI(messages, systemPrompt, onDelta, signal)
    } else {
      return this.sendOpenAICompatible(messages, systemPrompt, onDelta, signal)
    }
  }

  private async sendAnthropic(
    messages: Array<{ role: string; content: string }>,
    systemPrompt?: string,
    onDelta?: (delta: string) => void,
    signal?: AbortSignal
  ): Promise<string> {
    if (!this.anthropicClient) {
      this.initClient()
      if (!this.anthropicClient) {
        throw new Error('Client Anthropic non initialise.')
      }
    }

    const reqParams = {
      model: this.config.model,
      max_tokens: 8192,
      system: systemPrompt || undefined,
      messages: messages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content
      }))
    }
    const reqOpts = signal ? { signal } : undefined

    if (onDelta) {
      let full = ''
      const stream = this.anthropicClient.messages.stream(reqParams, reqOpts)

      stream.on('text', (delta) => {
        if (!delta) return
        full += delta
        onDelta(delta)
      })

      await stream.finalMessage()
      return full
    }

    const response = await this.anthropicClient.messages.create(reqParams, reqOpts)

    const textBlock = response.content.find((b) => b.type === 'text')
    return textBlock ? textBlock.text : ''
  }

  private async sendOpenAICompatible(
    messages: Array<{ role: string; content: string }>,
    systemPrompt?: string,
    onDelta?: (delta: string) => void,
    signal?: AbortSignal
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
      }),
      signal
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

  private async sendGoogleAI(
    messages: Array<{ role: string; content: string }>,
    systemPrompt?: string,
    onDelta?: (delta: string) => void,
    signal?: AbortSignal
  ): Promise<string> {
    const model = this.config.model || 'gemini-2.0-flash-lite'
    const apiKey = this.config.apiKey

    // Separate system messages; Google AI uses a dedicated systemInstruction field
    const userMessages = messages.filter((m) => m.role !== 'system')

    const contents = userMessages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    }))

    const body: Record<string, unknown> = {
      contents,
      generationConfig: {
        maxOutputTokens: 8192,
        temperature: 0.3
      }
    }

    if (systemPrompt) {
      body.systemInstruction = { parts: [{ text: systemPrompt }] }
    }

    if (onDelta) {
      // Streaming via SSE
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal
      })

      if (!response.ok) {
        const text = await response.text()
        throw new Error(`Google AI API error ${response.status}: ${text}`)
      }

      const reader = response.body?.getReader()
      if (!reader) throw new Error('Google AI: no response body')

      const decoder = new TextDecoder()
      let buffer = ''
      let full = ''

      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        const lines = buffer.split(/\r?\n/)
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed.startsWith('data:')) continue
          const data = trimmed.slice(5).trim()
          if (!data || data === '[DONE]') continue
          try {
            const parsed = JSON.parse(data) as {
              candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
            }
            const delta = parsed.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
            if (delta) {
              full += delta
              onDelta(delta)
            }
          } catch {
            // ignore partial JSON
          }
        }
      }

      return full
    }

    // Non-streaming
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Google AI API error ${response.status}: ${text}`)
    }

    const data = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
    }
    return data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
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
