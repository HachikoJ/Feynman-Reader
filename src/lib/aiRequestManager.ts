/**
 * AI 请求管理器
 * 支持超时、重试、请求队列和响应缓存
 */

import { logger } from './logger'

export interface AIRequestOptions {
  timeout?: number // 请求超时时间（毫秒）
  retries?: number // 重试次数
  retryDelay?: number // 重试延迟（毫秒）
  cache?: boolean // 是否缓存响应
  cacheKey?: string // 缓存键
  priority?: 'high' | 'normal' | 'low' // 请求优先级
}

export interface AIRequest<T> {
  id: string
  execute: () => Promise<T>
  options: AIRequestOptions
  resolve: (value: T) => void
  reject: (error: Error) => void
  timeout?: ReturnType<typeof setTimeout>
  retries: number
  createdAt: number
}

class AIRequestManager {
  private queue: Map<string, AIRequest<any>> = new Map()
  private activeRequests: Set<string> = new Set()
  private cache: Map<string, { data: any; timestamp: number }> = new Map()
  private maxConcurrent = 3 // 最大并发请求数
  private cacheTimeout = 5 * 60 * 1000 // 缓存有效期 5 分钟

  /**
   * 执行 AI 请求
   */
  async execute<T>(
    requestFn: () => Promise<T>,
    options: AIRequestOptions = {}
  ): Promise<T> {
    const {
      timeout = 60000, // 默认 60 秒
      retries = 2,
      retryDelay = 1000,
      cache = true,
      cacheKey,
      priority = 'normal'
    } = options

    // 检查缓存
    if (cache && cacheKey && this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey)!
      // 检查缓存是否过期
      if (Date.now() - cached.timestamp < this.cacheTimeout) {
        logger.debug('[AI] 使用缓存响应:', cacheKey)
        return cached.data
      } else {
        this.cache.delete(cacheKey)
      }
    }

    const requestId = this.generateId()

