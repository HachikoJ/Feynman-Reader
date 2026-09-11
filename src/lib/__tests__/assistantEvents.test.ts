/** @jest-environment jsdom */

import {
  ASSISTANT_OPEN_EVENT,
  openAssistantWithSelection,
  requestAssistantOpen,
  type AssistantOpenRequest
} from '../assistantEvents'
import { normalizeAssistantSource } from '../assistantSources'

describe('assistant open events', () => {
  it('dispatches structured selected text, source, and book context', () => {
    const listener = jest.fn((event: Event) => event)
    window.addEventListener(ASSISTANT_OPEN_EVENT, listener)
    const source = normalizeAssistantSource({
      kind: 'original',
      bookId: 'book-1',
      offset: 64,
      label: '原文',
      title: '第一章',
      excerpt: '  选择的原文  '
    })!

    openAssistantWithSelection({ text: '  选择的\n原文  ', source, bookId: 'book-1' })

    const event = listener.mock.calls[0][0] as CustomEvent<AssistantOpenRequest>
    expect(event.detail).toMatchObject({
      bookId: 'book-1',
      source,
      prompt: '请帮我深入理解这段内容：\n\n> 选择的 原文'
    })
    window.removeEventListener(ASSISTANT_OPEN_EVENT, listener)
  })

  it('keeps the legacy prompt helper behavior through the structured event', () => {
    const listener = jest.fn((event: Event) => event)
    window.addEventListener(ASSISTANT_OPEN_EVENT, listener)
    requestAssistantOpen({ prompt: '继续讨论', bookId: 'book-2' })

    expect((listener.mock.calls[0][0] as CustomEvent<AssistantOpenRequest>).detail)
      .toEqual({ prompt: '继续讨论', bookId: 'book-2' })
    window.removeEventListener(ASSISTANT_OPEN_EVENT, listener)
  })
})
