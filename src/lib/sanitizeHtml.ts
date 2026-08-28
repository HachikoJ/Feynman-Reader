import DOMPurify from 'dompurify'

const COMMON_ATTRIBUTES = ['class', 'title', 'colspan', 'rowspan', 'align', 'open', 'start']

/** Sanitize AI-provided HTML before it reaches the DOM. */
export function sanitizeHtml(value: string, svg = false): string {
  if (svg) {
    return DOMPurify.sanitize(value, {
      USE_PROFILES: { svg: true, svgFilters: true },
      FORBID_TAGS: ['foreignObject', 'iframe', 'object', 'embed', 'script'],
      FORBID_ATTR: ['onerror', 'onload', 'onclick', 'style']
    })
  }

  return DOMPurify.sanitize(value, {
    ALLOWED_TAGS: [
      'a', 'abbr', 'b', 'blockquote', 'br', 'caption', 'code', 'del', 'details', 'em',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'i', 'kbd', 'li', 'mark', 'ol', 'p',
      'pre', 's', 'small', 'span', 'strong', 'sub', 'summary', 'sup', 'table', 'tbody', 'td',
      'tfoot', 'th', 'thead', 'tr', 'u', 'ul'
    ],
    ALLOWED_ATTR: [...COMMON_ATTRIBUTES, 'href', 'target', 'rel'],
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'textarea', 'button'],
    FORBID_ATTR: ['style', 'srcdoc']
  })
}
