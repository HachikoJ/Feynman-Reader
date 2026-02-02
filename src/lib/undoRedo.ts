/**
 * 撤销/重做功能模块
 * 支持操作的撤销和重做
 */

import { logger } from './logger'

export interface UndoRedoAction {
  id: string
  type: string
  description: string
  timestamp: number
  execute: () => void
  undo: () => void
}

export interface UndoRedoState {
  past: UndoRedoAction[]
  present: UndoRedoAction | null
  future: UndoRedoAction[]
}

class UndoRedoManager {
  private state: UndoRedoState = {
    past: [],
    present: null,
    future: []
  }

  private maxSize = 50 // 最大历史记录数
  private listeners: Set<(state: UndoRedoState) => void> = new Set()

  /**
   * 执行新操作
   */
  execute(action: UndoRedoAction) {
    // 如果有当前操作，先将其推入历史
    if (this.state.present) {
      this.state.past.push(this.state.present)
    }

    // 执行操作
    action.execute()

    // 设置为当前操作
    this.state.present = { ...action, timestamp: Date.now() }

    // 清空未来（撤销历史）
    this.state.future = []

    // 限制历史记录大小
    if (this.state.past.length > this.maxSize) {
      this.state.past.shift()
    }

    this.notify()
  }

  /**
   * 撤销
   */
  undo(): boolean {
    if (!this.state.present) return false

    const present = this.state.present

    // 执行撤销
    try {
      present.undo()
    } catch (e) {
      logger.error('Undo failed:', e)
      return false
    }

    // 当前操作移入未来
    this.state.future.unshift(present)

    // 从历史中取出上一个作为当前
    this.state.present = this.state.past.pop() || null

    this.notify()
    return true
  }

  /**
   * 重做
   */
  redo(): boolean {
    if (this.state.future.length === 0) return false

    const next = this.state.future.shift()!

    // 如果有当前操作，先推入历史
    if (this.state.present) {
      this.state.past.push(this.state.present)
    }

    // 执行重做
    try {
      next.execute()
    } catch (e) {
      logger.error('Redo failed:', e)
      return false
    }

    this.state.present = next

    this.notify()
    return true
  }

  /**
   * 清空历史
   */
  clear() {
    this.state = {
      past: [],
      present: null,
      future: []
    }
    this.notify()
  }

  /**
   * 获取状态
   */
  getState(): UndoRedoState {
    return { ...this.state }
  }

  /**
   * 是否可以撤销
   */
  canUndo(): boolean {
    return this.state.present !== null
  }

  /**
   * 是否可以重做
   */
  canRedo(): boolean {
    return this.state.future.length > 0
  }

  /**
   * 获取撤销描述
   */
  getUndoDescription(): string | null {
    return this.state.present?.description || null
  }

  /**
   * 获取重做描述
   */
  getRedoDescription(): string | null {
    return this.state.future[0]?.description || null
  }

  /**
   * 订阅状态变化
   */
  subscribe(listener: (state: UndoRedoState) => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private notify() {
    const state = this.getState()
    this.listeners.forEach(listener => listener(state))
  }
}

// 全局单例
export const undoRedoManager = new UndoRedoManager()

// 便捷操作工厂
export const createDeleteBookAction = (
  bookId: string,
  bookData: any,
  deleteFn: (id: string) => void,
  addFn: (book: any) => void
): UndoRedoAction => ({
  id: `delete-${bookId}-${Date.now()}`,
  type: 'delete_book',
  description: `删除书籍: ${bookData.name}`,
  timestamp: Date.now(),
  execute: () => deleteFn(bookId),
  undo: () => addFn(bookData)
})

export const createUpdateBookAction = (
  bookId: string,
  oldData: any,
  newData: any,
  updateFn: (id: string, data: any) => void
): UndoRedoAction => ({
  id: `update-${bookId}-${Date.now()}`,
  type: 'update_book',
  description: `修改书籍: ${newData.name || oldData.name}`,
  timestamp: Date.now(),
  execute: () => updateFn(bookId, newData),
  undo: () => updateFn(bookId, oldData)
})

export const createAddBookAction = (
  bookData: any,
  addFn: (book: any) => string,
  deleteFn: (id: string) => void
): UndoRedoAction => {
  let bookId: string | null = null
  return {
    id: `add-${Date.now()}`,
    type: 'add_book',
    description: `添加书籍: ${bookData.name}`,
    timestamp: Date.now(),
    execute: () => {
      bookId = addFn(bookData)
    },
    undo: () => {
      if (bookId) deleteFn(bookId)
    }
  }
}

export const createBatchDeleteBooksAction = (
  booksData: Array<{ id: string; data: any }>,
  deleteFn: (ids: string[]) => void,
  restoreFn: (books: any[]) => void
): UndoRedoAction => ({
  id: `batch-delete-${Date.now()}`,
  type: 'batch_delete_books',
  description: `批量删除 ${booksData.length} 本书`,
  timestamp: Date.now(),
  execute: () => deleteFn(booksData.map(b => b.id)),
  undo: () => restoreFn(booksData.map(b => b.data))
})

export const createUpdateSettingsAction = (
  oldSettings: any,
  newSettings: any,
  applyFn: (settings: any) => void
): UndoRedoAction => ({
  id: `update-settings-${Date.now()}`,
  type: 'update_settings',
  description: '修改设置',
  timestamp: Date.now(),
  execute: () => applyFn(newSettings),
  undo: () => applyFn(oldSettings)
})
