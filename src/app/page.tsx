'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import { AlertTriangle, CircleHelp, RefreshCw } from 'lucide-react'
import { logger } from '@/lib/logger'
import {
  AppSettings,
  Book,
  flushPendingStoreWrites,
  getBooks,
  getSettings,
  initializeStore,
  reloadSettingsFromPersistence,
  saveSettings,
  subscribeToPersistenceErrors
} from '@/lib/store'
import { t } from '@/lib/i18n'
import Settings from '@/components/Settings'
import Bookshelf from '@/components/Bookshelf'
import ReadingView from '@/components/ReadingView'
import ApiKeyAlert from '@/components/ApiKeyAlert'
import BackToTop from '@/components/BackToTop'
import AuthGuard from '@/components/AuthGuard'
import Onboarding, { ONBOARDING_COMPLETED_KEY, ONBOARDING_VERSION } from '@/components/Onboarding'
import DataLossWarning from '@/components/DataLossWarning'
import Toast from '@/components/Toast'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import UndoRedoControls, { useUndoRedoShortcuts } from '@/components/UndoRedoControls'
import {
  BACKUP_REMINDER_INTERVAL_MS,
  DATA_RISK_ACKNOWLEDGED_KEY,
  DATA_RISK_NOTICE_VERSION,
  LAST_BACKUP_AT_KEY,
  hasAcknowledgedCurrentDataRisk,
  shouldShowBackupWarning
} from '@/lib/backupReminder'
import { getActiveStartupPrompt } from '@/lib/startupPrompt'
import { validateApiKey } from '@/lib/validation'

type View = 'bookshelf' | 'reading' | 'settings'

