/** @jest-environment node */

jest.mock('../logger', () => ({
  logger: {
    error: jest.fn()
  }
}))

import { undoRedoManager, type UndoRedoAction } from '../undoRedo'

function action(overrides: Partial<UndoRedoAction> = {}): UndoRedoAction {
  return {
    id: 'action-1',
    type: 'test',
    description: '测试操作',
    timestamp: 1,
    execute: jest.fn(),
    undo: jest.fn(),
    ...overrides
  }
}

describe('async undo and redo history', () => {
  beforeEach(() => {
    undoRedoManager.clear()
  })

  it('does not add a failed action to history', async () => {
    const failed = action({ execute: jest.fn().mockRejectedValue(new Error('save failed')) })

    await expect(undoRedoManager.execute(failed)).resolves.toBe(false)
    expect(undoRedoManager.canUndo()).toBe(false)
    expect(undoRedoManager.canRedo()).toBe(false)
  })

  it('keeps the current action when undo persistence fails', async () => {
    const failedUndo = action({ undo: jest.fn().mockRejectedValue(new Error('restore failed')) })
    await expect(undoRedoManager.execute(failedUndo)).resolves.toBe(true)

    await expect(undoRedoManager.undo()).resolves.toBe(false)
    expect(undoRedoManager.getUndoDescription()).toBe('测试操作')
    expect(undoRedoManager.canRedo()).toBe(false)
  })

  it('keeps the future action when redo persistence fails', async () => {
    const execute = jest.fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('redo failed'))
    const failedRedo = action({ execute })

    await expect(undoRedoManager.execute(failedRedo)).resolves.toBe(true)
    await expect(undoRedoManager.undo()).resolves.toBe(true)
    await expect(undoRedoManager.redo()).resolves.toBe(false)

    expect(undoRedoManager.canUndo()).toBe(false)
    expect(undoRedoManager.getRedoDescription()).toBe('测试操作')
  })

  it('updates history only after an async action finishes', async () => {
    let finish: (() => void) | undefined
    const pending = action({
      execute: jest.fn(() => new Promise<void>(resolve => {
        finish = resolve
      }))
    })

    const execution = undoRedoManager.execute(pending)
    expect(undoRedoManager.canUndo()).toBe(false)

    finish?.()
    await expect(execution).resolves.toBe(true)
    expect(undoRedoManager.canUndo()).toBe(true)
  })
})
