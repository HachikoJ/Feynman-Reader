/**
 * PWA Service Worker 注册 Hook
 */

import { useEffect, useState } from 'react'
import { logger } from './logger'

export type SWStatus = 'unsupported' | 'loading' | 'active' | 'update-available' | 'error'

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1'])

export function shouldDisableServiceWorker(hostname: string, environment = process.env.NODE_ENV): boolean {
  return environment !== 'production' || LOCAL_HOSTNAMES.has(hostname)
}

interface UseServiceWorkerReturn {
  status: SWStatus
  update: () => void
  clearCache: () => void
}

export function useServiceWorker(): UseServiceWorkerReturn {
  const [status, setStatus] = useState<SWStatus>('loading')
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return

    // 检查是否支持 Service Worker
    if (!('serviceWorker' in navigator)) {
      setStatus('unsupported')
      return
    }

    if (shouldDisableServiceWorker(window.location.hostname)) {
      setStatus('unsupported')
      void Promise.all([
        navigator.serviceWorker.getRegistrations().then(registrations => (
          Promise.all(registrations.map(current => current.unregister()))
        )),
        'caches' in window
          ? caches.keys().then(cacheNames => (
              Promise.all(
                cacheNames
                  .filter(name => name.startsWith('feynman-'))
                  .map(name => caches.delete(name))
              )
            ))
          : Promise.resolve([])
      ]).catch(error => {
        logger.warn('本地开发缓存清理失败:', error)
      })
      return
    }

    const hadController = Boolean(navigator.serviceWorker.controller)
    let reloadingForUpdate = false

    const handleMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === 'SW_UPDATED') {
        setStatus('update-available')
      }
    }

    const handleControllerChange = () => {
      if (!hadController || reloadingForUpdate) return
      reloadingForUpdate = true
      window.location.reload()
    }

    navigator.serviceWorker.addEventListener('message', handleMessage)
    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange)

    // 注册 Service Worker
    navigator.serviceWorker
      .register('/sw.js', { updateViaCache: 'none' })
      .then((reg) => {
        setRegistration(reg)
        setStatus('active')
        void reg.update().catch(error => {
          logger.warn('Service Worker 更新检查失败:', error)
        })

        // 检查更新
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                setStatus('update-available')
              }
            })
          }
        })
      })
      .catch((error) => {
        logger.error('Service Worker 注册失败:', error)
        setStatus('error')
      })

    return () => {
      navigator.serviceWorker.removeEventListener('message', handleMessage)
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange)
    }
  }, [])

  const update = () => {
    if (registration && registration.waiting) {
      registration.waiting.postMessage({ type: 'SKIP_WAITING' })
    }
  }

  const clearCache = () => {
    if (registration && registration.active) {
      registration.active.postMessage({ type: 'CLEAR_CACHE' })
    }
  }

  return { status, update, clearCache }
}

/**
 * 检测应用是否在离线状态
 */
export function useOfflineStatus(): boolean {
  const [isOffline, setIsOffline] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return

    const handleOnline = () => setIsOffline(false)
    const handleOffline = () => setIsOffline(true)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    // 初始状态
    setIsOffline(!navigator.onLine)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  return isOffline
}

/**
 * 检测应用是否作为 PWA 安装
 */
export function useIsPWA(): boolean {
  const [isPWA, setIsPWA] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return

    // 检查是否在独立窗口中运行
    const navigatorWithStandalone = window.navigator as Navigator & { standalone?: boolean }
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      navigatorWithStandalone.standalone === true

    setIsPWA(isStandalone)
  }, [])

  return isPWA
}

/**
 * PWA 安装提示 Hook
 */
export function useInstallPrompt(): {
  prompt: () => void
  isPromptAvailable: boolean
  isInstalled: boolean
} {
  const [prompt, setPrompt] = useState<any>(null)
  const [isPromptAvailable, setIsPromptAvailable] = useState(false)
  const isInstalled = useIsPWA()

  useEffect(() => {
    if (typeof window === 'undefined') return

    const handler = (e: Event) => {
      e.preventDefault()
      setPrompt(e)
      setIsPromptAvailable(true)
    }

    window.addEventListener('beforeinstallprompt', handler)

    return () => {
      window.removeEventListener('beforeinstallprompt', handler)
    }
  }, [])

  const promptInstall = () => {
    if (prompt) {
      prompt.prompt()
      prompt.userChoice.then((choiceResult: any) => {
        if (choiceResult.outcome === 'accepted') {
          setIsPromptAvailable(false)
        }
        setPrompt(null)
      })
    }
  }

  return {
    prompt: promptInstall,
    isPromptAvailable,
    isInstalled
  }
}
