/**
 * AI 提供商抽象层
 * 支持多个 AI 提供商（DeepSeek、OpenAI、Claude 等）
 */

// AI 提供商类型
export type AIProviderType = 'deepseek' | 'openai' | 'claude' | 'gemini' | 'custom'

// 消息类型
export interface AIMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

// AI 响应
export interface AIResponse {
  content: string
  usage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
  model?: string
}

// AI 提供商配置
export interface AIProviderConfig {
  type: AIProviderType
  apiKey: string
  baseURL?: string
  model?: string
  timeout?: number
  maxRetries?: number
}

// AI 提供商接口
export interface IAIProvider {
  type: AIProviderType
  name: string
  chat(messages: AIMessage[], options?: ChatOptions): Promise<AIResponse>
  streamChat(messages: AIMessage[], options?: ChatOptions): AsyncIterable<string>
  validateConfig(config: AIProviderConfig): boolean
}

// 聊天选项
export interface ChatOptions {
  temperature?: number
  maxTokens?: number
  topP?: number
  stream?: boolean
}

// DeepSeek 提供商
class DeepSeekProvider implements IAIProvider {
  type: AIProviderType = 'deepseek'
  name = 'DeepSeek'

  async chat(messages: AIMessage[], options: ChatOptions = {}): Promise<AIResponse> {
    const { createDeepSeekClient } = await import('./deepseek')
    const apiKey = this.getApiKey()

    const client = await createDeepSeekClient(apiKey)
    const response = await client.chat.completions.create({
      model: 'deepseek-chat',
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 2000
    })

    return {
      content: response.choices[0]?.message?.content || '',
      usage: response.usage ? {
        promptTokens: response.usage.prompt_tokens,
        completionTokens: response.usage.completion_tokens,
        totalTokens: response.usage.total_tokens
      } : undefined,
      model: response.model
    }
  }

  async *streamChat(messages: AIMessage[], options: ChatOptions = {}): AsyncIterable<string> {
    const { createDeepSeekClient } = await import('./deepseek')
    const apiKey = this.getApiKey()

    const client = await createDeepSeekClient(apiKey)
    const stream = await client.chat.completions.create({
      model: 'deepseek-chat',
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 2000,
      stream: true
    })

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || ''
      if (content) yield content
    }
  }

  validateConfig(config: AIProviderConfig): boolean {
    return !!config.apiKey && config.apiKey.startsWith('sk-')
  }

  private getApiKey(): string {
    if (typeof window === 'undefined') return ''
    const settings = localStorage.getItem('feynman-settings')
    if (settings) {
      const parsed = JSON.parse(settings)
      return parsed.apiKey || ''
    }
    return ''
  }
}

// OpenAI 提供商
class OpenAIProvider implements IAIProvider {
  type: AIProviderType = 'openai'
  name = 'OpenAI'
  private baseURL: string = 'https://api.openai.com/v1'

  constructor(config?: { baseURL?: string }) {
    if (config?.baseURL) {
      this.baseURL = config.baseURL
    }
  }

  async chat(messages: AIMessage[], options: ChatOptions = {}): Promise<AIResponse> {
    const apiKey = this.getApiKey()

    const response = await fetch(`${this.baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: messages.map(m => ({ role: m.role, content: m.content })),
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens ?? 2000
      })
    })

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`)
    }

    const data = await response.json()

    return {
      content: data.choices[0]?.message?.content || '',
      usage: data.usage ? {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens,
        totalTokens: data.usage.total_tokens
      } : undefined,
      model: data.model
    }
  }

  async *streamChat(messages: AIMessage[], options: ChatOptions = {}): AsyncIterable<string> {
    const apiKey = this.getApiKey()

    const response = await fetch(`${this.baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: messages.map(m => ({ role: m.role, content: m.content })),
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens ?? 2000,
        stream: true
      })
    })

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`)
    }

    const reader = response.body?.getReader()
    if (!reader) throw new Error('No response body')

    const decoder = new TextDecoder()

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      const chunk = decoder.decode(value)
      const lines = chunk.split('\n').filter(line => line.trim().startsWith('data: '))

      for (const line of lines) {
        const data = line.slice(6)
        if (data === '[DONE]') continue

        try {
          const parsed = JSON.parse(data)
          const content = parsed.choices[0]?.delta?.content || ''
          if (content) yield content
        } catch (e) {
          // Skip invalid JSON
        }
      }
    }
  }

  validateConfig(config: AIProviderConfig): boolean {
    return !!config.apiKey && config.apiKey.startsWith('sk-')
  }

  private getApiKey(): string {
    if (typeof window === 'undefined') return ''
    const settings = localStorage.getItem('feynman-settings')
    if (settings) {
      const parsed = JSON.parse(settings)
      // 尝试从额外配置中获取 OpenAI API Key
      return parsed.openaiApiKey || parsed.apiKey || ''
    }
    return ''
  }
}

