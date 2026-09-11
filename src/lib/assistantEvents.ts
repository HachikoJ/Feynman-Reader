import type { AssistantSource } from './assistantSources'

export const ASSISTANT_OPEN_EVENT = 'feynman-open-assistant'

export interface AssistantOpenRequest {
  prompt?: string
  /** A selected passage or record that should remain attached to this draft. */
  source?: AssistantSource
  /** Associates the continuing session even when the question omits the title. */
  bookId?: string
}

export interface AssistantSelectionRequest {
  text: string
  source?: AssistantSource
  bookId?: string
  prompt?: string
  lang?: 'zh' | 'en'
}

export function requestAssistantOpen(request: AssistantOpenRequest = {}): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent<AssistantOpenRequest>(ASSISTANT_OPEN_EVENT, { detail: request }))
}

export function openAssistantWithPrompt(prompt: string, options: Omit<AssistantOpenRequest, 'prompt'> = {}): void {
  requestAssistantOpen({ ...options, prompt })
}

export function openAssistantWithSelection(request: AssistantSelectionRequest): void {
  const text = request.text.replace(/\s+/g, ' ').trim().slice(0, 2_000)
  if (!text) return
  const prompt = request.prompt?.trim() || (request.lang === 'en'
    ? `Help me understand this passage:\n\n> ${text}`
    : `请帮我深入理解这段内容：\n\n> ${text}`)
  requestAssistantOpen({
    prompt,
    ...(request.source ? { source: request.source } : {}),
    ...(request.bookId ? { bookId: request.bookId } : {})
  })
}
