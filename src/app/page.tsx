'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import { logger } from '@/lib/logger'
import { AppSettings, Book, getBooks, getSettings, initializeStore, saveSettings } from '@/lib/store'
import { Language, t } from '@/lib/i18n'
import Settings from '@/components/Settings'
import Bookshelf from '@/components/Bookshelf'
import ReadingView from '@/components/ReadingView'
import ApiKeyAlert from '@/components/ApiKeyAlert'
import BackToTop from '@/components/BackToTop'
import AuthGuard from '@/components/AuthGuard'
import Onboarding from '@/components/Onboarding'
import Toast from '@/components/Toast'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import UndoRedoControls, { useUndoRedoShortcuts } from '@/components/UndoRedoControls'

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
  const [bookshelfKey, setBookshelfKey] = useState(0) // 用于强制刷新书架
  const [showOnboarding, setShowOnboarding] = useState(false) // P0 新增：新手引导

  // P1 新增：启用撤销/重做快捷键
  useUndoRedoShortcuts()

  useEffect(() => {
    let cancelled = false

    const initialize = async () => {
      try {
        await initializeStore()
      } catch (error) {
        logger.error('IndexedDB initialization failed:', error)
      }

      if (cancelled) return

      const saved = getSettings()
      setSettings(saved)
      document.documentElement.setAttribute('data-theme', saved.theme)

      if (!saved.apiKey && !saved.hideApiKeyAlert) {
        setShowApiKeyAlert(true)
      }

      const hasCompletedOnboarding = localStorage.getItem('feynman-onboarding-completed')
      if (!hasCompletedOnboarding && getBooks().length === 0) {
        setShowOnboarding(true)
      }

      setMounted(true)
    }

    void initialize()
    return () => {
      cancelled = true
    }
  }, [])

  const handleSettingsChange = (newSettings: AppSettings) => {
    setSettings(newSettings)
    document.documentElement.setAttribute('data-theme', newSettings.theme)
  }

  const handleSelectBook = (book: Book) => {
    if (!settings.apiKey && !settings.hideApiKeyAlert) {
      setShowApiKeyAlert(true)
      return
    }
    setSelectedBook(book)
    setView('reading')
  }

  const handleDontRemind = () => {
    const newSettings = { ...settings, hideApiKeyAlert: true }
    setSettings(newSettings)
    saveSettings(newSettings)
    setShowApiKeyAlert(false)
  }

  const lang = settings.language

  if (!mounted) {
    return null
  }

  return (
    <ErrorBoundary lang={lang}>
      <AuthGuard>
        <div className="min-h-screen">
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
            <Settings onSettingsChange={handleSettingsChange} />
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
        {showApiKeyAlert && (
          <ApiKeyAlert
            lang={lang}
            onGoSettings={() => { setShowApiKeyAlert(false); setView('settings') }}
            onLater={() => setShowApiKeyAlert(false)}
            onDontRemind={handleDontRemind}
          />
        )}

        {/* P0 新增：新手引导 */}
        {showOnboarding && (
          <Onboarding
            lang={lang}
            onComplete={() => setShowOnboarding(false)}
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
