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
    systemPrompt?: string
  ): Promise<string> {
    if (this.config.provider === 'anthropic' && !this.config.apiKey) {
      throw new Error('Cle API non configuree. Va dans Settings pour ajouter ta cle.')
    }

    if (this.config.provider === 'anthropic') {
      return this.sendAnthropic(messages, systemPrompt)
    } else {
      return this.sendOpenAICompatible(messages, systemPrompt)
    }
  }

  private async sendAnthropic(
    messages: Array<{ role: string; content: string }>,
    systemPrompt?: string
  ): Promise<string> {
    if (!this.anthropicClient) {
      this.initClient()
      if (!this.anthropicClient) {
        throw new Error('Client Anthropic non initialise.')
      }
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
    systemPrompt?: string
  ): Promise<string> {
    const baseUrl = this.config.baseUrl || 'http://localhost:11434/v1'

    const allMessages = systemPrompt
      ? [{ role: 'system', content: systemPrompt }, ...messages]
      : messages

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.config.apiKey ? { Authorization: `Bearer ${this.config.apiKey}` } : {})
      },
      body: JSON.stringify({
        model: this.config.model,
        messages: allMessages,
        max_tokens: 8192,
        temperature: 0.3
      })
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`LLM API error ${response.status}: ${text}`)
    }

    const data = (await response.json()) as {
      choices: Array<{ message: { content: string } }>
    }
    return data.choices[0]?.message?.content || ''
  }

  getConfig(): LLMConfig {
    return { ...this.config, apiKey: this.config.apiKey ? '***' : '' }
  }
}
