const SAFE_LINK_PROTOCOLS = new Set(['http:', 'https:', 'mailto:'])
const SAFE_IMAGE_PROTOCOLS = new Set(['http:', 'https:'])
const SAFE_IMAGE_DATA_URL = /^data:image\/(?:png|jpe?g|gif|webp|avif);base64,[a-z0-9+/=\s]+$/i

export function getSafeLinkHref(rawValue: string): string | null {
  const value = rawValue.trim()
  if (!value) return null
  if (value.startsWith('#')) return value
  if (value.startsWith('/') && !value.startsWith('//')) return value

  try {
    const url = new URL(value)
    return SAFE_LINK_PROTOCOLS.has(url.protocol) ? value : null
  } catch {
    return null
  }
}

export function getSafeImageSrc(rawValue?: string): string | null {
  const value = rawValue?.trim()
  if (!value) return null
  if (SAFE_IMAGE_DATA_URL.test(value)) return value
  if (value.startsWith('/') && !value.startsWith('//')) return value

  try {
    const url = new URL(value)
    return SAFE_IMAGE_PROTOCOLS.has(url.protocol) ? value : null
  } catch {
    return null
  }
}
