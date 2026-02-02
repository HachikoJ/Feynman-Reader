/**
 * PWA Service Worker
 * 支持离线访问和资源缓存
 */

const CACHE_NAME = 'feynman-reading-v1'
const STATIC_CACHE = 'feynman-static-v1'
const DYNAMIC_CACHE = 'feynman-dynamic-v1'

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

  // API 请求：网络优先
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // 克隆响应并缓存
          const responseClone = response.clone()
          caches.open(DYNAMIC_CACHE).then((cache) => {
            cache.put(request, responseClone)
          })
          return response
        })
        .catch(() => {
          // 网络失败时尝试从缓存读取
          return caches.match(request)
        })
    )
    return
  }

  // 静态资源：缓存优先
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        // 后台更新缓存
        fetch(request).then((response) => {
          caches.open(DYNAMIC_CACHE).then((cache) => {
            cache.put(request, response)
          })
        })
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
            cache.put(request, responseClone)
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
