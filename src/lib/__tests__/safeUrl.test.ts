import { getSafeImageSrc, getSafeLinkHref } from '../safeUrl'

describe('safe URL helpers', () => {
  it('allows expected links and blocks executable or local protocols', () => {
    expect(getSafeLinkHref('https://example.com')).toBe('https://example.com')
    expect(getSafeLinkHref('/privacy')).toBe('/privacy')
    expect(getSafeLinkHref('mailto:test@example.com')).toBe('mailto:test@example.com')
    expect(getSafeLinkHref('javascript:alert(1)')).toBeNull()
    expect(getSafeLinkHref('data:text/html,hello')).toBeNull()
    expect(getSafeLinkHref('file:///tmp/private')).toBeNull()
  })

  it('only allows web images and supported base64 image data', () => {
    expect(getSafeImageSrc('https://example.com/cover.jpg')).toBe('https://example.com/cover.jpg')
    expect(getSafeImageSrc('/kite-runner-cover.png')).toBe('/kite-runner-cover.png')
    expect(getSafeImageSrc('data:image/png;base64,AAAA')).toBe('data:image/png;base64,AAAA')
    expect(getSafeImageSrc('//evil.example/cover.png')).toBeNull()
    expect(getSafeImageSrc('data:text/html;base64,AAAA')).toBeNull()
    expect(getSafeImageSrc('javascript:alert(1)')).toBeNull()
    expect(getSafeImageSrc('file:///tmp/private.png')).toBeNull()
  })
})
