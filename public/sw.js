/**
 * PWA Service Worker
 * 支持离线访问和资源缓存
 */

const STATIC_CACHE = 'feynman-static-v2'
const DYNAMIC_CACHE = 'feynman-dynamic-v2'

// 需要预缓存的静态资源
const STATIC_ASSETS = [
  '/',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png'
]

// 安装事件：预缓存静态资源
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      return cache.addAll(STATIC_ASSETS)
    })
  )
  self.skipWaiting()
})

// 激活事件：清理旧缓存
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => {
            return name !== STATIC_CACHE && name !== DYNAMIC_CACHE
          })
          .map((name) => {
            return caches.delete(name)
          })
      )
    })
  )
  self.clients.claim()
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
  const isStaticAsset =
    url.pathname.startsWith('/_next/static/') ||
    ['/manifest.json', '/icon-192.png', '/icon-512.png', '/favicon.ico', '/pdf.worker.min.mjs'].includes(url.pathname)

  // 不缓存未知路径，避免任意 URL 把浏览器缓存空间持续撑大。
  if (!isAppRoute && !isStaticAsset) {
    event.respondWith(fetch(request))
    return
  }

  // 查询参数不参与缓存键，随机参数始终命中同一份公开静态资源。
  const cacheKey = new Request(`${url.origin}${url.pathname}`, { method: 'GET' })

  // 静态资源：缓存优先
  event.respondWith(
    caches.match(cacheKey).then((cachedResponse) => {
      if (cachedResponse) {
        // 后台更新缓存
        fetch(request)
          .then((response) => {
            if (response && response.status === 200 && response.type === 'basic') {
              caches.open(DYNAMIC_CACHE).then((cache) => cache.put(cacheKey, response))
            }
          })
          .catch(() => {})
        return cachedResponse
      }

      // 没有缓存，从网络获取
      return fetch(request)
        .then((response) => {
          // 只缓存成功的响应
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response
          }

          // 缓存响应
          const responseClone = response.clone()
          caches.open(DYNAMIC_CACHE).then((cache) => {
            cache.put(cacheKey, responseClone)
          })

          return response
        })
        .catch(() => {
          // 对于 HTML 请求，返回离线页面
          if (request.headers.get('accept')?.includes('text/html')) {
            return caches.match('/') || new Response('离线模式不可用', {
              status: 503,
              statusText: 'Service Unavailable',
              headers: new Headers({ 'Content-Type': 'text/plain' })
            })
          }
        })
    })
  )
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
          cacheNames.map((name) => caches.delete(name))
        )
      })
    )
  }
})
