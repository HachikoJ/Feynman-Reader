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
  activeTasks: ActiveAITask[]
  cancelling: boolean
}

type AITaskListener = () => void

class AIRequestManager {
  private controllers = new Map<string, AbortController>()
  private tasks = new Map<string, ActiveAITask>()
  private listeners = new Set<AITaskListener>()
  private snapshot: AITaskSnapshot = { active: null, activeTasks: [], cancelling: false }

  getSnapshot = (): AITaskSnapshot => this.snapshot

  subscribe = (listener: AITaskListener): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  async run<T>(context: AIRequestContext, execute: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const controller = new AbortController()
    const active: ActiveAITask = {
      ...context,
      id: `ai-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      startedAt: Date.now()
    }

    this.controllers.set(active.id, controller)
    this.tasks.set(active.id, active)
    this.publishSnapshot()

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
      this.controllers.delete(active.id)
      this.tasks.delete(active.id)
      this.publishSnapshot()
    }
  }

  async *runStream<T>(
    context: AIRequestContext,
    execute: (signal: AbortSignal) => Promise<AsyncIterable<T>>
  ): AsyncGenerator<T> {
    const controller = new AbortController()
    const active: ActiveAITask = {
      ...context,
      id: `ai-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      startedAt: Date.now()
    }
    this.controllers.set(active.id, controller)
    this.tasks.set(active.id, active)
    this.publishSnapshot()

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
      this.controllers.delete(active.id)
      this.tasks.delete(active.id)
      this.publishSnapshot()
    }
  }

  cancelActive(): boolean {
    const active = this.snapshot.active
    const controller = active ? this.controllers.get(active.id) : null
    if (!controller || !active) return false
    if (this.snapshot.cancelling) return true

    this.setSnapshot({ ...this.snapshot, cancelling: true })
    controller.abort()
    return true
  }

  private setSnapshot(snapshot: AITaskSnapshot): void {
    this.snapshot = snapshot
    this.listeners.forEach(listener => listener())
  }

  private publishSnapshot(): void {
    const activeTasks = [...this.tasks.values()].sort((left, right) => right.startedAt - left.startedAt)
    this.setSnapshot({
      active: activeTasks[0] || null,
      activeTasks,
      cancelling: false
    })
  }
}

export const aiRequestManager = new AIRequestManager()