    return new Promise<T>((resolve, reject) => {
      const request: AIRequest<T> = {
        id: requestId,
        execute: requestFn,
        options: { timeout, retries, retryDelay, cache, cacheKey, priority },
        resolve,
        reject,
        retries: 0,
        createdAt: Date.now()
      }

      this.queue.set(requestId, request)
      this.processQueue()
    })
  }

  /**
   * 处理请求队列
   */
  private processQueue() {
    // 如果已达到最大并发数，等待
    if (this.activeRequests.size >= this.maxConcurrent) {
      return
    }

    // 按优先级排序队列
    const sortedRequests = Array.from(this.queue.values())
      .filter(r => !this.activeRequests.has(r.id))
      .sort((a, b) => {
        const priorityOrder = { high: 0, normal: 1, low: 2 }
        const priorityDiff = priorityOrder[a.options.priority!] - priorityOrder[b.options.priority!]
        if (priorityDiff !== 0) return priorityDiff
        return a.createdAt - b.createdAt
      })

    // 找到可以执行的请求
    const availableSlots = this.maxConcurrent - this.activeRequests.size
    const toExecute = sortedRequests.slice(0, availableSlots)

    toExecute.forEach(request => {
      this.activeRequests.add(request.id)
      this.executeRequest(request)
    })
  }

  /**
   * 执行单个请求
   */
  private async executeRequest<T>(request: AIRequest<T>) {
    const { timeout, retries, retryDelay, cache, cacheKey } = request.options

    try {
      // 设置超时
      const timeoutPromise = new Promise<never>((_, reject) => {
        request.timeout = setTimeout(() => {
          reject(new Error(`请求超时 (${timeout}ms)`))
        }, timeout)
      })

      // 执行请求
      const result = await Promise.race([
        request.execute(),
        timeoutPromise
      ])

      // 清除超时
      if (request.timeout) {
        clearTimeout(request.timeout)
      }

      // 缓存结果
      if (cache && cacheKey) {
        this.cache.set(cacheKey, {
          data: result,
          timestamp: Date.now()
        })
      }

      request.resolve(result)

    } catch (error) {
      const errorObj = error instanceof Error ? error : new Error(String(error))

      // 重试逻辑
      if (request.retries < retries!) {
        request.retries++
        logger.warn(`[AI] 请求失败，重试 ${request.retries}/${retries}:`, errorObj.message)

        // 延迟后重试
        setTimeout(() => {
          this.executeRequest(request)
        }, retryDelay! * request.retries) // 指数退避
        return
      }

      // 达到最大重试次数，拒绝
      request.reject(errorObj)

    } finally {
      // 从活动请求中移除
      this.activeRequests.delete(request.id)
      this.queue.delete(request.id)

      // 处理下一个请求
      this.processQueue()
    }
  }

  /**
   * 取消请求
   */
  cancel(requestId: string): boolean {
    const request = this.queue.get(requestId)
    if (!request) return false

    if (request.timeout) {
      clearTimeout(request.timeout)
    }

    request.reject(new Error('请求已取消'))
    this.queue.delete(requestId)
    this.activeRequests.delete(requestId)

    // 处理下一个请求
    this.processQueue()

    return true
  }

  /**
   * 取消所有请求
   */
  cancelAll(): void {
    this.queue.forEach(request => {
      if (request.timeout) {
        clearTimeout(request.timeout)
      }
      request.reject(new Error('请求已取消'))
    })
    this.queue.clear()
    this.activeRequests.clear()
  }

  /**
   * 清除缓存
   */
  clearCache(pattern?: string): void {
    if (pattern) {
      // 清除匹配模式的缓存
      const regex = new RegExp(pattern)
      const keys = Array.from(this.cache.keys())
      for (const key of keys) {
        if (regex.test(key)) {
          this.cache.delete(key)
        }
      }
    } else {
      this.cache.clear()
    }
  }

  /**
   * 获取缓存统计
   */
  getCacheStats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys())
    }
  }

  /**
   * 获取队列状态
   */
  getQueueStatus(): {
    queued: number
    active: number
    pending: number
  } {
    return {
      queued: this.queue.size - this.activeRequests.size,
      active: this.activeRequests.size,
      pending: this.queue.size
    }
  }

  /**
   * 生成唯一 ID
   */
  private generateId(): string {
    return `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * 设置最大并发数
   */
  setMaxConcurrent(max: number): void {
    this.maxConcurrent = Math.max(1, max)
  }

  /**
   * 设置缓存超时
   */
  setCacheTimeout(timeout: number): void {
    this.cacheTimeout = timeout
  }
}

// 全局单例
export const aiRequestManager = new AIRequestManager()

/**
 * 便捷函数：执行 AI 请求
 */
export async function aiRequest<T>(
  requestFn: () => Promise<T>,
  options?: AIRequestOptions
): Promise<T> {
  return aiRequestManager.execute(requestFn, options)
}

/**
 * 便捷函数：带超时的 AI 请求
 */
export function aiRequestWithTimeout<T>(
  requestFn: () => Promise<T>,
  timeout: number = 60000
): Promise<T> {
  return aiRequest(requestFn, { timeout })
}

/**
 * 便捷函数：可缓存的 AI 请求
 */
export function cachedAIRequest<T>(
  requestFn: () => Promise<T>,
  cacheKey: string,
  options?: Omit<AIRequestOptions, 'cache' | 'cacheKey'>
): Promise<T> {
  return aiRequest(requestFn, { ...options, cache: true, cacheKey })
}

/**
 * Hook: AI 请求状态
 */
import { useState, useCallback, useRef } from 'react'

export function useAIRequest() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [queueStatus, setQueueStatus] = useState(aiRequestManager.getQueueStatus())
  const activeRequestRef = useRef<string | null>(null)

  const execute = useCallback(async <T>(
    requestFn: () => Promise<T>,
    options?: AIRequestOptions
  ): Promise<T | null> => {
    setLoading(true)
    setError(null)

    try {
      const result = await aiRequestManager.execute(requestFn, {
        ...options,
        cacheKey: options?.cacheKey || `use-ai-request-${Date.now()}`
      })

      setQueueStatus(aiRequestManager.getQueueStatus())
      return result
    } catch (err) {
      const errorObj = err instanceof Error ? err : new Error(String(err))
      setError(errorObj)
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  const cancel = useCallback(() => {
    if (activeRequestRef.current) {
      aiRequestManager.cancel(activeRequestRef.current)
    }
  }, [])

  return {
    loading,
    error,
    queueStatus,
    execute,
    cancel
  }
}

/**
 * Hook: AI 请求队列状态
 */
export function useAIQueueStatus() {
  const [status, setStatus] = useState(aiRequestManager.getQueueStatus())

  // 定期更新状态
  useState(() => {
    const interval = setInterval(() => {
      setStatus(aiRequestManager.getQueueStatus())
    }, 500)

    return () => clearInterval(interval)
  })

  return status
}