// Claude 提供商
class ClaudeProvider implements IAIProvider {
  type: AIProviderType = 'claude'
  name = 'Claude'
  private baseURL: string = 'https://api.anthropic.com/v1'

  async chat(messages: AIMessage[], options: ChatOptions = {}): Promise<AIResponse> {
    const apiKey = this.getApiKey()

    // 提取系统消息
    const systemMessage = messages.find(m => m.role === 'system')?.content
    const userMessages = messages.filter(m => m.role !== 'system')

    const response = await fetch(`${this.baseURL}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: options.maxTokens ?? 2000,
        system: systemMessage,
        messages: userMessages.map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }))
      })
    })

    if (!response.ok) {
      throw new Error(`Claude API error: ${response.status}`)
    }

    const data = await response.json()

    return {
      content: data.content[0]?.text || '',
      usage: data.usage ? {
        promptTokens: data.usage.input_tokens,
        completionTokens: data.usage.output_tokens,
        totalTokens: data.usage.input_tokens + data.usage.output_tokens
      } : undefined,
      model: data.model
    }
  }

  async *streamChat(messages: AIMessage[], options: ChatOptions = {}): AsyncIterable<string> {
    const apiKey = this.getApiKey()

    const systemMessage = messages.find(m => m.role === 'system')?.content
    const userMessages = messages.filter(m => m.role !== 'system')

    const response = await fetch(`${this.baseURL}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: options.maxTokens ?? 2000,
        system: systemMessage,
        messages: userMessages.map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content })),
        stream: true
      })
    })

    if (!response.ok) {
      throw new Error(`Claude API error: ${response.status}`)
    }

    const reader = response.body?.getReader()
    if (!reader) throw new Error('No response body')

    const decoder = new TextDecoder()

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      const chunk = decoder.decode(value)
      const lines = chunk.split('\n').filter(line => line.trim().startsWith('data: '))

      for (const line of lines) {
        const data = line.slice(6)

        try {
          const parsed = JSON.parse(data)

          if (parsed.type === 'content_block_delta') {
            const text = parsed.delta?.text || ''
            if (text) yield text
          }
        } catch (e) {
          // Skip invalid JSON
        }
      }
    }
  }

  validateConfig(config: AIProviderConfig): boolean {
    return !!config.apiKey && config.apiKey.startsWith('sk-ant-')
  }

  private getApiKey(): string {
    if (typeof window === 'undefined') return ''
    const settings = localStorage.getItem('feynman-settings')
    if (settings) {
      const parsed = JSON.parse(settings)
      return parsed.claudeApiKey || ''
    }
    return ''
  }
}

// AI 管理器
class AIProviderManager {
  private providers: Map<AIProviderType, IAIProvider> = new Map()
  private currentProvider: AIProviderType = 'deepseek'

  constructor() {
    // 注册默认提供商
    this.providers.set('deepseek', new DeepSeekProvider())
    this.providers.set('openai', new OpenAIProvider())
    this.providers.set('claude', new ClaudeProvider())
  }

  /**
   * 获取当前提供商
   */
  getCurrentProvider(): IAIProvider {
    return this.providers.get(this.currentProvider) || this.providers.get('deepseek')!
  }

  /**
   * 设置当前提供商
   */
  setProvider(type: AIProviderType): boolean {
    if (this.providers.has(type)) {
      this.currentProvider = type
      return true
    }
    return false
  }

  /**
   * 注册自定义提供商
   */
  registerProvider(type: AIProviderType, provider: IAIProvider): void {
    this.providers.set(type, provider)
  }

  /**
   * 获取所有提供商
   */
  getProviders(): Map<AIProviderType, IAIProvider> {
    return this.providers
  }

  /**
   * 执行聊天请求
   */
  async chat(messages: AIMessage[], options?: ChatOptions): Promise<AIResponse> {
    return this.getCurrentProvider().chat(messages, options)
  }

  /**
   * 执行流式聊天
   */
  async *streamChat(messages: AIMessage[], options?: ChatOptions): AsyncIterable<string> {
    yield* this.getCurrentProvider().streamChat(messages, options)
  }
}

// 全局单例
export const aiProviderManager = new AIProviderManager()

/**
 * 便捷函数：发送聊天请求
 */
export async function sendChatMessage(
  messages: AIMessage[],
  options?: ChatOptions
): Promise<AIResponse> {
  return aiProviderManager.chat(messages, options)
}

/**
 * 便捷函数：发送流式聊天请求
 */
export async function* sendStreamChatMessage(
  messages: AIMessage[],
  options?: ChatOptions
): AsyncIterable<string> {
  yield* aiProviderManager.streamChat(messages, options)
}

/**
 * 获取可用的提供商列表
 */
export function getAvailableProviders(): Array<{ type: AIProviderType; name: string }> {
  return Array.from(aiProviderManager.getProviders().values()).map(p => ({
    type: p.type,
    name: p.name
  }))
}
