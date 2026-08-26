import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('service worker update strategy', () => {
  const source = readFileSync(join(process.cwd(), 'public/sw.js'), 'utf8')
  const hookSource = readFileSync(join(process.cwd(), 'src/lib/useServiceWorker.ts'), 'utf8')
  const layoutSource = readFileSync(join(process.cwd(), 'src/app/layout.tsx'), 'utf8')

  it('uses network-first app routes and versioned caches', () => {
    expect(source).toContain("const APP_SHELL_CACHE = 'feynman-app-shell-v4'")
    expect(source).toContain("const ASSET_CACHE = 'feynman-assets-v4'")
    expect(source).toContain('networkFirst(request, APP_SHELL_CACHE, cacheKey, true)')
    expect(source).toContain("name.startsWith('feynman-')")
  })

  it('keeps cache-first behavior limited to hashed static assets', () => {
    expect(source).toContain("url.pathname.startsWith('/_next/static/')")
    expect(source).toContain('cacheFirst(request, cacheKey)')
  })

  it('never caches Next.js development chunks on local hosts', () => {
    expect(source).toContain('if (IS_LOCAL_DEVELOPMENT)')
    expect(source).toContain('event.respondWith(fetch(request))')
    expect(source).toContain('self.registration.unregister()')
    expect(hookSource).toContain('shouldDisableServiceWorker(window.location.hostname)')
    expect(hookSource).toContain("name.startsWith('feynman-')")
    expect(hookSource).toContain('current.unregister()')
    expect(layoutSource).toContain("process.env.NODE_ENV === 'development'")
    expect(layoutSource).toContain('feynman-local-cache-reset-v4')
    expect(layoutSource).toContain('registration.unregister()')
  })
})
