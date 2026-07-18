import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('service worker update strategy', () => {
  const source = readFileSync(join(process.cwd(), 'public/sw.js'), 'utf8')

  it('uses network-first app routes and versioned caches', () => {
    expect(source).toContain("const APP_SHELL_CACHE = 'feynman-app-shell-v3'")
    expect(source).toContain("const ASSET_CACHE = 'feynman-assets-v3'")
    expect(source).toContain('networkFirst(request, APP_SHELL_CACHE, cacheKey, true)')
    expect(source).toContain("name.startsWith('feynman-')")
  })

  it('keeps cache-first behavior limited to hashed static assets', () => {
    expect(source).toContain("url.pathname.startsWith('/_next/static/')")
    expect(source).toContain('cacheFirst(request, cacheKey)')
  })
})
