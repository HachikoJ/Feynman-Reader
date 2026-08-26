'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import { AlertTriangle, CircleHelp, RefreshCw, UsersRound } from 'lucide-react'
import { logger } from '@/lib/logger'
import {
  AppSettings,
  Book,
  getBooks,
  getSettings,
  initializeStore,
  subscribeToPersistenceErrors
} from '@/lib/store'
import { t } from '@/lib/i18n'
import Settings from '@/components/Settings'
import Bookshelf from '@/components/Bookshelf'
import ReadingView from '@/components/ReadingView'
import BackToTop from '@/components/BackToTop'
import AuthGuard from '@/components/AuthGuard'
import Onboarding, { ONBOARDING_COMPLETED_KEY, ONBOARDING_VERSION } from '@/components/Onboarding'
import TokenDanceWelcome, {
  TOKENDANCE_WELCOME_KEY,
  TOKENDANCE_WELCOME_VERSION
} from '@/components/TokenDanceWelcome'
import TokenDanceMigrationNotice, {
  TOKENDANCE_MIGRATION_NOTICE_KEY,
  TOKENDANCE_MIGRATION_NOTICE_VERSION
} from '@/components/TokenDanceMigrationNotice'
import DataLossWarning from '@/components/DataLossWarning'
import AppIcon from '@/components/AppIcon'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import UndoRedoControls, { useUndoRedoShortcuts } from '@/components/UndoRedoControls'
import {
  DATA_RISK_ACKNOWLEDGED_KEY,
  DATA_RISK_NOTICE_VERSION,
  LAST_BACKUP_AT_KEY,
  hasBackupRelevantLearningData,
  hasAcknowledgedCurrentDataRisk,
  isBackupReminderDue,
  shouldShowBackupWarning
} from '@/lib/backupReminder'
import {
  getActiveStartupPrompt,
  isAIConfigurationComplete,
  shouldShowOnboarding,
  shouldShowTokenDanceWelcome,
  shouldShowTokenDanceMigration,
  hasUserHistory
} from '@/lib/startupPrompt'
import { useServiceWorker } from '@/lib/useServiceWorker'
import AITaskStatus from '@/components/AITaskStatus'
import { LoadingState, Skeleton } from '@/components/Skeleton'
import AppDialogHost from '@/components/AppDialogHost'

type View = 'bookshelf' | 'reading' | 'settings'

