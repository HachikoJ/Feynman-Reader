'use client'

import React, { Component, ErrorInfo, ReactNode } from 'react'
import { AlertTriangle, Home, RefreshCw } from 'lucide-react'
import { logger } from '@/lib/logger'
import { Language } from '@/lib/i18n'

interface Props {
  children: ReactNode
  lang?: Language
  onError?: (error: Error, errorInfo: ErrorInfo) => void
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
  showDetails: boolean
}

const errorMessages = {
  zh: {
    title: '出错了',
    subtitle: '抱歉，应用遇到了一些问题',
    whatHappened: '发生了什么：',
    somethingWentWrong: '应用在渲染过程中发生了错误。这可能是由于：',
    reasons: [
      '网络连接问题',
      '浏览器兼容性问题',
      '代码中的临时错误'
    ],
    whatYouCanDo: '你可以尝试：',
    solutions: [
      '刷新页面重新加载',
      '检查网络连接',
      '如果问题持续存在，请联系技术支持'
    ],
    details: '错误详情：',
    reload: '重新加载',
    goHome: '返回首页',
    hideDetails: '隐藏详情',
    showDetails: '显示详情'
  },
  en: {
    title: 'Oops! Something went wrong',
    subtitle: 'Sorry, the application encountered an error',
    whatHappened: 'What happened:',
    somethingWentWrong: 'An error occurred while rendering the application. This could be due to:',
    reasons: [
      'Network connection issues',
      'Browser compatibility problems',
      'Temporary code errors'
    ],
    whatYouCanDo: 'What you can try:',
    solutions: [
      'Refresh the page to reload',
      'Check your network connection',
      'Contact support if the problem persists'
    ],
    details: 'Error details:',
    reload: 'Reload',
    goHome: 'Go Home',
    hideDetails: 'Hide Details',
    showDetails: 'Show Details'
  }
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      showDetails: false
    }
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return {
      hasError: true,
      error
    }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Log to console
    logger.error('ErrorBoundary caught an error:', error, errorInfo)

    // Call custom error handler if provided
    if (this.props.onError) {
      this.props.onError(error, errorInfo)
    }

    // Save error state
    this.setState({
      error,
      errorInfo
    })

    // Optionally send error reporting service
    // reportError(error, errorInfo)
  }

  handleReload = (): void => {
    window.location.reload()
  }

  handleGoHome = (): void => {
    window.location.href = '/'
  }

  handleToggleDetails = (): void => {
    this.setState(state => ({ showDetails: !state.showDetails }))
  }

  render(): ReactNode {
    const { hasError, error, errorInfo, showDetails } = this.state
    const { children, lang = 'zh', fallback } = this.props

    if (hasError) {
      // Use custom fallback if provided
      if (fallback) {
        return fallback
      }

      const messages = errorMessages[lang] || errorMessages.zh
      return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-[var(--bg-primary)]">
          <div className="max-w-2xl w-full">
            {/* Error Card */}
            <div className="card p-8 mb-6">
              {/* Icon */}
              <div className="text-center mb-6">
                <AlertTriangle className="w-14 h-14 mx-auto mb-4 text-amber-500" aria-hidden="true" />
                <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-2">
                  {messages.title}
                </h1>
                <p className="text-[var(--text-secondary)]">
                  {messages.subtitle}
                </p>
              </div>

              {/* What Happened */}
              <div className="mb-6">
                <h2 className="font-semibold text-[var(--text-primary)] mb-2">
                  {messages.whatHappened}
                </h2>
                <p className="text-sm text-[var(--text-secondary)] mb-3">
                  {messages.somethingWentWrong}
                </p>
                <ul className="text-sm text-[var(--text-secondary)] space-y-1">
                  {messages.reasons.map((reason, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="text-[var(--accent)] mt-0.5">•</span>
                      <span>{reason}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* What You Can Do */}
              <div className="mb-6">
                <h2 className="font-semibold text-[var(--text-primary)] mb-2">
                  {messages.whatYouCanDo}
                </h2>
                <ul className="text-sm text-[var(--text-secondary)] space-y-1">
                  {messages.solutions.map((solution, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="text-[var(--accent)] mt-0.5">✓</span>
                      <span>{solution}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Error Details Toggle */}
              {process.env.NODE_ENV !== 'production' && error && (
                <div className="mb-6">
                  <button
                    onClick={this.handleToggleDetails}
                    className="text-sm text-[var(--accent)] hover:underline"
                  >
                    {showDetails ? messages.hideDetails : messages.showDetails}
                  </button>

                  {showDetails && (
                    <div className="mt-3 p-4 bg-[var(--bg-secondary)] rounded-lg overflow-auto max-h-60">
                      <p className="text-xs font-mono text-[var(--text-secondary)] whitespace-pre-wrap">
                        <strong>{messages.details}</strong>
                        {'\n\n'}
                        {error.toString()}
                        {errorInfo && errorInfo.componentStack}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={this.handleReload}
                  className="btn-primary flex-1 min-w-[120px] inline-flex items-center justify-center gap-2"
                >
                  <RefreshCw className="w-4 h-4" aria-hidden="true" />
                  {messages.reload}
                </button>
                <button
                  onClick={this.handleGoHome}
                  className="btn-secondary flex-1 min-w-[120px] inline-flex items-center justify-center gap-2"
                >
                  <Home className="w-4 h-4" aria-hidden="true" />
                  {messages.goHome}
                </button>
              </div>
            </div>

            {/* Support Info */}
            <div className="text-center text-sm text-[var(--text-secondary)]">
              <p>
                {lang === 'zh'
                  ? '如果问题持续存在，请访问 '
                  : 'If the problem persists, please visit '}
                <a href="/privacy" className="text-[var(--accent)] hover:underline">
                  {lang === 'zh' ? '隐私政策中的联系方式' : 'the contact information in our Privacy Policy'}
                </a>
                {lang === 'zh' ? ' 联系支持。' : '.'}
              </p>
            </div>
          </div>
        </div>
      )
    }

    return children
  }
}

// Hook-based error boundary wrapper for easier usage
import { useEffect, useState } from 'react'

export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  errorHandler?: (error: Error, errorInfo: ErrorInfo) => void
): React.ComponentType<P> {
  return function WrappedComponent(props: P) {
    return (
      <ErrorBoundary onError={errorHandler}>
        <Component {...props} />
      </ErrorBoundary>
    )
  }
}

// Custom hook for error reporting
export function useErrorHandler() {
  const [error, setError] = useState<Error | null>(null)

  const resetError = () => setError(null)

  // If an error is thrown, update state and trigger ErrorBoundary
  useEffect(() => {
    if (error) {
      throw error
    }
  }, [error])

  return { setError, resetError }
}
