'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import { AlertTriangle, CircleHelp, Cloud, ExternalLink, Menu, RefreshCw, UserRound, X } from 'lucide-react'
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
import AuthGuard, { useAccountAccess } from '@/components/AuthGuard'
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
import AssistantWorkspace from '@/components/AssistantWorkspace'
import { APP_ROUTES } from '@/lib/appRoutes'
import { accountLoginHref } from '@/lib/accountClient'

type View = 'bookshelf' | 'reading' | 'settings'

const TOKENDANCE_LOGO_URL = 'https://tokendance.space/TokenDance%E5%93%81%E7%89%8C%E5%9B%BE%E6%A0%87-%E9%80%8F%E6%98%8E%E5%BA%95.svg'
const TOKENDANCE_PRICING_URL = 'https://tokendance.space/models/deepseek-v4-flash-0731'
const ACCOUNT_CLOUD_NOTICE_KEY = 'feynman-account-cloud-notice-v1'

function AccountEntry({ lang, returnTo }: { lang: AppSettings['language']; returnTo: string }) {
  const { user, checking, isAuthenticated } = useAccountAccess()
  const signedIn = Boolean(user) || isAuthenticated

  return (
    <a
      href={signedIn ? '/account' : accountLoginHref(returnTo)}
      className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-[10px] border border-[var(--accent)]/35 bg-[var(--accent)]/10 px-2.5 text-sm font-medium text-[var(--accent)] transition-colors hover:bg-[var(--accent)]/15 sm:px-3"
      aria-label={signedIn ? (lang === 'zh' ? '打开账号中心' : 'Open Account Center') : (lang === 'zh' ? '使用观猹登录' : 'Sign in with Watcha')}
      title={signedIn ? (lang === 'zh' ? '账号中心' : 'Account Center') : (lang === 'zh' ? '使用观猹登录' : 'Sign in with Watcha')}
      aria-disabled={checking}
    >
      {user?.avatarUrl ? (
        <img src={user.avatarUrl} alt="" className="h-6 w-6 rounded-full object-cover" />
      ) : user?.displayName ? (
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--accent)] text-xs font-semibold text-white" aria-hidden="true">
          {user.displayName.slice(0, 1)}
        </span>
      ) : (
        <UserRound size={16} aria-hidden="true" />
      )}
      <span className="hidden sm:inline">
        {checking ? (lang === 'zh' ? '读取账号' : 'Checking') : signedIn ? (lang === 'zh' ? '账号中心' : 'Account') : (lang === 'zh' ? '观猹登录' : 'Watcha sign-in')}
      </span>
    </a>
  )
}

