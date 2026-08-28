/** Canonical routes for the standalone Feynman Reader product. */
export const APP_ROUTES = {
  home: '/',
  website: 'https://www.deline.top/'
} as const

export function readerHref(origin = ''): string {
  return `${origin}${APP_ROUTES.home}`
}
