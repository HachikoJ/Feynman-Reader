export const ASSISTANT_OPEN_EVENT = 'feynman-open-assistant'

export function openAssistantWithPrompt(prompt: string): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(ASSISTANT_OPEN_EVENT, { detail: { prompt } }))
}