function AccountCloudNotice({ lang, hidden, returnTo }: { lang: AppSettings['language']; hidden: boolean; returnTo: string }) {
  const { checking, isAuthenticated } = useAccountAccess()
  const [dismissed, setDismissed] = useState(true)

  useEffect(() => {
    setDismissed(localStorage.getItem(ACCOUNT_CLOUD_NOTICE_KEY) === 'dismissed')
  }, [])

  if (hidden || checking || isAuthenticated || dismissed) return null

  const dismiss = () => {
    localStorage.setItem(ACCOUNT_CLOUD_NOTICE_KEY, 'dismissed')
    setDismissed(true)
  }

  return (
    <div role="status" className="border-b border-[var(--accent)]/20 bg-[var(--accent)]/8 px-3 py-2.5 sm:px-4">
      <div className="mx-auto flex max-w-6xl items-start gap-2.5 text-sm">
        <Cloud size={17} className="mt-0.5 shrink-0 text-[var(--accent)]" aria-hidden="true" />
        <p className="min-w-0 flex-1 leading-5 text-[var(--text-secondary)]">
          {lang === 'zh'
            ? '当前可浏览系统示例。添加书籍、保存学习记录或使用 AI 前，请先使用观猹登录；登录后数据会保存到你的账号云端。'
            : 'You can browse the system sample now. Sign in with Watcha before adding books, saving learning records, or using AI; signed-in data is saved to your account cloud.'}
        </p>
        <a href={accountLoginHref(returnTo)} className="shrink-0 font-medium text-[var(--accent)] hover:underline">
          {lang === 'zh' ? '登录' : 'Sign in'}
        </a>
        <button type="button" onClick={dismiss} className="icon-button h-8 w-8 shrink-0" aria-label={lang === 'zh' ? '关闭通知' : 'Dismiss notice'} title={lang === 'zh' ? '关闭通知' : 'Dismiss'}>
          <X size={15} aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}

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
  const [initializationAttempt, setInitializationAttempt] = useState(0)
  const [storageWriteError, setStorageWriteError] = useState(false)
  const [bookshelfKey, setBookshelfKey] = useState(0) // 用于强制刷新书架
  const [showOnboarding, setShowOnboarding] = useState(false) // P0 新增：新手引导
  const [showTokenDanceWelcome, setShowTokenDanceWelcome] = useState(false)
  const [showTokenDanceMigration, setShowTokenDanceMigration] = useState(false)
  const [showDataLossWarning, setShowDataLossWarning] = useState(false)
  const [backupDue, setBackupDue] = useState(false)
  const [openDataManagement, setOpenDataManagement] = useState(false)
  const [focusApiConfigurationRequest, setFocusApiConfigurationRequest] = useState(0)
  const [showHeaderMenu, setShowHeaderMenu] = useState(false)

  // P1 新增：启用撤销/重做快捷键
  useUndoRedoShortcuts(settings.language)
  useServiceWorker()

  useEffect(() => {
    let cancelled = false
    const initialParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null
    const isTokenDanceCallback = initialParams?.get('tokendance_callback') === '1'
    const requestedView = initialParams?.get('view')
    const requestedBookId = initialParams?.get('bookId')
    const shouldOpenSettings = requestedView === 'settings'
    if (isTokenDanceCallback || shouldOpenSettings) {
      setView('settings')
    }
    let storageErrorTimer: ReturnType<typeof setTimeout> | null = null
    const unsubscribePersistenceErrors = subscribeToPersistenceErrors(error => {
      if (storageErrorTimer !== null) {
        clearTimeout(storageErrorTimer)
        storageErrorTimer = null
      }
      if (error === null) {
        if (!cancelled) setStorageWriteError(false)
        return
      }
      // A short network/auth blip is common during OAuth redirects. Wait before
      // showing the blocking warning; a successful retry clears it immediately.
      storageErrorTimer = setTimeout(() => {
        storageErrorTimer = null
        if (!cancelled) setStorageWriteError(true)
      }, 1500)
    })

    const initialize = async () => {
      try {
        await initializeStore()
      } catch (error) {
        logger.error('IndexedDB initialization failed:', error)
        if (!cancelled) {
          // AuthGuard renders the login screen for an expired/missing session;
          // do not replace it with a misleading local-storage error.
          setInitializationError(!(error instanceof Error && error.message.includes('登录状态')))
          setMounted(true)
        }
        return
      }

      if (cancelled) return

      const saved = getSettings()
      setSettings(saved)
      document.documentElement.setAttribute('data-theme', saved.theme)
      const books = getBooks()
      if (requestedView === 'reading' && requestedBookId) {
        const requestedBook = books.find(book => book.id === requestedBookId)
        if (requestedBook) {
          setSelectedBook(requestedBook)
          setView('reading')
        }
      }
      const userHasHistory = hasUserHistory(books)

      const completedOnboardingVersion = localStorage.getItem(ONBOARDING_COMPLETED_KEY)
      const showOnboardingCandidate = shouldShowOnboarding(completedOnboardingVersion, ONBOARDING_VERSION, isTokenDanceCallback)

      const completedTokenDanceWelcomeVersion = localStorage.getItem(TOKENDANCE_WELCOME_KEY)
      const showTokenDanceWelcomeCandidate = shouldShowTokenDanceWelcome(
        completedTokenDanceWelcomeVersion,
        TOKENDANCE_WELCOME_VERSION,
        isTokenDanceCallback,
        isAIConfigurationComplete(saved),
        userHasHistory
      )

      const completedMigrationNoticeVersion = localStorage.getItem(TOKENDANCE_MIGRATION_NOTICE_KEY)
      const showTokenDanceMigrationCandidate = shouldShowTokenDanceMigration(
        completedMigrationNoticeVersion,
        TOKENDANCE_MIGRATION_NOTICE_VERSION,
        isTokenDanceCallback,
        userHasHistory
      )

      const acknowledged = hasAcknowledgedCurrentDataRisk(localStorage.getItem(DATA_RISK_ACKNOWLEDGED_KEY))
      const lastBackupValue = localStorage.getItem(LAST_BACKUP_AT_KEY)
      const lastBackupAt = lastBackupValue ? Number(lastBackupValue) : null
      const learningDataCount = books.filter(hasBackupRelevantLearningData).length
      const needsBackup = isBackupReminderDue({ bookCount: learningDataCount, lastBackupAt })
      const showDataLossWarningCandidate = shouldShowBackupWarning({
        acknowledged,
        bookCount: learningDataCount,
        lastBackupAt
      })
      setBackupDue(needsBackup)

      // Only one blocking startup message is shown per visit. Lower-priority
      // guidance remains available from the header and can appear next visit.
      if (showTokenDanceMigrationCandidate) setShowTokenDanceMigration(true)
      else if (showDataLossWarningCandidate) setShowDataLossWarning(true)
      else if (showOnboardingCandidate) setShowOnboarding(true)
      else if (showTokenDanceWelcomeCandidate) setShowTokenDanceWelcome(true)

      setMounted(true)
    }

    void initialize()
    return () => {
      cancelled = true
      if (storageErrorTimer !== null) clearTimeout(storageErrorTimer)
      unsubscribePersistenceErrors()
    }
  }, [initializationAttempt])

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
    window.history.replaceState({}, '', `/?view=reading&bookId=${encodeURIComponent(book.id)}`)
  }

  const handleOpenApiSettings = () => {
    setShowApiKeyAlert(false)
    setFocusApiConfigurationRequest(request => request + 1)
    setView('settings')
    window.history.replaceState({}, '', '/?view=settings')
  }

  const handleOpenOnboarding = () => {
    localStorage.removeItem(ONBOARDING_COMPLETED_KEY)
    setShowApiKeyAlert(false)
    setShowOnboarding(true)
  }

  const handleOnboardingComplete = () => {
    setShowOnboarding(false)
    localStorage.setItem(TOKENDANCE_WELCOME_KEY, TOKENDANCE_WELCOME_VERSION)
    const persistedSettings = getSettings()
    setSettings(persistedSettings)
  }

  const handleTokenDanceWelcomeComplete = () => {
    setShowTokenDanceWelcome(false)
  }

  const handleTokenDanceMigrationClose = () => {
    setShowTokenDanceMigration(false)
    localStorage.setItem(TOKENDANCE_WELCOME_KEY, TOKENDANCE_WELCOME_VERSION)
  }

  const handleOpenTokenDanceMigration = () => {
    setShowTokenDanceMigration(true)
  }

  const handleOnboardingConfigureApi = () => {
    setShowApiKeyAlert(false)
    setFocusApiConfigurationRequest(request => request + 1)
    setView('settings')
    window.history.replaceState({}, '', '/?view=settings')
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
  const currentWorkspaceHref = view === 'settings'
    ? '/?view=settings'
    : view === 'reading' && selectedBook
      ? `/?view=reading&bookId=${encodeURIComponent(selectedBook.id)}`
      : '/'
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
          <h1 className="mb-3 text-xl font-bold">学习数据暂时无法读取</h1>
          <p className="mb-6 text-sm leading-6 text-[var(--text-secondary)]">
            为避免把空数据误当成真实书架，应用已暂停加载。请检查网络和登录状态后重试；如有尚未迁移的本机历史数据，请不要清除浏览器网站数据。
          </p>
          <button type="button" onClick={() => {
            setInitializationError(false)
            setMounted(false)
            setInitializationAttempt(attempt => attempt + 1)
          }} className="btn-primary inline-flex items-center gap-2">
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
          <AssistantWorkspace lang={lang} settings={settings} books={getBooks()} activeBook={selectedBook} onOpenSettings={handleOpenApiSettings} onQuoteAdded={handleSettingsChange} />
          {storageWriteError && (
            <div role="alert" className="sticky top-0 z-50 border-b border-red-500/50 bg-red-950 px-4 py-3 text-sm text-red-100">
              <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
                <span>
                  {lang === 'zh'
                    ? '最新修改尚未保存到账号云端，刷新后可能丢失。请勿刷新，并前往账号中心检查登录、云端同步或导出备份。'
                    : 'Recent changes were not saved to your account cloud and may be lost after refresh. Do not refresh; check sign-in, cloud sync, or export a backup from Account Center.'}
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
                  {lang === 'zh' ? '前往账号中心' : 'Open Account Center'}
                </button>
              </div>
            </div>
          )}
          {/* Navigation */}
        <nav className="sticky top-0 z-40 backdrop-blur-lg bg-[var(--bg-primary)]/80 border-b border-[var(--border)]">
          <div className="max-w-6xl mx-auto px-3 py-2.5 sm:px-4 sm:py-3">
            <div className="flex min-w-0 items-center justify-between gap-2">
              <button
                type="button"
                  onClick={() => {
                    setView('bookshelf')
                    setSelectedBook(null)
                    window.history.replaceState({}, '', '/')
                    setBookshelfKey(prev => prev + 1)
                }}
                className="flex min-h-11 min-w-0 shrink items-center gap-2 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-primary)] sm:gap-3"
                aria-label={lang === 'zh' ? '返回书架首页' : 'Return to bookshelf home'}
                title={lang === 'zh' ? '返回书架首页' : 'Bookshelf home'}
              >
                <div className="relative h-11 w-11 shrink-0 overflow-hidden sm:h-12 sm:w-12">
                  <Image
                    src="/icon-192.png"
                    alt=""
                    fill
                    sizes="48px"
                    className="scale-150 object-contain"
                    priority
                  />
                </div>
                <span className="hidden text-xl font-bold tracking-tight text-[var(--accent)] sm:inline">{t(lang, 'app.title')}</span>
              </button>

              <div className="relative flex shrink-0 items-center gap-1.5 sm:gap-2">
                <div className="flex items-center gap-0.5 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)]/45 p-0.5" aria-label={lang === 'zh' ? '主要导航' : 'Primary navigation'}>
                <button
                  type="button"
                  onClick={() => {
                    setView('bookshelf')
                    setSelectedBook(null)
                    window.history.replaceState({}, '', '/')
                    setBookshelfKey(prev => prev + 1) // 强制刷新书架
                  }}
                  className={`nav-item min-h-10 px-2 sm:px-3 ${view === 'bookshelf' ? 'active' : ''}`}
                  aria-label={lang === 'zh' ? '打开书架' : 'Open bookshelf'}
                >
                  <AppIcon name="library" tone={view === 'bookshelf' ? 'inherit' : 'blue'} size={18} />
                  <span className="hidden sm:inline">{t(lang, 'nav.bookshelf')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setView('settings')
                    window.history.replaceState({}, '', '/?view=settings')
                  }}
                  className={`nav-item min-h-10 px-2 sm:px-3 ${view === 'settings' ? 'active' : ''}`}
                  aria-label={lang === 'zh' ? '打开设置' : 'Open settings'}
                >
                  <AppIcon name="settings" tone={view === 'settings' ? 'inherit' : 'amber'} size={18} />
                  <span className="hidden sm:inline">{t(lang, 'nav.settings')}</span>
                </button>
                </div>
                <AccountEntry lang={lang} returnTo={currentWorkspaceHref} />
                <div className="hidden items-center gap-0.5 border-l border-[var(--border)] pl-1 sm:flex">
                  <a href={APP_ROUTES.website} className="inline-flex h-10 w-10 items-center justify-center rounded-[10px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)]" aria-label={lang === 'zh' ? '访问官网' : 'Open the website'} title={lang === 'zh' ? '访问官网' : 'Website'}><ExternalLink size={17} aria-hidden="true" /></a>
                  <button type="button" onClick={handleOpenOnboarding} className="inline-flex h-10 w-10 items-center justify-center rounded-[10px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)]" aria-label={lang === 'zh' ? '打开使用引导' : 'Open user guide'} title={lang === 'zh' ? '使用引导' : 'User guide'}><CircleHelp size={18} aria-hidden="true" /></button>
                <a
                  href="https://github.com/HachikoJ/Feynman-Reader"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-10 w-10 items-center justify-center rounded-[10px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)]"
                  aria-label={lang === 'zh' ? '访问 GitHub 开源项目' : 'Open the GitHub repository'}
                  title={lang === 'zh' ? 'GitHub 开源项目' : 'GitHub repository'}
                >
                  <GitHubMark />
                </a>
                </div>
                <div className="sm:hidden">
                  <button type="button" onClick={() => setShowHeaderMenu(open => !open)} className="inline-flex h-11 w-11 items-center justify-center rounded-[10px] border border-[var(--border)] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)]" aria-label={lang === 'zh' ? '打开更多入口' : 'Open more options'} aria-expanded={showHeaderMenu} title={lang === 'zh' ? '更多' : 'More'}><Menu size={18} aria-hidden="true" /></button>
                  {showHeaderMenu && <div className="absolute right-0 top-full z-50 mt-2 w-44 rounded-lg border border-[var(--border)] bg-[var(--surface-glass-strong)] p-1.5 shadow-[var(--brand-shadow)]">
                    <a href={APP_ROUTES.website} onClick={() => setShowHeaderMenu(false)} className="flex min-h-10 items-center gap-2 rounded-md px-3 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)]"><ExternalLink size={16} aria-hidden="true" />{lang === 'zh' ? '访问官网' : 'Website'}</a>
                    <button type="button" onClick={() => { setShowHeaderMenu(false); handleOpenOnboarding() }} className="flex min-h-10 w-full items-center gap-2 rounded-md px-3 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)]"><CircleHelp size={16} aria-hidden="true" />{lang === 'zh' ? '使用引导' : 'Guide'}</button>
                    <a href="https://github.com/HachikoJ/Feynman-Reader" target="_blank" rel="noopener noreferrer" onClick={() => setShowHeaderMenu(false)} className="flex min-h-10 items-center gap-2 rounded-md px-3 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)]"><GitHubMark />GitHub</a>
                  </div>}
                </div>
              </div>
            </div>
          </div>
        </nav>

        <AccountCloudNotice lang={lang} hidden={activeStartupPrompt !== null} returnTo={currentWorkspaceHref} />

        {/* Main Content */}
        <main className="max-w-6xl mx-auto min-w-0 px-4 py-6 sm:py-8">
          {view === 'bookshelf' && !selectedBook && (
            <Bookshelf key={bookshelfKey} lang={lang} onSelectBook={handleSelectBook} onOpenSettings={handleOpenApiSettings} />
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
                window.history.replaceState({}, '', '/')
                setBookshelfKey(prev => prev + 1) // 强制刷新书架以显示最新数据
              }}
              onOpenSettings={handleOpenApiSettings}
              onQuoteAdded={handleSettingsChange}
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
        <footer className="mt-12 border-t border-[var(--border)]">
          <div className="max-w-6xl mx-auto px-4 py-6">
            {/* TokenDance 是本产品的特别支持方，独立成带以建立明确的品牌层级。 */}
            <section aria-labelledby="tokendance-support-title" className="brand-offer tokendance-surface px-4 py-5 sm:px-5">
              <div className="grid min-w-0 items-center gap-5 md:grid-cols-[200px_minmax(0,1fr)_auto]">
                <div className="min-w-0">
                  <p className="mb-2 text-xs font-semibold text-[var(--text-primary)]">
                    {lang === 'zh' ? '特别支持' : 'Special support'}
                  </p>
                  <img src={TOKENDANCE_LOGO_URL} alt="TokenDance" className="h-9 w-auto max-w-[180px] object-contain" />
                </div>
                <div className="min-w-0">
                  <h3 id="tokendance-support-title" className="font-semibold text-[var(--text-primary)]">
                    {lang === 'zh' ? 'AI 接入、Token 支付与限时优惠支持' : 'AI access, Token payments, and limited-time savings'}
                  </h3>
                  <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">
                    {lang === 'zh'
                      ? <>TokenDance / TokenPay 提供 AI Key 快速授权、智能路由、余额查询与充值服务。<strong className="brand-emphasis-coral">DeepSeek V4 Flash 峰时火山方舟端口限时优惠最高约省 20%。</strong></>
                      : <>TokenDance / TokenPay provides fast AI key authorization, smart routing, balance checks, and top-ups. <strong className="brand-emphasis-coral">DeepSeek V4 Flash offers limited-time savings of up to about 20% on the Volcengine Ark route at peak hours.</strong></>}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
                    {lang === 'zh'
                      ? '适用线路、价格、时段与活动期限以 TokenDance 官方实时计费标准及通知为准。'
                      : 'Eligible routes, pricing, periods, and offer dates follow TokenDance official live pricing and notices.'}
                  </p>
                </div>
                <a
                  href={TOKENDANCE_PRICING_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="tokendance-button-secondary inline-flex min-h-11 w-fit items-center gap-2 rounded-lg border px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--text-primary)]"
                >
                  {lang === 'zh' ? '查看实时价目' : 'View live pricing'}
                  <ExternalLink size={15} aria-hidden="true" />
                </a>
              </div>
            </section>

            <div className="grid gap-3 py-4 text-center sm:grid-cols-2 sm:items-center sm:gap-6 sm:text-left">
              <div className="min-w-0">
                <p className="text-sm font-medium text-[var(--text-primary)]">
                  {lang === 'zh' ? '费曼读书助手' : 'Feynman Reader'}
                </p>
                <p className="mt-1 text-xs text-[var(--text-secondary)]">
                  {lang === 'zh' ? '以教代学，让每一次阅读真正沉淀' : 'Learn by teaching, and make every read stick'}
                </p>
              </div>

              <p className="min-w-0 text-center text-xs text-[var(--text-secondary)] sm:text-right">
                © 2026 {lang === 'zh' ? '费曼读书助手 · 保留所有权利' : 'Feynman Reader · All Rights Reserved'}
              </p>
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