function GitHubMark() {
  return (
    <svg viewBox="0 0 24 24" width="21" height="21" fill="currentColor" aria-hidden="true">
      <path d="M12 .7a11.5 11.5 0 0 0-3.64 22.41c.58.11.79-.25.79-.56v-2.24c-3.22.7-3.9-1.37-3.9-1.37-.52-1.34-1.28-1.69-1.28-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.57-.29-5.27-1.28-5.27-5.69 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.47.11-3.05 0 0 .97-.31 3.16 1.18A10.98 10.98 0 0 1 12 6.11c.98 0 1.96.13 2.88.39 2.19-1.49 3.15-1.18 3.15-1.18.63 1.58.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.42-2.71 5.39-5.29 5.68.42.36.79 1.07.79 2.16v3.25c0 .31.21.68.8.56A11.5 11.5 0 0 0 12 .7Z" />
    </svg>
  )
}

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
  const [showTokenDanceWelcome, setShowTokenDanceWelcome] = useState(false)
  const [showTokenDanceMigration, setShowTokenDanceMigration] = useState(false)
  const [showDataLossWarning, setShowDataLossWarning] = useState(false)
  const [backupDue, setBackupDue] = useState(false)
  const [openDataManagement, setOpenDataManagement] = useState(false)
  const [focusApiConfigurationRequest, setFocusApiConfigurationRequest] = useState(0)

  // P1 新增：启用撤销/重做快捷键
  useUndoRedoShortcuts(settings.language)
  useServiceWorker()

  useEffect(() => {
    let cancelled = false
    const isTokenDanceCallback = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('tokendance_callback') === '1'
    if (isTokenDanceCallback) {
      setView('settings')
    }
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
      const books = getBooks()
      const userHasHistory = hasUserHistory(books)

      const completedOnboardingVersion = localStorage.getItem(ONBOARDING_COMPLETED_KEY)
      if (shouldShowOnboarding(completedOnboardingVersion, ONBOARDING_VERSION, isTokenDanceCallback)) {
        setShowOnboarding(true)
      }

      const completedTokenDanceWelcomeVersion = localStorage.getItem(TOKENDANCE_WELCOME_KEY)
      if (shouldShowTokenDanceWelcome(
        completedTokenDanceWelcomeVersion,
        TOKENDANCE_WELCOME_VERSION,
        isTokenDanceCallback,
        isAIConfigurationComplete(saved),
        userHasHistory
      )) {
        setShowTokenDanceWelcome(true)
      }

      const completedMigrationNoticeVersion = localStorage.getItem(TOKENDANCE_MIGRATION_NOTICE_KEY)
      if (shouldShowTokenDanceMigration(
        completedMigrationNoticeVersion,
        TOKENDANCE_MIGRATION_NOTICE_VERSION,
        isTokenDanceCallback,
        userHasHistory
      )) {
        setShowTokenDanceMigration(true)
      }

      const acknowledged = hasAcknowledgedCurrentDataRisk(localStorage.getItem(DATA_RISK_ACKNOWLEDGED_KEY))
      const lastBackupValue = localStorage.getItem(LAST_BACKUP_AT_KEY)
      const lastBackupAt = lastBackupValue ? Number(lastBackupValue) : null
      const learningDataCount = books.filter(hasBackupRelevantLearningData).length
      const needsBackup = isBackupReminderDue({ bookCount: learningDataCount, lastBackupAt })
      setBackupDue(needsBackup)
      setShowDataLossWarning(shouldShowBackupWarning({
        acknowledged,
        bookCount: learningDataCount,
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
    if (isAIConfigurationComplete(newSettings)) {
      setShowApiKeyAlert(false)
    }
  }

  const handleSelectBook = (book: Book) => {
    setShowApiKeyAlert(false)
    setSelectedBook(book)
    setView('reading')
  }

  const handleOpenApiSettings = () => {
    setShowApiKeyAlert(false)
    setFocusApiConfigurationRequest(request => request + 1)
    setView('settings')
  }

  const handleOpenOnboarding = () => {
    localStorage.removeItem(ONBOARDING_COMPLETED_KEY)
    setShowApiKeyAlert(false)
    setShowOnboarding(true)
  }

  const handleOnboardingComplete = () => {
    setShowOnboarding(false)
    const persistedSettings = getSettings()
    setSettings(persistedSettings)
  }

  const handleTokenDanceWelcomeComplete = () => {
    setShowTokenDanceWelcome(false)
  }

  const handleTokenDanceMigrationClose = () => {
    setShowTokenDanceMigration(false)
  }

  const handleOpenTokenDanceMigration = () => {
    setShowTokenDanceMigration(true)
  }

  const handleOnboardingConfigureApi = () => {
    setShowApiKeyAlert(false)
    setFocusApiConfigurationRequest(request => request + 1)
    setView('settings')
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
    showTokenDanceWelcome,
    showTokenDanceMigration,
    showOnboarding,
    showApiKeyAlert
  })

  if (!mounted) {
    return (
      <div className="min-h-screen bg-[var(--bg-primary)]" aria-busy="true" aria-label="正在读取本地书架">
        <nav className="border-b border-[var(--border)] bg-[var(--bg-primary)]">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
            <div className="flex items-center gap-3">
              <Skeleton className="h-12 w-12 rounded-lg" />
              <Skeleton className="hidden h-6 w-36 sm:block" />
            </div>
            <div className="flex gap-2">
              <Skeleton className="h-11 w-24 rounded-lg" />
              <Skeleton className="h-11 w-24 rounded-lg" />
              <Skeleton className="h-11 w-11 rounded-lg" />
            </div>
          </div>
        </nav>
        <main className="mx-auto max-w-6xl px-4 py-8">
          <div className="mb-6 space-y-2">
            <Skeleton className="h-9 w-40" />
            <Skeleton className="h-4 w-56" />
          </div>
          <LoadingState type="bookshelf" count={8} lang="zh" />
        </main>
      </div>
    )
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
          <AppDialogHost lang={lang} />
          <AITaskStatus lang={lang} />
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
              <button
                type="button"
                onClick={() => {
                  setView('bookshelf')
                  setSelectedBook(null)
                  setBookshelfKey(prev => prev + 1)
                }}
                className="flex items-center gap-3 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-primary)]"
                aria-label={lang === 'zh' ? '返回书架首页' : 'Return to bookshelf home'}
                title={lang === 'zh' ? '返回书架首页' : 'Bookshelf home'}
              >
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
                <span className="hidden text-xl font-bold text-gradient sm:inline">{t(lang, 'app.title')}</span>
              </button>
              
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { 
                    setView('bookshelf')
                    setSelectedBook(null)
                    setBookshelfKey(prev => prev + 1) // 强制刷新书架
                  }}
                  className={`nav-item ${view === 'bookshelf' ? 'active' : ''}`}
                >
                  <AppIcon name="library" tone={view === 'bookshelf' ? 'inherit' : 'blue'} size={18} />
                  {t(lang, 'nav.bookshelf')}
                </button>
                <button
                  onClick={() => setView('settings')}
                  className={`nav-item ${view === 'settings' ? 'active' : ''}`}
                >
                  <AppIcon name="settings" tone={view === 'settings' ? 'inherit' : 'amber'} size={18} />
                  {t(lang, 'nav.settings')}
                </button>
                <button
                  type="button"
                  onClick={handleOpenOnboarding}
                  className="flex h-11 w-11 shrink-0 items-center justify-center gap-1.5 rounded-[10px] border border-[var(--accent)]/35 bg-[var(--accent)]/10 text-[var(--accent)] transition-colors hover:bg-[var(--accent)]/15 lg:w-auto lg:px-3"
                  aria-label={lang === 'zh' ? '打开使用引导' : 'Open user guide'}
                  title={lang === 'zh' ? '使用引导' : 'User guide'}
                >
                  <CircleHelp size={20} aria-hidden="true" />
                  <span className="hidden text-sm font-medium lg:inline">
                    {lang === 'zh' ? '使用引导' : 'Guide'}
                  </span>
                </button>
                <a
                  href="https://github.com/HachikoJ/Feynman-Reader"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] border border-[var(--border)] text-[var(--text-primary)] transition-colors hover:border-[var(--accent)]/50 hover:bg-[var(--accent)]/10 hover:text-[var(--accent)]"
                  aria-label={lang === 'zh' ? '访问 GitHub 开源项目' : 'Open the GitHub repository'}
                  title={lang === 'zh' ? 'GitHub 开源项目' : 'GitHub repository'}
                >
                  <GitHubMark />
                </a>
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
              onOpenSettings={handleOpenApiSettings}
            />
          )}
          
          {view === 'settings' && (
            <Settings
              onSettingsChange={handleSettingsChange}
              openDataManagement={openDataManagement}
              focusApiConfigurationRequest={focusApiConfigurationRequest}
              onOpenMigrationNotice={handleOpenTokenDanceMigration}
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

            {/* 网站信息与社群入口保持同一信息带，避免二维码抢占页脚主层级。 */}
            <div className="grid grid-cols-1 gap-6 border-y border-[var(--border)] py-6 text-sm text-[var(--text-secondary)] md:grid-cols-4">
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

              {/* 社群入口：保留完整二维码，但使用紧凑缩略尺寸。 */}
              <section aria-labelledby="community-title" className="flex min-w-0 items-center justify-center gap-3 text-left md:justify-start">
                <a
                  href="/community-qr.jpg"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 rounded-md border border-[var(--border)] bg-white p-1 transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                  aria-label={lang === 'zh' ? '打开完整群二维码' : 'Open the full community QR code'}
                  title={lang === 'zh' ? '点击放大二维码' : 'Open larger QR code'}
                >
                  <Image
                    src="/community-qr.jpg"
                    alt={lang === 'zh' ? '费曼读书助手交流社群微信群二维码' : 'Feynman Reader WeChat community QR code'}
                    width={96}
                    height={149}
                    className="h-auto w-20 sm:w-24"
                  />
                </a>
                <div className="min-w-0">
                  <div className="mb-1.5 flex items-center gap-1.5 text-[var(--accent)]">
                    <UsersRound size={16} aria-hidden="true" />
                    <span className="text-xs font-semibold">
                      {lang === 'zh' ? '一起读得更深' : 'Read deeper together'}
                    </span>
                  </div>
                  <h3 id="community-title" className="font-medium text-[var(--text-primary)]">
                    {lang === 'zh' ? '加入交流社群' : 'Join our community'}
                  </h3>
                  <p className="mt-1 text-xs leading-5">
                    {lang === 'zh' ? '微信扫码加入，交流书籍与学习方法。' : 'Scan with WeChat to exchange reading ideas.'}
                  </p>
                  <p className="mt-1 text-xs leading-5">
                    {lang === 'zh' ? '二维码失效后会在这里更新。' : 'The QR code will be refreshed when it expires.'}
                  </p>
                </div>
              </section>

              {/* 版权 */}
              <div className="text-center md:text-right">
                <h4 className="font-medium text-[var(--text-primary)] mb-2">
                  {lang === 'zh' ? '版权信息' : 'Copyright'}
                </h4>
                <p className="text-xs">© 2025 {lang === 'zh' ? '费曼读书助手' : 'Feynman Reader'}</p>
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

        {/* P0 新增：新手引导 */}
        {activeStartupPrompt === 'tokendance-welcome' && (
          <TokenDanceWelcome lang={lang} onContinue={handleTokenDanceWelcomeComplete} />
        )}

        {activeStartupPrompt === 'tokendance-migration' && (
          <TokenDanceMigrationNotice
            lang={lang}
            onClose={handleTokenDanceMigrationClose}
            onOpenSettings={handleOpenApiSettings}
          />
        )}

        {activeStartupPrompt === 'onboarding' && (
          <Onboarding
            lang={lang}
            aiConfigured={isAIConfigurationComplete(settings)}
            onComplete={handleOnboardingComplete}
            onConfigureApi={handleOnboardingConfigureApi}
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

        {/* P1 新增：撤销/重做控制 */}
        <UndoRedoControls lang={lang} />
      </div>
    </AuthGuard>
    </ErrorBoundary>
  )
}
