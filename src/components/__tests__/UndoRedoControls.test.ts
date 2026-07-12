/** @jest-environment jsdom */

import { isEditableShortcutTarget } from '../UndoRedoControls'

describe('undo and redo shortcut targets', () => {
  it('leaves text editing controls to the browser', () => {
    expect(isEditableShortcutTarget(document.createElement('input'))).toBe(true)
    expect(isEditableShortcutTarget(document.createElement('textarea'))).toBe(true)
    expect(isEditableShortcutTarget(document.createElement('select'))).toBe(true)

    const editable = document.createElement('div')
    editable.contentEditable = 'true'
    document.body.appendChild(editable)
    expect(isEditableShortcutTarget(editable)).toBe(true)
  })

  it('allows application shortcuts outside editable controls', () => {
    expect(isEditableShortcutTarget(document.createElement('button'))).toBe(false)
    expect(isEditableShortcutTarget(document.body)).toBe(false)
    expect(isEditableShortcutTarget(null)).toBe(false)
  })
})
