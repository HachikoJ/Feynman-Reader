/**
 * PWA Service Worker 注册 Hook
 */

import { useEffect, useState } from 'react'
import { logger } from './logger'

export type SWStatus = 'unsupported' | 'loading' | 'active' | 'update-available' | 'error'

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

    // 注册 Service Worker
    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        setRegistration(reg)
        setStatus('active')

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

    // 监听 Service Worker 控制变化
    const handleMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === 'SW_UPDATED') {
        setStatus('update-available')
      }
    }

    navigator.serviceWorker.addEventListener('message', handleMessage)
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      window.location.reload()
    })

    return () => {
      navigator.serviceWorker.removeEventListener('message', handleMessage)
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
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      // @ts-ignore
      window.navigator.standalone === true

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