export default function Home() {
  const [view, setView] = useState<View>('bookshelf')
  const [settings, setSettings] = useState<AppSettings>({
    apiKey: '',
    language: 'zh',
    theme: 'light',
    hideApiKeyAlert: false,
    quotes: [],
    quotesInitialized: false
  })
  const [selectedBook, setSelectedBook] = useState<Book | null>(null)
  const [showApiKeyAlert, setShowApiKeyAlert] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [initializationError, setInitializationError] = useState(false)
  const [storageWriteError, setStorageWriteError] = useState(false)
  const [bookshelfKey, setBookshelfKey] = useState(0) // 用于强制刷新书架
  const [showOnboarding, setShowOnboarding] = useState(false) // P0 新增：新手引导
  const [showDataLossWarning, setShowDataLossWarning] = useState(false)
  const [backupDue, setBackupDue] = useState(false)
  const [openDataManagement, setOpenDataManagement] = useState(false)
  const [focusApiConfigurationRequest, setFocusApiConfigurationRequest] = useState(0)

  // P1 新增：启用撤销/重做快捷键
  useUndoRedoShortcuts()

  useEffect(() => {
    let cancelled = false
    const unsubscribePersistenceErrors = subscribeToPersistenceErrors(() => {
      if (!cancelled) setStorageWriteError(true)
    })

    const initialize = async () => {
      try {
        await initializeStore()
      } catch (error) {
        logger.error('IndexedDB initialization failed:', error)
        if (!cancelled) {
          setInitializationError(true)
          setMounted(true)
        }
        return
      }

      if (cancelled) return

      const saved = getSettings()
      setSettings(saved)
      document.documentElement.setAttribute('data-theme', saved.theme)

      if (!saved.apiKey && !saved.hideApiKeyAlert) {
        setShowApiKeyAlert(true)
      }

      const books = getBooks()
      const completedOnboardingVersion = localStorage.getItem(ONBOARDING_COMPLETED_KEY)
      if (completedOnboardingVersion !== ONBOARDING_VERSION) {
        setShowOnboarding(true)
      }

      const acknowledged = hasAcknowledgedCurrentDataRisk(localStorage.getItem(DATA_RISK_ACKNOWLEDGED_KEY))
      const lastBackupValue = localStorage.getItem(LAST_BACKUP_AT_KEY)
      const lastBackupAt = lastBackupValue ? Number(lastBackupValue) : null
      const needsBackup = acknowledged && books.length > 0 && (!lastBackupAt || Date.now() - lastBackupAt >= BACKUP_REMINDER_INTERVAL_MS)
      setBackupDue(needsBackup)
      setShowDataLossWarning(shouldShowBackupWarning({
        acknowledged,
        bookCount: books.length,
        lastBackupAt
      }))

      setMounted(true)
    }

    void initialize()
    return () => {
      cancelled = true
      unsubscribePersistenceErrors()
    }
  }, [])

  const handleSettingsChange = (newSettings: AppSettings) => {
    setSettings(newSettings)
    document.documentElement.setAttribute('data-theme', newSettings.theme)
  }

  const handleSelectBook = (book: Book) => {
    const apiKey = settings.apiKey.trim()
    if (!apiKey && !settings.hideApiKeyAlert) {
      setShowApiKeyAlert(true)
      return
    }
    if (apiKey && (!validateApiKey(apiKey).valid || !settings.aiDataConsent)) {
      setSelectedBook(null)
      setShowApiKeyAlert(false)
      setFocusApiConfigurationRequest(request => request + 1)
      setView('settings')
      return
    }
    setSelectedBook(book)
    setView('reading')
  }

  const handleDontRemind = async () => {
    const newSettings = { ...settings, hideApiKeyAlert: true }
    try {
      await flushPendingStoreWrites()
      saveSettings(newSettings)
      await flushPendingStoreWrites()
      setSettings(newSettings)
      setShowApiKeyAlert(false)
    } catch (error) {
      logger.error('Failed to save API key reminder preference:', error)
      const restored = await reloadSettingsFromPersistence().catch(() => settings)
      setSettings(restored)
      setStorageWriteError(true)
    }
  }

  const handleOpenOnboarding = () => {
    localStorage.removeItem(ONBOARDING_COMPLETED_KEY)
    setShowApiKeyAlert(false)
    setShowOnboarding(true)
  }

  const handleOnboardingComplete = () => {
    setShowOnboarding(false)
    if (!settings.apiKey && !settings.hideApiKeyAlert) {
      setShowApiKeyAlert(true)
    }
  }

  const acknowledgeDataRisk = (goToBackup: boolean) => {
    localStorage.setItem(DATA_RISK_ACKNOWLEDGED_KEY, DATA_RISK_NOTICE_VERSION)
    setShowDataLossWarning(false)

    if (goToBackup) {
      setShowApiKeyAlert(false)
      setShowOnboarding(false)
      setSelectedBook(null)
      setOpenDataManagement(true)
      setView('settings')
    }
  }

  const lang = settings.language
  const activeStartupPrompt = getActiveStartupPrompt({
    showDataLossWarning,
    showOnboarding,
    showApiKeyAlert
  })

  if (!mounted) {
    return null
  }

  if (initializationError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-primary)] px-4">
        <div role="alert" className="card max-w-lg p-8 text-center">
          <AlertTriangle className="mx-auto mb-4 h-12 w-12 text-amber-500" aria-hidden="true" />
          <h1 className="mb-3 text-xl font-bold">本地数据暂时无法读取</h1>
          <p className="mb-6 text-sm leading-6 text-[var(--text-secondary)]">
            为避免把空数据误当成真实书架，应用已暂停加载。请关闭其他同站点页面后重试；不要清除浏览器数据。
          </p>
          <button type="button" onClick={() => window.location.reload()} className="btn-primary inline-flex items-center gap-2">
            <RefreshCw size={18} aria-hidden="true" />
            重新读取
          </button>
        </div>
      </div>
    )
  }

  return (
    <ErrorBoundary lang={lang}>
      <AuthGuard>
        <div className="min-h-screen">
          {storageWriteError && (
            <div role="alert" className="sticky top-0 z-50 border-b border-red-500/50 bg-red-950 px-4 py-3 text-sm text-red-100">
              <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
                <span>
                  {lang === 'zh'
                    ? '本地保存失败，当前页面中的最新修改可能在刷新后丢失。请勿刷新，并立即导出数据备份。'
                    : 'Local saving failed. Recent changes may be lost after refresh. Do not refresh; export a backup now.'}
                </span>
                <button
                  type="button"
                  className="btn-secondary shrink-0 py-2 text-sm"
                  onClick={() => {
                    setSelectedBook(null)
                    setOpenDataManagement(true)
                    setView('settings')
                  }}
                >
                  {lang === 'zh' ? '前往备份' : 'Open Backup'}
                </button>
              </div>
            </div>
          )}
          {/* Navigation */}
        <nav className="sticky top-0 z-40 backdrop-blur-lg bg-[var(--bg-primary)]/80 border-b border-[var(--border)]">
          <div className="max-w-6xl mx-auto px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="relative h-12 w-12 shrink-0 overflow-hidden">
                  <Image
                    src="/icon-192.png"
                    alt=""
                    fill
                    sizes="48px"
                    className="scale-[1.75] object-contain"
                    priority
                  />
                </div>
                <span className="text-xl font-bold text-gradient">{t(lang, 'app.title')}</span>
              </div>
              
              <div className="flex items-center gap-1">
                <button
                  onClick={() => { 
                    setView('bookshelf')
                    setSelectedBook(null)
                    setBookshelfKey(prev => prev + 1) // 强制刷新书架
                  }}
                  className={`nav-item ${view === 'bookshelf' ? 'active' : ''}`}
                >
                  📚 {t(lang, 'nav.bookshelf')}
                </button>
                <button
                  onClick={() => setView('settings')}
                  className={`nav-item ${view === 'settings' ? 'active' : ''}`}
                >
                  ⚙️ {t(lang, 'nav.settings')}
                </button>
                <button
                  type="button"
                  onClick={handleOpenOnboarding}
                  className="flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-[var(--accent)]/35 bg-[var(--accent)]/10 px-2.5 text-[var(--accent)] transition-colors hover:bg-[var(--accent)]/15"
                  aria-label={lang === 'zh' ? '打开使用引导' : 'Open user guide'}
                  title={lang === 'zh' ? '使用引导' : 'User guide'}
                >
                  <CircleHelp size={20} aria-hidden="true" />
                  <span className="hidden text-sm font-medium lg:inline">
                    {lang === 'zh' ? '使用引导' : 'Guide'}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </nav>

        {/* Main Content */}
        <main className="max-w-6xl mx-auto px-4 py-8">
          {view === 'bookshelf' && !selectedBook && (
            <Bookshelf key={bookshelfKey} lang={lang} onSelectBook={handleSelectBook} />
          )}
          
          {view === 'reading' && selectedBook && (
            <ReadingView
              book={selectedBook}
              apiKey={settings.apiKey}
              lang={lang}
              quotes={settings.quotes}
              onBack={() => { 
                setSelectedBook(null)
                setView('bookshelf')
                setBookshelfKey(prev => prev + 1) // 强制刷新书架以显示最新数据
              }}
              onOpenSettings={() => setView('settings')}
            />
          )}
          
          {view === 'settings' && (
            <Settings
              onSettingsChange={handleSettingsChange}
              openDataManagement={openDataManagement}
              focusApiConfigurationRequest={focusApiConfigurationRequest}
              onBackupCompleted={() => {
                setBackupDue(false)
                setOpenDataManagement(false)
              }}
            />
          )}
        </main>

        {/* Footer */}
        <footer className="border-t border-[var(--border)] mt-12">
          <div className="max-w-6xl mx-auto px-4 py-8">
            {/* 金句 */}
            <div className="text-center mb-8">
              <p className="text-[var(--text-secondary)] italic">{t(lang, 'app.quote')}</p>
              <p className="text-[var(--text-secondary)] text-sm mt-1">{t(lang, 'app.quoteAuthor')}</p>
            </div>
            
            {/* 网站信息 */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm text-[var(--text-secondary)]">
              {/* 关于 */}
              <div className="text-center md:text-left">
                <h4 className="font-medium text-[var(--text-primary)] mb-2">
                  {lang === 'zh' ? '关于费曼读书助手' : 'About Feynman Reader'}
                </h4>
                <p className="text-xs leading-relaxed">
                  {lang === 'zh' 
                    ? '基于费曼学习法的智能阅读工具，通过"以教代学"的方式帮助你深度理解每一本书。'
                    : 'An intelligent reading tool based on the Feynman Technique, helping you deeply understand every book through teaching.'}
                </p>
              </div>
              
              {/* 功能特点 */}
              <div className="text-center">
                <h4 className="font-medium text-[var(--text-primary)] mb-2">
                  {lang === 'zh' ? '核心功能' : 'Features'}
                </h4>
                <p className="text-xs leading-relaxed">
                  {lang === 'zh' 
                    ? '六阶段深度阅读 · AI智能分析 · 费曼实践评估 · 阅读进度管理'
                    : '6-Phase Reading · AI Analysis · Feynman Practice · Progress Tracking'}
                </p>
              </div>
              
              {/* 版权 */}
              <div className="text-center md:text-right">
                <h4 className="font-medium text-[var(--text-primary)] mb-2">
                  {lang === 'zh' ? '版权信息' : 'Copyright'}
                </h4>
                <p className="text-xs">© 2025 费曼读书助手</p>
                <p className="text-xs mt-1">
                  {lang === 'zh' ? '保留所有权利' : 'All Rights Reserved'}
                </p>
              </div>
            </div>
            
            {/* 底部分隔线和备案信息 */}
            <div className="border-t border-[var(--border)] mt-6 pt-4 text-center text-xs text-[var(--text-secondary)]">
              <p>{lang === 'zh' ? '用费曼学习法，让阅读更有深度' : 'Read deeper with the Feynman Technique'}</p>
            </div>
          </div>
        </footer>

        {/* API Key Alert Modal */}
        {activeStartupPrompt === 'api-key' && (
          <ApiKeyAlert
            lang={lang}
            onGoSettings={() => { setShowApiKeyAlert(false); setView('settings') }}
            onLater={() => setShowApiKeyAlert(false)}
            onDontRemind={handleDontRemind}
          />
        )}

        {/* P0 新增：新手引导 */}
        {activeStartupPrompt === 'onboarding' && (
          <Onboarding
            lang={lang}
            onComplete={handleOnboardingComplete}
          />
        )}

        {activeStartupPrompt === 'data-risk' && (
          <DataLossWarning
            lang={lang}
            backupDue={backupDue}
            onContinue={() => acknowledgeDataRisk(false)}
            onOpenBackup={() => acknowledgeDataRisk(true)}
          />
        )}

        {/* Back to Top Button */}
        <BackToTop />

        {/* Toast Notifications */}
        <Toast lang={lang} position="top-right" />

        {/* P1 新增：撤销/重做控制 */}
        <UndoRedoControls lang={lang} />
      </div>
    </AuthGuard>
    </ErrorBoundary>
  )
}
