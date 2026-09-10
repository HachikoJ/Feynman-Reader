/** Canonical routes for the standalone Feynman Reader product. */
export const APP_ROUTES = {
  home: '/',
  website: 'https://www.deline.top/'
} as const

/** History marker used for in-page reading steps (tabs and phases). */
export const READING_STEP_HISTORY_KEY = '__feynmanReaderReadingStep'

export function readerHref(origin = ''): string {
  return `${origin}${APP_ROUTES.home}`
}
