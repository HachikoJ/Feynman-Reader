export const AI_TASK_BUSY = 'AI_TASK_BUSY'
export const AI_REQUEST_CANCELLED = 'AI_REQUEST_CANCELLED'

export interface AIRequestContext {
  task: string
  bookId?: string
  sessionId?: string
}

export interface ActiveAITask extends AIRequestContext {
  id: string
  startedAt: number
}

export interface AITaskSnapshot {
  active: ActiveAITask | null
  cancelling: boolean
}

type AITaskListener = () => void

class AIRequestManager {
  private controller: AbortController | null = null
  private listeners = new Set<AITaskListener>()
  private snapshot: AITaskSnapshot = { active: null, cancelling: false }

  getSnapshot = (): AITaskSnapshot => this.snapshot

  subscribe = (listener: AITaskListener): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  async run<T>(context: AIRequestContext, execute: (signal: AbortSignal) => Promise<T>): Promise<T> {
    if (this.snapshot.active) throw new Error(AI_TASK_BUSY)

    const controller = new AbortController()
    const active: ActiveAITask = {
      ...context,
      id: `ai-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      startedAt: Date.now()
    }

    this.controller = controller
    this.setSnapshot({ active, cancelling: false })

    try {
      const result = await execute(controller.signal)
      if (controller.signal.aborted) throw new Error(AI_REQUEST_CANCELLED)
      return result
    } catch (error) {
      if (controller.signal.aborted) {
        throw new Error(AI_REQUEST_CANCELLED, { cause: error })
      }
      throw error
    } finally {
      if (this.controller === controller) {
        this.controller = null
        this.setSnapshot({ active: null, cancelling: false })
      }
    }
  }

  async *runStream<T>(
    context: AIRequestContext,
    execute: (signal: AbortSignal) => Promise<AsyncIterable<T>>
  ): AsyncGenerator<T> {
    if (this.snapshot.active) throw new Error(AI_TASK_BUSY)

    const controller = new AbortController()
    const active: ActiveAITask = {
      ...context,
      id: `ai-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      startedAt: Date.now()
    }
    this.controller = controller
    this.setSnapshot({ active, cancelling: false })

    try {
      const stream = await execute(controller.signal)
      for await (const item of stream) {
        if (controller.signal.aborted) throw new Error(AI_REQUEST_CANCELLED)
        yield item
      }
    } catch (error) {
      if (controller.signal.aborted) throw new Error(AI_REQUEST_CANCELLED, { cause: error })
      throw error
    } finally {
      if (this.controller === controller) {
        this.controller = null
        this.setSnapshot({ active: null, cancelling: false })
      }
    }
  }

  cancelActive(): boolean {
    if (!this.controller || !this.snapshot.active) return false
    if (this.snapshot.cancelling) return true

    this.setSnapshot({ ...this.snapshot, cancelling: true })
    this.controller.abort()
    return true
  }

  private setSnapshot(snapshot: AITaskSnapshot): void {
    this.snapshot = snapshot
    this.listeners.forEach(listener => listener())
  }
}

export const aiRequestManager = new AIRequestManager()
