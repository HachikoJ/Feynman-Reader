/**
 * PWA Service Worker
 * 支持离线访问和资源缓存
 */

const APP_SHELL_CACHE = 'feynman-app-shell-v3'
const ASSET_CACHE = 'feynman-assets-v3'
const CURRENT_CACHES = new Set([APP_SHELL_CACHE, ASSET_CACHE])

// 需要预缓存的静态资源
const STATIC_ASSETS = [
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png'
]

async function fetchAndCache(request, cacheName, cacheKey = request) {
  const response = await fetch(request)
  if (response && response.status === 200 && response.type === 'basic') {
    const cache = await caches.open(cacheName)
    await cache.put(cacheKey, response.clone())
  }
  return response
}

async function networkFirst(request, cacheName, cacheKey, fallbackToRoot = false) {
  try {
    return await fetchAndCache(request, cacheName, cacheKey)
  } catch {
    const cachedResponse = await caches.match(cacheKey)
    if (cachedResponse) return cachedResponse
    if (fallbackToRoot) {
      const cachedRoot = await caches.match('/')
      if (cachedRoot) return cachedRoot
    }
    return new Response('离线模式不可用', {
      status: 503,
      statusText: 'Service Unavailable',
      headers: new Headers({ 'Content-Type': 'text/plain; charset=utf-8' })
    })
  }
}

async function cacheFirst(request, cacheKey) {
  const cachedResponse = await caches.match(cacheKey)
  if (cachedResponse) return cachedResponse
  return fetchAndCache(request, ASSET_CACHE, cacheKey)
}

// 安装事件：预缓存静态资源
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(ASSET_CACHE).then((cache) => {
      return cache.addAll(STATIC_ASSETS)
    })
  )
  self.skipWaiting()
})

// 激活事件：清理旧缓存
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys()
      await Promise.all(
        cacheNames
          .filter(name => name.startsWith('feynman-') && !CURRENT_CACHES.has(name))
          .map(name => caches.delete(name))
      )
      await self.clients.claim()
      const clients = await self.clients.matchAll({ type: 'window' })
      clients.forEach(client => client.postMessage({ type: 'SW_UPDATED' }))
    })()
  )
})

// 拦截网络请求
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // 只处理同源请求
  if (url.origin !== location.origin) {
    return
  }

  // API 请求不进入缓存，避免保存可能包含学习内容的响应
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(request))
    return
  }

  // 只缓存 GET 请求
  if (request.method !== 'GET') {
    return
  }

  const isAppRoute = ['/', '/privacy', '/privacy/'].includes(url.pathname)
  const isHashedAsset = url.pathname.startsWith('/_next/static/')
  const isPublicAsset = ['/manifest.json', '/icon-192.png', '/icon-512.png', '/favicon.ico', '/pdf.worker.min.mjs'].includes(url.pathname)

  // 不缓存未知路径，避免任意 URL 把浏览器缓存空间持续撑大。
  if (!isAppRoute && !isHashedAsset && !isPublicAsset) {
    event.respondWith(fetch(request))
    return
  }

  // 查询参数不参与缓存键，随机参数始终命中同一份公开静态资源。
  const cacheKey = new Request(`${url.origin}${url.pathname}`, { method: 'GET' })

  if (isAppRoute) {
    event.respondWith(networkFirst(request, APP_SHELL_CACHE, cacheKey, true))
    return
  }

  if (isHashedAsset) {
    event.respondWith(cacheFirst(request, cacheKey))
    return
  }

  event.respondWith(networkFirst(request, ASSET_CACHE, cacheKey))
})

// 消息事件：处理来自客户端的消息
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }

  if (event.data && event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter(name => name.startsWith('feynman-'))
            .map(name => caches.delete(name))
        )
      })
    )
  }
})
