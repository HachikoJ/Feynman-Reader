'use client'

import { useState, useEffect, useRef } from 'react'
import OpenAI from 'openai'
import { logger } from '@/lib/logger'
import { Book, BookAnalysisTask, NoteRecord, AppSettings, addQuoteFromSelection, updateBook, addPracticeRecord, deletePracticeRecord, flushPendingStoreWrites, getBook, isQAPracticeRecordComplete, reloadBookFromPersistence } from '@/lib/store'
import { createLocalId } from '@/lib/localId'
import { Language, t } from '@/lib/i18n'
import { LEARNING_PHASES, generateSystemPrompt, generatePhasePrompt, generateReviewPrompt } from '@/lib/feynman-prompts'
import { AI_CONTEXT_LIMIT_EXCEEDED, AI_DATA_CONSENT_REQUIRED, AI_OUTPUT_INCOMPLETE, chat, chatJson, createDeepSeekClient, generateBookMetadata, isDeepSeekAuthenticationError, parsePracticeEvaluation } from '@/lib/deepseek'
import { AI_REQUEST_CANCELLED, AI_TASK_BUSY } from '@/lib/aiRequestManager'
import { tokendanceRecoveryMessage } from '@/lib/tokendance'
import { deepSeekSunsetMessage } from '@/lib/aiProviderPolicy'
import LoadingQuotes from './LoadingQuotes'
import PhaseResult from './PhaseResult'
import QAPractice from './QAPractice'
import MarkdownRenderer from './MarkdownRenderer'
import SourceEvidence from './SourceEvidence'
import CopyContentButton from './CopyContentButton'
import BookRecommendations from './BookRecommendations'
import {
  clampCompletedPhaseCount,
  completePhase,
  getInitialPhaseIndex,
  isPhaseCompleted,
  isPhaseUnlocked
} from '@/lib/learningProgress'
import { MAX_AI_ANSWER_LENGTH, MAX_NOTE_LENGTH } from '@/lib/dataLimits'
import AppIcon, { AppIconName, AppIconTone } from './AppIcon'
import { buildMissingBookMetadataUpdates, needsBookMetadataEnrichment } from '@/lib/bookMetadata'
import BookListManager from './BookListManager'
import { BookLearningAnalytics } from './Charts'
import { useAccountAccess } from './AuthGuard'

interface Props {
  book: Book
  apiKey: string
  lang: Language
  quotes?: { text: string; author: string }[]
  onBack: () => void
  onOpenSettings: () => void
  onQuoteAdded?: (settings: AppSettings) => void
}

type TabType = 'phase' | 'practice' | 'notes' | 'recommendations'

type AnalysisTaskEvent = {
  task: BookAnalysisTask
  responses: Record<string, string>
}

const activeAnalysisTasks = new Map<string, AnalysisTaskEvent>()
const analysisTaskListeners = new Map<string, Set<(event: AnalysisTaskEvent) => void>>()

function publishAnalysisTask(bookId: string, event: AnalysisTaskEvent): void {
  activeAnalysisTasks.set(bookId, event)
  analysisTaskListeners.get(bookId)?.forEach(listener => listener(event))
}

function subscribeToAnalysisTask(bookId: string, listener: (event: AnalysisTaskEvent) => void): () => void {
  const listeners = analysisTaskListeners.get(bookId) || new Set<(event: AnalysisTaskEvent) => void>()
  listeners.add(listener)
  analysisTaskListeners.set(bookId, listeners)
  const current = activeAnalysisTasks.get(bookId)
  if (current) listener(current)
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) analysisTaskListeners.delete(bookId)
  }
}

const phaseIconNames: Record<string, AppIconName> = {
  background: 'scan',
  overview: 'library',
  deepDive: 'target',
  critical: 'scale',
  reception: 'users',
  synthesis: 'route'
}

const phaseIconTones: Record<string, AppIconTone> = {
  background: 'cyan',
  overview: 'blue',
  deepDive: 'green',
  critical: 'amber',
  reception: 'violet',
  synthesis: 'blue'
}

function aiTaskErrorMessage(error: unknown, lang: Language): string | null {
  if (!(error instanceof Error)) return null
  const status = typeof error === 'object' && error && 'status' in error
    ? Number((error as { status?: unknown }).status)
    : 0
  if (status === 401 || status === 403) {
    return lang === 'zh'
      ? 'TokenDance API Key 未授权或已失效，请前往设置重新授权后重试。'
      : 'The TokenDance API key is not authorized or has expired. Reauthorize it in Settings and retry.'
  }
  if (status === 429) {
    return lang === 'zh'
      ? 'TokenDance 当前请求较多，请稍后重试。'
      : 'TokenDance is handling many requests right now. Please retry shortly.'
  }
  if (error.message === 'Failed to fetch' || error.message.toLowerCase().includes('networkerror')) {
    return lang === 'zh'
      ? '无法连接 AI 服务。请检查网络、浏览器扩展拦截和 TokenDance API Key，然后重试。'
      : 'Unable to reach the AI service. Check your network, browser extensions, and TokenDance API key, then retry.'
  }
  if (error.message === 'DEEPSEEK_OFFICIAL_CHANNEL_SUNSET') return deepSeekSunsetMessage(lang)
  if (error.message === AI_REQUEST_CANCELLED) {
    return lang === 'zh' ? '本次 AI 请求已停止，已完成的阶段均已保存，可继续分析剩余阶段。' : 'The AI request stopped. Completed phases were saved; you can continue the remaining phases.'
  }
  if (error.message === AI_TASK_BUSY) {
    return lang === 'zh' ? '已有 AI 任务正在运行，请等待完成或先取消当前任务。' : 'Another AI task is running. Wait for it to finish or cancel it first.'
  }
  if (error.message === AI_OUTPUT_INCOMPLETE) {
    return lang === 'zh' ? 'AI 输出未通过完整性或原文引用校验，请重试。' : 'The AI output failed completeness or source-citation validation. Try again.'
  }
  const recovery = tokendanceRecoveryMessage(error, lang)
  if (recovery) return recovery
  return null
}

export default function ReadingView({ book: initialBook, apiKey, lang, quotes = [], onBack, onOpenSettings, onQuoteAdded }: Props) {
  const { isAuthenticated, requestLogin } = useAccountAccess()
  const [book, setBook] = useState(initialBook)
  const [activeTab, setActiveTab] = useState<TabType>('phase')
  const [currentPhase, setCurrentPhase] = useState(
    getInitialPhaseIndex(
      initialBook.currentPhase,
      LEARNING_PHASES.length,
      Object.keys(initialBook.responses || {}).length > 0
    )
  )
  const [responses, setResponses] = useState<Record<string, string>>(initialBook.responses || {})
  const [analysisTask, setAnalysisTask] = useState<BookAnalysisTask | undefined>(initialBook.analysisTask)
  const [loading, setLoading] = useState(false)
  const [analyzingInBackground, setAnalyzingInBackground] = useState(false)
  const [client, setClient] = useState<OpenAI | null>(null)
  const [aiConsentRequired, setAiConsentRequired] = useState(false)
  const [apiKeyInvalid, setApiKeyInvalid] = useState(false)
  const [teachingNote, setTeachingNote] = useState('')
  const [practiceError, setPracticeError] = useState<string | null>(null)
  const [analysisError, setAnalysisError] = useState<string | null>(null)
  const [savingProgress, setSavingProgress] = useState(false)
  const [noteRecords, setNoteRecords] = useState<NoteRecord[]>(initialBook.noteRecords || [])
  const [newNote, setNewNote] = useState('')
  const [noteSaving, setNoteSaving] = useState(false)
  const [noteError, setNoteError] = useState<string | null>(null)
  const [recommendations, setRecommendations] = useState<string>(initialBook.recommendations || '')
  const [loadingRecommendations, setLoadingRecommendations] = useState(false)
  const [showPracticeHistory, setShowPracticeHistory] = useState(false)
  const [qaShowHistory, setQaShowHistory] = useState(false)
  const [metadataEnrichmentStatus, setMetadataEnrichmentStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [showBookOrganizer, setShowBookOrganizer] = useState(false)
  const [showLearningCharts, setShowLearningCharts] = useState(false)
  const analysisInFlightRef = useRef(false)
  const progressSaveInFlightRef = useRef(false)
  const practiceSubmissionRef = useRef(false)
  const practiceDeletionIdsRef = useRef(new Set<string>())
  const noteMutationInFlightRef = useRef(false)
  const metadataEnrichmentAttemptsRef = useRef(new Set<string>())
  const currentBookIdRef = useRef(book.id)
  const missingApiKey = apiKey.trim().length === 0
  const needsAiConfiguration = missingApiKey || aiConsentRequired || apiKeyInvalid
  const analysisRunning = loading || analyzingInBackground || analysisTask?.status === 'running'

  const handleQuoteSelected = async (text: string) => {
    if (!isAuthenticated) {
      requestLogin(lang === 'zh' ? '登录后才能保存金句，并在其他设备查看。' : 'Sign in to save quotes and view them on other devices.')
      return
    }
    const nextSettings = addQuoteFromSelection(text)
    onQuoteAdded?.(nextSettings)
    await flushPendingStoreWrites()
  }
  
  // 用于滚动定位的ref
  const readingTabsRef = useRef<HTMLDivElement>(null)
  const phaseProgressRef = useRef<HTMLDivElement>(null)
  const phaseContentRef = useRef<HTMLDivElement>(null)
  const practiceHistoryRef = useRef<HTMLDivElement>(null)
  const qaHistoryRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    setClient(null)
    setAiConsentRequired(false)
    setApiKeyInvalid(false)

    if (apiKey && isAuthenticated) {
      void createDeepSeekClient(apiKey)
        .then(client => {
          if (!cancelled) setClient(client)
        })
        .catch(error => {
          if (cancelled) return
          if (error instanceof Error && error.message === AI_DATA_CONSENT_REQUIRED) {
            setAiConsentRequired(true)
            return
          }
          logger.error('Failed to initialize AI client:', error)
        })
    }

    return () => {
      cancelled = true
    }
  }, [apiKey, isAuthenticated])

  useEffect(() => {
    currentBookIdRef.current = book.id
  }, [book.id])

  useEffect(() => {
    setAnalysisTask(book.analysisTask)
    return subscribeToAnalysisTask(book.id, event => {
      setAnalysisTask(event.task)
      setResponses(event.responses)
      setBook(current => current.id === book.id ? { ...current, responses: event.responses, analysisTask: event.task } : current)
      setAnalyzingInBackground(event.task.status === 'running')
    })
  }, [book.id, book.analysisTask])

  useEffect(() => {
    if (!isAuthenticated || !client || analyzingInBackground || analysisTask?.status === 'running' || !needsBookMetadataEnrichment(book) || metadataEnrichmentAttemptsRef.current.has(book.id)) return

    const targetBookId = book.id
    metadataEnrichmentAttemptsRef.current.add(targetBookId)
    setMetadataEnrichmentStatus('loading')

    void (async () => {
      try {
        const candidate = await generateBookMetadata(
          client,
          book.name,
          book.author,
          book.description,
          book.documentContent,
          { task: 'book-metadata', bookId: targetBookId }
        )
        const latestBook = getBook(targetBookId) || book
        const updates = buildMissingBookMetadataUpdates(latestBook, candidate)

        if (Object.keys(updates).length > 0) {
          updateBook(targetBookId, updates)
          await flushPendingStoreWrites()
          const persistedBook = getBook(targetBookId)
          if (currentBookIdRef.current === targetBookId && persistedBook) setBook(persistedBook)
        }

        if (currentBookIdRef.current === targetBookId) setMetadataEnrichmentStatus('idle')
      } catch (error) {
        if (isDeepSeekAuthenticationError(error)) setApiKeyInvalid(true)
        logger.warn('Automatic book metadata enrichment was not completed.')
        if (currentBookIdRef.current === targetBookId) setMetadataEnrichmentStatus('error')
      }
    })()
  }, [client, analyzingInBackground, analysisTask?.status, book, isAuthenticated])

  // 确保打开书籍时页面滚动到顶部
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [book.id])

  const handleAnalyzeAll = async () => {
    if (analysisInFlightRef.current) return
    const activeTask = activeAnalysisTasks.get(book.id)
    if (activeTask?.task.status === 'running') {
      setAnalysisTask(activeTask.task)
      setResponses(activeTask.responses)
      setAnalyzingInBackground(true)
      return
    }
    if (!isAuthenticated) {
      requestLogin(lang === 'zh' ? '登录后才能使用 AI 分析，并保存你的学习记录。' : 'Sign in to use AI analysis and save your learning history.')
      return
    }
    if (missingApiKey) {
      setAnalysisError(lang === 'zh'
        ? '使用 AI 深度分析前，请先前往设置连接并保存 TokenDance API Key。'
        : 'Connect and save your TokenDance API key in Settings before using AI analysis.')
      return
    }
    if (!client) {
      setAnalysisError(aiConsentRequired
        ? (lang === 'zh' ? '请先在设置中同意 AI 数据传输。' : 'Please consent to AI data transfer in Settings.')
        : (lang === 'zh' ? 'TokenDance AI 尚未就绪，请前往设置检查授权后重试。' : 'TokenDance AI is not ready. Check the authorization in Settings and try again.'))
      return
    }
    analysisInFlightRef.current = true
    setLoading(true)
    setAnalyzingInBackground(true)
    setAnalysisError(null)
    
    const systemPrompt = generateSystemPrompt(book.name, lang)
    const newResponses: Record<string, string> = { ...responses }
    const now = Date.now()
    const runningTask: BookAnalysisTask = {
      status: 'running',
      completedPhaseIds: LEARNING_PHASES.filter(phase => newResponses[phase.id]).map(phase => phase.id),
      startedAt: analysisTask?.startedAt || now,
      updatedAt: now,
    }
    publishAnalysisTask(book.id, { task: runningTask, responses: newResponses })
    setAnalysisTask(runningTask)
    updateBook(book.id, { analysisTask: runningTask })
    let hasMarkedAsReading = book.status !== 'unread'

    const failedPhases: string[] = []
    let authenticationFailed = false
    let contextLimitExceeded = false
    let interruptedMessage: string | null = null

    try {
      await flushPendingStoreWrites()
      for (let i = 0; i < LEARNING_PHASES.length; i++) {
        const phase = LEARNING_PHASES[i]
        
        // 如果已经有结果了，跳过
        if (newResponses[phase.id]) continue

        const phaseTask: BookAnalysisTask = {
          ...runningTask,
          currentPhaseId: phase.id,
          updatedAt: Date.now(),
        }
        publishAnalysisTask(book.id, { task: phaseTask, responses: newResponses })
        setAnalysisTask(phaseTask)
        
        try {
          const prompt = generatePhasePrompt(book.name, phase.id, lang)
          const requiredHeadings = [...prompt.matchAll(/^##\s+(.+)$/gm)].map(match => match[1].trim())
          const response = await chat(client, systemPrompt, prompt, book.documentContent, {
            requiredHeadings,
            requireSourceCitations: Boolean(book.documentContent),
            requestContext: { task: `phase-${phase.id}`, bookId: book.id }
          })
          newResponses[phase.id] = response

          const completedTask: BookAnalysisTask = {
            status: 'running',
            completedPhaseIds: LEARNING_PHASES.filter(item => newResponses[item.id]).map(item => item.id),
            startedAt: runningTask.startedAt,
            updatedAt: Date.now(),
            ...(i + 1 < LEARNING_PHASES.length ? { currentPhaseId: LEARNING_PHASES[i + 1].id } : {}),
          }

          updateBook(book.id, {
            responses: { ...newResponses },
            analysisTask: completedTask,
            ...(!hasMarkedAsReading ? { status: 'reading' as const } : {})
          })
          await flushPendingStoreWrites()
          const persistedBook = getBook(book.id)
          if (persistedBook) setBook(persistedBook)
          setResponses({ ...newResponses })
          setAnalysisTask(completedTask)
          publishAnalysisTask(book.id, { task: completedTask, responses: { ...newResponses } })
          hasMarkedAsReading = true
        } catch (error) {
          const persistedBook = await reloadBookFromPersistence(book.id).catch(() => undefined)
          if (persistedBook) {
            setBook(persistedBook)
            setResponses(persistedBook.responses || {})
            Object.keys(newResponses).forEach(key => delete newResponses[key])
            Object.assign(newResponses, persistedBook.responses || {})
          }
          if (isDeepSeekAuthenticationError(error)) {
            authenticationFailed = true
            setApiKeyInvalid(true)
            logger.warn('DeepSeek rejected the configured API key.')
            break
          }
          if (error instanceof Error && error.message === AI_CONTEXT_LIMIT_EXCEEDED) {
            contextLimitExceeded = true
            logger.warn('Phase analysis stopped because the reduced document context was still too long.')
            break
          }
          const taskError = aiTaskErrorMessage(error, lang)
          if (taskError) {
            interruptedMessage = taskError
            break
          }
          logger.error(`Phase analysis failed: ${phase.id}`, error)
          failedPhases.push(t(lang, `phases.${phase.id}.subtitle`))
        }
      }

      if (Object.keys(newResponses).length > 0) {
        setCurrentPhase(0)
      }
      if (interruptedMessage) {
        setAnalysisError(interruptedMessage)
      } else if (authenticationFailed) {
        setAnalysisError(lang === 'zh'
          ? '当前 TokenDance API Key 无效或已失效，请前往设置重新授权。'
          : 'The current TokenDance API key is invalid or expired. Reauthorize it in Settings.')
      } else if (contextLimitExceeded) {
        setAnalysisError(lang === 'zh'
          ? '文档上下文仍然过长，系统已自动缩减后重试但未成功。请拆分文档后重新上传，已完成的阶段不会丢失。'
          : 'The document context is still too long after automatic reduction. Split and upload the document again; completed phases were kept.')
      } else if (failedPhases.length > 0) {
        setAnalysisError(lang === 'zh'
          ? `${failedPhases.join('、')}分析失败，已成功的阶段已保存，可点击重试继续补齐。`
          : `${failedPhases.join(', ')} failed. Successful phases were saved; retry to complete the missing phases.`)
      }
      const finalError = interruptedMessage || (authenticationFailed
        ? (lang === 'zh' ? '当前 TokenDance API Key 无效或已失效，请前往设置重新授权。' : 'The current TokenDance API key is invalid or expired. Reauthorize it in Settings.')
        : contextLimitExceeded
          ? (lang === 'zh' ? '文档上下文仍然过长，系统已自动缩减后重试但未成功。' : 'The document context is still too long after automatic reduction.')
          : failedPhases.length > 0
            ? (lang === 'zh' ? `${failedPhases.join('、')}分析失败，请点击继续分析。` : `${failedPhases.join(', ')} failed. Click continue to retry.`)
            : null)
      const finalTask: BookAnalysisTask = {
        status: finalError ? 'failed' : 'completed',
        completedPhaseIds: LEARNING_PHASES.filter(item => newResponses[item.id]).map(item => item.id),
        startedAt: runningTask.startedAt,
        updatedAt: Date.now(),
        ...(finalError ? { error: finalError } : {}),
      }
      updateBook(book.id, { responses: { ...newResponses }, analysisTask: finalTask })
      await flushPendingStoreWrites()
      setAnalysisTask(finalTask)
      publishAnalysisTask(book.id, { task: finalTask, responses: { ...newResponses } })
    } finally {
      analysisInFlightRef.current = false
      setLoading(false)
      setAnalyzingInBackground(false)
      if (activeAnalysisTasks.get(book.id)?.task.status !== 'running') activeAnalysisTasks.delete(book.id)
    }
  }

  useEffect(() => {
    if (!client || !isAuthenticated || analysisTask?.status !== 'running' || analysisInFlightRef.current) return
    if (activeAnalysisTasks.get(book.id)?.task.status === 'running') {
      setAnalyzingInBackground(true)
      return
    }
    void handleAnalyzeAll()
    // The callback intentionally uses the latest client, book, and settings;
    // the persisted task status is the only resume trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, isAuthenticated, analysisTask?.status, book.id])

  const scrollToReadingAnchor = (target: React.RefObject<HTMLDivElement | null>) => {
    const scroll = () => target.current?.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      block: 'start'
    })

    if (typeof window.requestAnimationFrame === 'function') window.requestAnimationFrame(scroll)
    else window.setTimeout(scroll, 0)
  }

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab)
    scrollToReadingAnchor(readingTabsRef)
  }

  const handlePhaseChange = (idx: number) => {
    setCurrentPhase(idx)
    scrollToReadingAnchor(phaseContentRef)
  }

  const visibleAnalysisError = analysisError || analysisTask?.error || null

  const handleNextPhase = () => {
    if (currentPhase < LEARNING_PHASES.length - 1) {
      handlePhaseChange(currentPhase + 1)
      return
    }

    handleTabChange('practice')
  }

  const handleCompletePhase = async () => {
    if (progressSaveInFlightRef.current) return
    if (!isAuthenticated) {
      requestLogin(lang === 'zh' ? '登录后才能保存阅读进度。' : 'Sign in to save reading progress.')
      return
    }
    const completedCount = clampCompletedPhaseCount(book.currentPhase, LEARNING_PHASES.length)
    const newProgress = completePhase(currentPhase, completedCount, LEARNING_PHASES.length)

    progressSaveInFlightRef.current = true
    setSavingProgress(true)
    setAnalysisError(null)
    try {
      if (newProgress !== completedCount) updateBook(book.id, { currentPhase: newProgress })
      await flushPendingStoreWrites()
      const persistedBook = getBook(book.id)
      if (persistedBook) setBook(persistedBook)

      if (currentPhase === LEARNING_PHASES.length - 1) {
        handleTabChange('practice')
      } else {
        handlePhaseChange(currentPhase + 1)
      }
    } catch (error) {
      const persistedBook = await reloadBookFromPersistence(book.id).catch(() => undefined)
      if (persistedBook) setBook(persistedBook)
      logger.error('Learning progress save failed:', error)
      setAnalysisError(lang === 'zh'
        ? '阶段进度未能保存到账号云端，页面未继续跳转。请检查登录和网络后重试。'
        : 'Phase progress could not be saved to your account cloud. The page did not advance; check sign-in and network, then try again.')
    } finally {
      progressSaveInFlightRef.current = false
      setSavingProgress(false)
    }
  }

  const handleSubmitPractice = async () => {
    if (practiceSubmissionRef.current) return
    if (!isAuthenticated) {
      requestLogin(lang === 'zh' ? '登录后才能使用 AI 点评并保存费曼实践记录。' : 'Sign in to use AI review and save Feynman practice records.')
      return
    }
    if (teachingNote.length > MAX_AI_ANSWER_LENGTH) {
      setPracticeError(lang === 'zh'
        ? `教学内容不能超过 ${MAX_AI_ANSWER_LENGTH.toLocaleString()} 个字符。`
        : `Teaching content cannot exceed ${MAX_AI_ANSWER_LENGTH.toLocaleString()} characters.`)
      return
    }
    if (teachingNote.length < 200) {
      setPracticeError(lang === 'zh' ? '教学内容至少需要 200 字。' : 'Teaching content must be at least 200 characters.')
      return
    }
    if (!client) {
      setPracticeError(missingApiKey
        ? (lang === 'zh' ? '提交 AI 评估前，请先在设置中连接并保存 TokenDance API Key。' : 'Connect and save your TokenDance API key in Settings before AI review.')
        : aiConsentRequired
          ? (lang === 'zh' ? '请先在设置中同意 AI 数据传输后再提交。' : 'Please consent to AI data transfer in Settings before submitting.')
          : (lang === 'zh' ? 'TokenDance AI 尚未就绪，请前往设置检查授权后重试。' : 'TokenDance AI is not ready. Check the authorization in Settings and try again.'))
      return
    }
    practiceSubmissionRef.current = true
    setPracticeError(null)
    setLoading(true)
    
    try {
      const prompt = generateReviewPrompt(book.name, teachingNote, lang)
      const systemPrompt = generateSystemPrompt(book.name, lang)
      const sessionId = createLocalId()
      let response: string

      try {
        response = await chatJson(client, systemPrompt, prompt, book.documentContent, {
          requireSourceCitations: Boolean(book.documentContent),
          requestContext: { task: 'teaching-evaluation', bookId: book.id, sessionId }
        })
      } catch (error) {
        logger.error('Practice evaluation request failed:', error)
        const contextLimitExceeded = error instanceof Error && error.message === AI_CONTEXT_LIMIT_EXCEEDED
        const taskError = aiTaskErrorMessage(error, lang)
        setPracticeError(taskError || (contextLimitExceeded
          ? (lang === 'zh'
              ? '文档上下文过长，系统自动缩减后仍未完成评分。你填写的教学内容已保留，请拆分文档后重试。'
              : 'The document context is too long even after automatic reduction. Your teaching content was kept; split the document and try again.')
          : (lang === 'zh'
              ? '评分请求失败，请检查 TokenDance 授权和网络后重试。'
              : 'The evaluation request failed. Check your TokenDance authorization and network, then try again.')))
        return
      }

      let result: ReturnType<typeof parsePracticeEvaluation>
      try {
        result = parsePracticeEvaluation(response)
      } catch (error) {
        logger.error('Practice evaluation response was invalid:', error)
        setPracticeError(lang === 'zh'
          ? 'AI 未返回有效评分，本次内容已保留，请重新提交。'
          : 'AI did not return a valid evaluation. Your content was kept; please submit again.')
        return
      }

      try {
        // addPracticeRecord 会自动检查并更新状态
        addPracticeRecord(book.id, {
          sessionId,
          content: teachingNote,
          aiReview: result.review,
          scores: result.scores,
          passed: result.passed
        })
        await flushPendingStoreWrites()

        // 重新获取更新后的 book 数据
        const updatedBook = getBook(book.id)
        if (updatedBook) {
          setBook(updatedBook)
        }

        setShowPracticeHistory(true)
        setTimeout(() => {
          practiceHistoryRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }, 100)

        setTeachingNote('')
      } catch (error) {
        const persistedBook = await reloadBookFromPersistence(book.id).catch(() => undefined)
        if (persistedBook) setBook(persistedBook)
        logger.error('Practice record save failed:', error)
        setPracticeError(lang === 'zh'
          ? '评分已完成，但保存记录失败。请稍后重试。'
          : 'The evaluation completed, but the record could not be saved. Please try again later.')
      }
    } finally {
      practiceSubmissionRef.current = false
      setLoading(false)
    }
  }

  const handleDeleteRecord = async (recordId: string) => {
    if (!isAuthenticated) {
      requestLogin(lang === 'zh' ? '登录后才能管理实践记录。' : 'Sign in to manage practice records.')
      return
    }
    if (practiceDeletionIdsRef.current.has(recordId)) return
    practiceDeletionIdsRef.current.add(recordId)
    setPracticeError(null)
    try {
      deletePracticeRecord(book.id, recordId)
      await flushPendingStoreWrites()
      const updatedBook = getBook(book.id)
      if (updatedBook) setBook(updatedBook)
    } catch (error) {
      const persistedBook = await reloadBookFromPersistence(book.id).catch(() => undefined)
      if (persistedBook) setBook(persistedBook)
      logger.error('Practice record deletion failed:', error)
      setPracticeError(lang === 'zh'
        ? '练习记录删除失败，原记录已恢复。请稍后重试。'
        : 'The practice record could not be deleted and was restored. Please try again.')
    } finally {
      practiceDeletionIdsRef.current.delete(recordId)
    }
  }

  const handleSaveNote = async () => {
    if (noteMutationInFlightRef.current) return
    if (!isAuthenticated) {
      requestLogin(lang === 'zh' ? '登录后才能保存笔记。' : 'Sign in to save notes.')
      return
    }
    if (!newNote.trim()) return
    if (newNote.length > MAX_NOTE_LENGTH) {
      setNoteError(lang === 'zh'
        ? `单条笔记不能超过 ${MAX_NOTE_LENGTH.toLocaleString()} 个字符。`
        : `A note cannot exceed ${MAX_NOTE_LENGTH.toLocaleString()} characters.`)
      return
    }
    const newRecord: NoteRecord = {
      id: createLocalId(),
      type: 'note',
      content: newNote.trim(),
      phaseId: LEARNING_PHASES[currentPhase]?.id,
      createdAt: Date.now()
    }
    const updatedRecords = [...noteRecords, newRecord]
    noteMutationInFlightRef.current = true
    setNoteSaving(true)
    setNoteError(null)
    try {
      updateBook(book.id, { noteRecords: updatedRecords })
      await flushPendingStoreWrites()
      const persistedBook = getBook(book.id)
      if (persistedBook) setBook(persistedBook)
      setNoteRecords(persistedBook?.noteRecords || updatedRecords)
      setNewNote('')
    } catch (error) {
      const persistedBook = await reloadBookFromPersistence(book.id).catch(() => undefined)
      if (persistedBook) {
        setBook(persistedBook)
        setNoteRecords(persistedBook.noteRecords || [])
      }
      logger.error('Note save failed:', error)
      setNoteError(lang === 'zh'
        ? '笔记保存失败，输入内容已保留，请稍后重试。'
        : 'The note could not be saved. Your input was kept; please try again.')
    } finally {
      noteMutationInFlightRef.current = false
      setNoteSaving(false)
    }
  }

  const handleDeleteNote = async (noteId: string) => {
    if (noteMutationInFlightRef.current) return
    if (!isAuthenticated) {
      requestLogin(lang === 'zh' ? '登录后才能删除笔记。' : 'Sign in to delete notes.')
      return
    }
    const updatedRecords = noteRecords.filter(n => n.id !== noteId)
    noteMutationInFlightRef.current = true
    setNoteSaving(true)
    setNoteError(null)
    try {
      updateBook(book.id, { noteRecords: updatedRecords })
      await flushPendingStoreWrites()
      const persistedBook = getBook(book.id)
      if (persistedBook) setBook(persistedBook)
      setNoteRecords(persistedBook?.noteRecords || updatedRecords)
    } catch (error) {
      const persistedBook = await reloadBookFromPersistence(book.id).catch(() => undefined)
      if (persistedBook) {
        setBook(persistedBook)
        setNoteRecords(persistedBook.noteRecords || [])
      }
      logger.error('Note deletion failed:', error)
      setNoteError(lang === 'zh'
        ? '笔记删除失败，原笔记已恢复。请稍后重试。'
        : 'The note could not be deleted and was restored. Please try again.')
    } finally {
      noteMutationInFlightRef.current = false
      setNoteSaving(false)
    }
  }

  const handleBookUpdate = () => {
    // 重新获取 book 数据以更新状态
    const updatedBook = getBook(book.id)
    if (updatedBook) {
      setBook(updatedBook)
    }
  }
  
  // 点击教学模拟卡片，跳转并展开记录
  const handleTeachingCardClick = () => {
    if (practiceRecords.length > 0) {
      setShowPracticeHistory(true)
      setTimeout(() => {
        practiceHistoryRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }, 100)
    }
  }
  
  // 点击角色问答卡片，跳转并展开记录
  const handleQACardClick = () => {
    if (book.qaPracticeRecords && book.qaPracticeRecords.length > 0) {
      setQaShowHistory(true)
      setTimeout(() => {
        qaHistoryRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }, 100)
    }
  }

  const phase = LEARNING_PHASES[currentPhase]
  const practiceRecords = book.practiceRecords || []
  const practiceHistoryText = practiceRecords
    .slice()
    .reverse()
    .map((record, index) => [
      `${lang === 'zh' ? '实践记录' : 'Practice Record'} ${index + 1}`,
      `${lang === 'zh' ? '得分' : 'Score'}: ${record.scores.overall}`,
      `${lang === 'zh' ? '教学输出' : 'Teaching Output'}:\n${record.content}`,
      `${lang === 'zh' ? 'AI 点评' : 'AI Review'}:\n${record.aiReview}`
    ].join('\n\n'))
    .join('\n\n---\n\n')
  const completedPhaseCount = clampCompletedPhaseCount(book.currentPhase, LEARNING_PHASES.length)
  const practiceComplete = book.bestScore >= 60

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-[var(--text-secondary)] text-sm">{t(lang, 'reading.currentBook')}</p>
          <h1 className="text-2xl font-bold">《{book.name}》</h1>
          {book.isSample && (
            <p className="mt-1 text-xs text-[var(--accent)]">
              {lang === 'zh' ? '系统示例学习档案 · 不计入个人云端数据或历史迁移' : 'System sample learning record · excluded from personal cloud data and legacy migration'}
            </p>
          )}
          {metadataEnrichmentStatus === 'loading' && (
            <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-[var(--accent)]">
              <AppIcon name="refresh" tone="blue" size={13} className="animate-spin" />
              {lang === 'zh' ? '正在自动补全作者、简介和标签' : 'Completing author, summary, and tags'}
            </p>
          )}
          {metadataEnrichmentStatus === 'error' && (
            <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
              <AppIcon name="alert" tone="amber" size={13} />
              {lang === 'zh' ? '书籍信息自动补全未完成，可稍后重新进入或在书架编辑' : 'Book details were not completed; reopen the book later or edit them on the bookshelf'}
            </p>
          )}
          {practiceComplete && book.bestScore > 0 && (
            <p className="text-sm mt-1">
              <span className="text-[var(--text-secondary)]">{t(lang, 'practice.bestScore')}: </span>
              <span className={practiceComplete ? 'text-green-400' : 'text-yellow-400'}>{book.bestScore}分</span>
              {practiceComplete && <span className="ml-2 inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400"><AppIcon name="success" size={15} /> {t(lang, 'practice.passed')}</span>}
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-2 self-end sm:self-auto">
          <button onClick={() => setShowBookOrganizer(true)} className="btn-secondary flex items-center gap-2 text-sm py-2">
            <AppIcon name="bookMarked" tone="violet" size={17} />
            {lang === 'zh' ? '整理' : 'Organize'}
          </button>
          <button onClick={onBack} className="btn-secondary flex items-center gap-2 text-sm py-2"><AppIcon name="arrowLeft" size={17} />{t(lang, 'reading.changeBook')}</button>
        </div>
      </div>

      {/* Tabs */}
      <div ref={readingTabsRef} className="mb-6 grid scroll-mt-24 grid-cols-4 gap-1 rounded-xl bg-[var(--bg-secondary)] p-1 sm:gap-2">
        {[
          { key: 'phase' as TabType, label: lang === 'zh' ? '阶段学习' : 'Learning', mobileLabel: lang === 'zh' ? '阶段学习' : 'Learn', icon: 'library' as AppIconName, tone: 'blue' as const },
          { key: 'practice' as TabType, label: lang === 'zh' ? '费曼实践' : 'Practice', mobileLabel: lang === 'zh' ? '费曼实践' : 'Practice', icon: 'graduation' as AppIconName, tone: 'green' as const },
          { key: 'notes' as TabType, label: lang === 'zh' ? '我的笔记' : 'Notes', mobileLabel: lang === 'zh' ? '我的笔记' : 'Notes', icon: 'note' as AppIconName, tone: 'amber' as const },
          { key: 'recommendations' as TabType, label: lang === 'zh' ? '相关推荐' : 'Recommendations', mobileLabel: lang === 'zh' ? '相关推荐' : 'Related', icon: 'bookOpen' as AppIconName, tone: 'violet' as const }
        ].map(tab => (
          <button
            key={tab.key}
            data-testid={`reading-tab-${tab.key}`}
            aria-label={tab.label}
            onClick={() => handleTabChange(tab.key)}
            className={`flex min-w-0 items-center justify-center rounded-lg px-1 py-3 text-xs transition-all sm:gap-2 sm:px-2 sm:text-sm ${
              activeTab === tab.key 
                ? 'bg-[var(--accent)] text-white' 
                : 'hover:bg-[var(--bg-card)]'
            }`}
          >
            <AppIcon name={tab.icon} tone={activeTab === tab.key ? 'inherit' : tab.tone} size={18} className="hidden sm:block" />
            <span className="whitespace-nowrap sm:hidden">{tab.mobileLabel}</span>
            <span className="hidden whitespace-nowrap sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Phase Tab */}
      {activeTab === 'phase' && (
        <div className="animate-fade-in">
          {/* 如果还没开始分析，显示开始按钮 */}
          {Object.keys(responses).length === 0 && !analysisRunning && (
            <div className="card text-center py-16">
              <AppIcon name="library" tone="blue" size={56} className="mx-auto mb-4" />
              <h3 className="text-xl font-bold mb-2">
                {lang === 'zh' ? '开始深度学习' : 'Start Deep Learning'}
              </h3>
              <p className="text-[var(--text-secondary)] mb-6">
                {lang === 'zh' 
                  ? 'AI 将从6个维度深度分析这本书，帮助你全面理解' 
                  : 'AI will analyze this book from 6 dimensions'}
              </p>
              <button
                onClick={needsAiConfiguration ? onOpenSettings : handleAnalyzeAll}
                disabled={analysisRunning || (!needsAiConfiguration && !client)}
                className="btn-primary inline-flex items-center justify-center gap-2 text-lg px-8 py-4"
              >
                <AppIcon name={needsAiConfiguration ? 'key' : 'sparkles'} size={20} />
                {needsAiConfiguration
                  ? (lang === 'zh' ? '配置 TokenDance，开始分析' : 'Set up TokenDance to analyze')
                  : client
                    ? (lang === 'zh' ? '开始 AI 深度分析' : 'Start AI Analysis')
                    : (lang === 'zh' ? '正在准备 AI...' : 'Preparing AI...')}
              </button>
              {needsAiConfiguration && (
                <p className="mt-3 text-sm text-[var(--text-secondary)]">
                  {lang === 'zh' ? '只在生成新内容时需要；已保存的学习记录仍可直接查看。' : 'Only new AI work needs setup; saved learning records remain available.'}
                </p>
              )}
            </div>
          )}

          {visibleAnalysisError && (
            <div role="alert" className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-700 dark:text-red-300">
              <span>{visibleAnalysisError}</span>
              <div className="flex gap-2">
                {(missingApiKey || aiConsentRequired || apiKeyInvalid || visibleAnalysisError.includes('TokenDance')) && (
                  <button onClick={onOpenSettings} className="btn-secondary text-sm py-2">
                    {lang === 'zh' ? '前往设置' : 'Open Settings'}
                  </button>
                )}
                {client && Object.keys(responses).length < LEARNING_PHASES.length && !aiConsentRequired && !apiKeyInvalid && (
                  <button onClick={handleAnalyzeAll} disabled={loading} className="btn-secondary text-sm py-2">
                    {lang === 'zh' ? '重试缺失阶段' : 'Retry Missing Phases'}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* 分析中显示金句 */}
          {analysisRunning && Object.keys(responses).length < LEARNING_PHASES.length && (
            <div className="card">
              <div className="mb-6 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-xl">
                <p className="flex items-center justify-center gap-2 text-amber-700 dark:text-amber-400 text-sm font-medium text-center">
                  <AppIcon name="alert" size={17} />{lang === 'zh'
                    ? '正在后台分析，可切换页面；返回后会自动恢复进度'
                    : 'Analysis is running in the background. You can switch pages and return to resume.'}
                </p>
              </div>
              
              <LoadingQuotes lang={lang} quotes={quotes} />
              
              <div className="mt-6 text-center">
                <p className="text-sm text-[var(--text-secondary)]">
                  {lang === 'zh' 
                    ? `正在分析中... 已完成 ${Object.keys(responses).length}/${LEARNING_PHASES.length} 个阶段` 
                    : `Analyzing... ${Object.keys(responses).length}/${LEARNING_PHASES.length} phases completed`}
                </p>
                <div className="mt-3 progress-bar">
                  <div className="progress-fill" style={{ width: `${(Object.keys(responses).length / LEARNING_PHASES.length) * 100}%` }} />
                </div>
              </div>
            </div>
          )}

          {/* 已有分析结果，显示阶段选择器和内容 */}
          {Object.keys(responses).length > 0 && (
            <>
              {/* Phase Selector */}
              <div ref={phaseProgressRef} className="card mb-6 scroll-mt-24">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold">{lang === 'zh' ? '学习进度' : 'Learning Progress'}</h3>
                  <span className="text-sm text-[var(--text-secondary)]">
                    {completedPhaseCount} / {LEARNING_PHASES.length}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                  {LEARNING_PHASES.map((p, idx) => (
                    <button
                      key={p.id}
                      onClick={() => handlePhaseChange(idx)}
                      disabled={!responses[p.id]}
                      aria-label={lang === 'zh'
                        ? `第 ${idx + 1} 阶段：${t(lang, `phases.${p.id}.title`)}`
                        : `Phase ${idx + 1}: ${t(lang, `phases.${p.id}.title`)}`}
                      className={`flex min-w-0 min-h-[92px] flex-col items-center justify-start rounded-xl p-2.5 transition-all sm:p-3 ${
                        idx === currentPhase 
                          ? 'bg-[var(--accent)] text-white scale-105' 
                          : responses[p.id]
                            ? 'bg-[var(--bg-secondary)] hover:bg-[var(--border)]' 
                            : 'bg-[var(--bg-secondary)] opacity-30 cursor-not-allowed'
                      }`}
                    >
                      <AppIcon name={phaseIconNames[p.id]} tone={idx === currentPhase ? 'inherit' : phaseIconTones[p.id]} size={22} className="mb-1" />
                      <span className="min-w-0 max-w-full break-words text-center text-xs leading-4">{t(lang, `phases.${p.id}.subtitle`)}</span>
                      {responses[p.id] && isPhaseCompleted(idx, completedPhaseCount) && <AppIcon name="success" tone="green" size={14} className="mt-1" />}
                      {responses[p.id] && !isPhaseCompleted(idx, completedPhaseCount) && <AppIcon name="circle" tone="amber" size={13} className="mt-1" />}
                    </button>
                  ))}
                </div>
                <div className="mt-4 progress-bar">
                  <div className="progress-fill" style={{ width: `${(completedPhaseCount / LEARNING_PHASES.length) * 100}%` }} />
                </div>
                
                {analyzingInBackground && (
                  <div className="mt-4 text-center">
                    <p className="inline-flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                      <AppIcon name="refresh" tone="amber" size={14} className="animate-spin" />
                      {lang === 'zh' ? '后台分析中，你可以自由浏览已完成的阶段' : 'Analyzing in background, feel free to browse'}
                    </p>
                  </div>
                )}
              </div>

              {/* Phase Content */}
              {phase && responses[phase.id] && (
                <div ref={phaseContentRef} className="card scroll-mt-24">
                  <div className="flex items-center gap-3 mb-2">
                    <AppIcon name={phaseIconNames[phase.id]} tone={phaseIconTones[phase.id]} size={28} />
                    <div>
                      <h2 className="text-xl font-bold">{t(lang, `phases.${phase.id}.title`)}</h2>
                      <p className="text-[var(--text-secondary)] text-sm">{t(lang, `phases.${phase.id}.subtitle`)}</p>
                    </div>
                  </div>
                  <p className="text-[var(--text-secondary)] mb-6 pl-12">{t(lang, `phases.${phase.id}.desc`)}</p>

                  {/* 检查是否可以查看内容 */}
                  {isPhaseUnlocked(currentPhase, completedPhaseCount) ? (
                    <>
                      <PhaseResult
                        key={currentPhase}
                        content={responses[phase.id]}
                        documentContent={book.documentContent}
                        lang={lang}
                        onExpandAll={() => scrollToReadingAnchor(phaseProgressRef)}
                        onQuoteSelected={handleQuoteSelected}
                      />

                      {/* 每个阶段都显示完成按钮 */}
                      {isPhaseCompleted(currentPhase, completedPhaseCount) ? (
                        <div className="mt-6 space-y-3">
                          <div className="text-center py-3 bg-green-500/10 border border-green-500/30 rounded-xl">
                            <span className="inline-flex items-center gap-2 text-emerald-600 dark:text-emerald-400"><AppIcon name="success" size={17} />{lang === 'zh' ? '已完成此阶段' : 'Phase Completed'}</span>
                          </div>
                          <button
                            type="button"
                            onClick={handleNextPhase}
                            className="btn-primary flex min-h-11 w-full items-center justify-center gap-2"
                          >
                            <AppIcon name="arrowRight" size={18} />
                            {currentPhase < LEARNING_PHASES.length - 1
                              ? (lang === 'zh'
                                  ? `下一阶段：${t(lang, `phases.${LEARNING_PHASES[currentPhase + 1].id}.title`)}`
                                  : `Next phase: ${t(lang, `phases.${LEARNING_PHASES[currentPhase + 1].id}.title`)}`)
                              : (lang === 'zh' ? '进入费曼实践' : 'Continue to Feynman Practice')}
                          </button>
                        </div>
                      ) : (
                        // 当前进度的阶段，可以点击完成
                        <button
                          onClick={handleCompletePhase}
                          disabled={savingProgress}
                          className="mt-6 w-full btn-primary flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <AppIcon name={currentPhase < LEARNING_PHASES.length - 1 ? 'check' : 'arrowRight'} size={18} />
                          {savingProgress
                            ? (lang === 'zh' ? '保存中...' : 'Saving...')
                            : currentPhase < LEARNING_PHASES.length - 1
                            ? (lang === 'zh' ? '完成此阶段，进入下一步' : 'Complete & Next')
                            : (lang === 'zh' ? '完成学习，去实践' : 'Complete & Practice')}
                        </button>
                      )}
                    </>
                  ) : (
                    // 未到达的阶段，显示锁定提示
                    <div className="text-center py-16">
                      <AppIcon name="lock" tone="muted" size={56} className="mx-auto mb-4" />
                      <p className="text-[var(--text-secondary)] text-lg mb-2">
                        {lang === 'zh' ? '此阶段尚未解锁' : 'This Phase is Locked'}
                      </p>
                      <p className="text-sm text-[var(--text-secondary)]">
                        {lang === 'zh' 
                          ? '请先完成前面的阶段才能查看此内容' 
                          : 'Complete previous phases to unlock this content'}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Practice Tab */}
      {activeTab === 'practice' && (
        <div className="animate-fade-in space-y-6">
          {/* 成绩概览卡片 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* 教学模拟成绩 */}
            <div 
              onClick={handleTeachingCardClick}
              className={`card border-2 border-[var(--accent)]/25 bg-gradient-to-br from-[var(--accent)]/10 to-[var(--accent-secondary)]/8 transition-all ${
                practiceRecords.length > 0 ? 'cursor-pointer hover:border-[var(--accent)]/55 hover:shadow-lg hover:scale-[1.02]' : ''
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <AppIcon name="graduation" tone="blue" size={24} />
                  <h3 className="font-bold">{lang === 'zh' ? '教学模拟' : 'Teaching'}</h3>
                </div>
                {practiceRecords.length > 0 && (
                  <span className="text-xs text-[var(--text-secondary)]">
                    {practiceRecords.length} {lang === 'zh' ? '次记录' : 'records'}
                  </span>
                )}
              </div>
              
              {practiceRecords.length > 0 ? (
                <div className="flex items-center justify-between">
                  <div>
                    <div className="mb-1 text-3xl font-bold text-[var(--accent)]">
                      {Math.max(...practiceRecords.map(r => r.scores.overall))}
                    </div>
                    <div className="text-xs text-[var(--text-secondary)]">
                      {lang === 'zh' ? '最高分' : 'Best Score'}
                    </div>
                  </div>
                  <div className={`px-4 py-2 rounded-xl font-bold ${
                    Math.max(...practiceRecords.map(r => r.scores.overall)) >= 60
                      ? 'bg-green-500 text-white'
                      : 'bg-yellow-500 text-white'
                  }`}>
                    {Math.max(...practiceRecords.map(r => r.scores.overall)) >= 60
                      ? (lang === 'zh' ? '已通过' : 'Passed')
                      : (lang === 'zh' ? '未通过' : 'Not Passed')}
                  </div>
                </div>
              ) : (
                <div className="text-center py-4 text-[var(--text-secondary)]">
                  <AppIcon name="note" tone="blue" size={36} className="mx-auto mb-2" />
                  <div className="text-sm">{lang === 'zh' ? '还没有记录' : 'No records yet'}</div>
                </div>
              )}
              
              {practiceRecords.length > 0 && (
                <div className="mt-3 border-t border-[var(--accent)]/20 pt-3 text-center">
                  <span className="text-xs text-[var(--accent)]">
                    <span className="inline-flex items-center gap-1">{lang === 'zh' ? '点击查看详细记录' : 'Click to view details'}<AppIcon name="arrowRight" size={13} /></span>
                  </span>
                </div>
              )}
            </div>

            {/* 角色问答成绩 */}
            <div 
              onClick={handleQACardClick}
              className={`card bg-gradient-to-br from-green-500/10 to-teal-500/10 border-2 border-green-500/30 transition-all ${
                book.qaPracticeRecords && book.qaPracticeRecords.length > 0 ? 'cursor-pointer hover:border-green-500/60 hover:shadow-lg hover:scale-[1.02]' : ''
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <AppIcon name="message" tone="green" size={24} />
                  <h3 className="font-bold">{lang === 'zh' ? '角色问答' : 'Q&A'}</h3>
                </div>
                {book.qaPracticeRecords && book.qaPracticeRecords.length > 0 && (
                  <span className="text-xs text-[var(--text-secondary)]">
                    {book.qaPracticeRecords.length} {lang === 'zh' ? '次记录' : 'records'}
                  </span>
                )}
              </div>
              
              {book.qaPracticeRecords && book.qaPracticeRecords.length > 0 ? (
                (() => {
                  const latestRecord = book.qaPracticeRecords[book.qaPracticeRecords.length - 1]
                  const latestRecordPassed = isQAPracticeRecordComplete(latestRecord)
                  const answeredQuestions = latestRecord.questions.filter(q => q.score !== undefined)
                  const passedQuestions = latestRecord.questions.filter(q => q.passed)
                  const avgScore = answeredQuestions.length > 0
                    ? Math.round(answeredQuestions.reduce((sum, q) => sum + (q.score || 0), 0) / answeredQuestions.length)
                    : 0
                  
                  return (
                    <>
                      <div className="flex items-center justify-between">
                        <div>
                          {latestRecordPassed ? (
                            <div className="text-3xl font-bold text-green-400 mb-1">{avgScore}</div>
                          ) : (
                            <div className="text-3xl font-bold text-yellow-400 mb-1">
                              {passedQuestions.length} / {latestRecord.questions.length}
                            </div>
                          )}
                          <div className="text-xs text-[var(--text-secondary)]">
                            {latestRecordPassed
                              ? (lang === 'zh' ? '最新平均分' : 'Latest Avg')
                              : (lang === 'zh' ? '已通过问题' : 'Questions passed')}
                          </div>
                        </div>
                        <div className={`px-4 py-2 rounded-xl font-bold ${
                          latestRecordPassed
                            ? 'bg-green-500 text-white'
                            : 'bg-yellow-500 text-white'
                        }`}>
                          {latestRecordPassed
                            ? (lang === 'zh' ? '已通过' : 'Passed')
                            : (lang === 'zh' ? '未通过' : 'Not Passed')}
                        </div>
                      </div>
                      <div className="mt-3 pt-3 border-t border-green-500/20 text-center">
                        <span className="text-xs text-green-400">
                          <span className="inline-flex items-center gap-1">{lang === 'zh' ? '点击查看详细记录' : 'Click to view details'}<AppIcon name="arrowRight" size={13} /></span>
                        </span>
                      </div>
                    </>
                  )
                })()
              ) : (
                <div className="text-center py-4 text-[var(--text-secondary)]">
                  <AppIcon name="message" tone="muted" size={36} className="mx-auto mb-2" />
                  <div className="text-sm">{lang === 'zh' ? '还没有记录' : 'No records yet'}</div>
                </div>
              )}
            </div>
          </div>

          <div>
            <button
              type="button"
              onClick={() => setShowLearningCharts(current => !current)}
              className="flex items-center gap-2 text-sm font-medium text-[var(--accent)] hover:underline"
            >
              <AppIcon name={showLearningCharts ? 'chevronDown' : 'chevronRight'} size={16} />
              <AppIcon name="chart" tone="violet" size={17} />
              {lang === 'zh' ? '查看学习分析' : 'View learning analytics'}
            </button>
            {showLearningCharts && (
              <div className="mt-4 animate-fade-in">
                <BookLearningAnalytics book={book} lang={lang} />
              </div>
            )}
          </div>

          {(practiceRecords.length > 0 || (book.qaPracticeRecords?.length || 0) > 0) && (
            <p className="text-center text-xs text-[var(--text-secondary)]">
              {lang === 'zh'
                ? '综合成绩只合并同一学习会话中的教学模拟和由该次教学生成的角色问答。'
                : 'The final score combines teaching and persona Q&A only when they belong to the same learning session.'}
            </p>
          )}

          {/* 完成提示 */}
          {!practiceComplete && (
            <div className="rounded-xl border-2 border-[var(--accent)]/30 bg-gradient-to-r from-[var(--accent)]/8 to-[var(--success)]/8 p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-[var(--accent)]/12">
                    <AppIcon name="clipboard" tone="cyan" size={20} />
                  </div>
                  <div>
                    <h3 className="mb-0.5 text-base font-semibold text-[var(--accent)]">
                      {lang === 'zh' ? '阅读完成条件' : 'Completion Requirements'}
                    </h3>
                    <p className="text-sm text-[var(--text-secondary)]">
                      {lang === 'zh' 
                        ? '同一学习会话：教学模拟 60分+ ｜ 角色问答全部 60分+'
                        : 'Same session: Teaching 60+ | All Q&A 60+'}
                    </p>
                  </div>
                </div>
                <div className="rounded-lg border border-[var(--warning)]/55 bg-[var(--warning)]/18 px-3 py-1.5">
                  <span className="brand-emphasis-sun text-xs">
                    {lang === 'zh' ? '待完成' : 'Pending'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* 教学模拟 */}
          <div className="card">
            <div className="flex items-center gap-3 mb-4">
              <AppIcon name="graduation" tone="blue" size={30} />
              <div>
                <h2 className="text-xl font-bold">{t(lang, 'practice.title')}</h2>
                <p className="text-[var(--text-secondary)]">{t(lang, 'practice.subtitle')}</p>
              </div>
            </div>

            {loading ? (
              <LoadingQuotes lang={lang} quotes={quotes} />
            ) : (
              <>
                <h3 className="font-semibold mb-1">{t(lang, 'practice.teach')}</h3>
                <p className="text-sm text-[var(--text-secondary)] mb-3">{t(lang, 'practice.teachDesc')}</p>

                <textarea
                  value={teachingNote}
                  onChange={e => {
                    setTeachingNote(e.target.value)
                    setPracticeError(null)
                  }}
                  maxLength={MAX_AI_ANSWER_LENGTH}
                  placeholder={t(lang, 'practice.teachPlaceholder')}
                  className="input-field min-h-[250px] resize-y mb-2"
                />

                {practiceError && (
                  <div role="alert" className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-red-500/35 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
                    <span>{practiceError}</span>
                    {(missingApiKey || aiConsentRequired || apiKeyInvalid || practiceError.includes('TokenDance')) && (
                      <button type="button" onClick={onOpenSettings} className="btn-secondary py-1.5 text-xs">
                        {lang === 'zh' ? '前往设置' : 'Open Settings'}
                      </button>
                    )}
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className={`text-sm ${teachingNote.length >= 200 ? 'text-green-400' : 'text-[var(--text-secondary)]'}`}>
                    {teachingNote.length.toLocaleString()} / {MAX_AI_ANSWER_LENGTH.toLocaleString()} {lang === 'zh' ? '字' : 'chars'}
                    {teachingNote.length < 200 && <span className="ml-2 text-yellow-400">({t(lang, 'practice.minChars')})</span>}
                  </span>
                  <button
                    onClick={handleSubmitPractice}
                    disabled={loading || teachingNote.length < 200}
                    className="btn-primary"
                  >
                    {t(lang, 'practice.getReview')}
                  </button>
                </div>
              </>
            )}
          </div>

          {/* 实践记录 - 移到教学模拟下方，默认折叠 */}
          {practiceRecords.length > 0 && (
            <div className="card" ref={practiceHistoryRef}>
              <div className="flex items-center">
                <button
                  type="button"
                  onClick={() => setShowPracticeHistory(!showPracticeHistory)}
                  className="min-w-0 flex-1 flex items-center gap-2 rounded-lg p-2 text-left transition-colors hover:bg-[var(--bg-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)]/50"
                >
                  <h3 className="min-w-0 flex items-center gap-2 font-semibold"><AppIcon name="chart" tone="blue" size={18} />{t(lang, 'practice.history')} ({practiceRecords.length})</h3>
                </button>
                {showPracticeHistory && (
                  <CopyContentButton content={practiceHistoryText} lang={lang} label={lang === 'zh' ? '复制实践记录' : 'Copy practice records'} />
                )}
                <button
                  type="button"
                  onClick={() => setShowPracticeHistory(!showPracticeHistory)}
                  className="inline-flex min-h-10 min-w-10 items-center justify-center mr-1 rounded-lg transition-colors hover:bg-[var(--bg-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/50"
                  aria-label={lang === 'zh' ? (showPracticeHistory ? '收起实践记录' : '展开实践记录') : (showPracticeHistory ? 'Collapse practice records' : 'Expand practice records')}
                >
                  <AppIcon name="chevronDown" tone="muted" size={18} className={`transition-transform duration-200 ${showPracticeHistory ? 'rotate-180' : ''}`} />
                </button>
              </div>
              
              {showPracticeHistory && (
                <div className="mt-4 space-y-4 animate-fade-in">
                  {practiceRecords.slice().reverse().map(record => (
                    <div key={record.id} className="bg-[var(--bg-secondary)] rounded-xl p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <span className={`text-2xl font-bold ${record.passed ? 'text-green-400' : 'text-yellow-400'}`}>
                            {record.scores.overall}
                          </span>
                          <span className={`status-badge ${record.passed ? 'status-finished' : 'status-reading'}`}>
                            {record.passed ? t(lang, 'practice.passed') : t(lang, 'practice.notPassed')}
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-[var(--text-secondary)]">
                            {new Date(record.createdAt).toLocaleString()}
                          </span>
                          <span className="text-xs text-[var(--text-secondary)]">
                            {lang === 'zh' ? '会话' : 'Session'} {record.sessionId?.slice(-6)}
                          </span>
                          <button onClick={() => handleDeleteRecord(record.id)} className="text-red-400 text-sm">
                            {t(lang, 'practice.deleteRecord')}
                          </button>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2 mb-3">
                        {(['accuracy', 'completeness', 'clarity'] as const).map(key => (
                          <div key={key} className="bg-[var(--bg-card)] rounded-lg p-2 text-center">
                            <div className="text-xs text-[var(--text-secondary)]">{t(lang, `practice.${key}`)}</div>
                            <div className={record.scores[key] >= 60 ? 'text-green-400' : 'text-yellow-400'}>
                              {record.scores[key]}
                            </div>
                          </div>
                        ))}
                      </div>
                      <details>
                        <summary className="cursor-pointer text-sm text-[var(--accent)]">
                          {lang === 'zh' ? '查看详情' : 'View details'}
                        </summary>
                        <div className="mt-3 space-y-4 text-sm">
                          <div>
                            <p className="text-xs text-[var(--text-secondary)] mb-2">
                              {lang === 'zh' ? '教学输出：' : 'Teaching Output:'}
                            </p>
                            <div className="bg-[var(--bg-card)] rounded p-3">
                              <MarkdownRenderer content={record.content} />
                            </div>
                          </div>
                          <div>
                            <p className="text-xs text-[var(--text-secondary)] mb-2">
                              {lang === 'zh' ? 'AI 点评：' : 'AI Review:'}
                            </p>
                            <div className="bg-[var(--bg-card)] rounded p-3">
                              <MarkdownRenderer content={record.aiReview} onQuoteSelected={handleQuoteSelected} />
                              <SourceEvidence content={record.aiReview} documentContent={book.documentContent} lang={lang} />
                            </div>
                          </div>
                        </div>
                      </details>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 角色问答 */}
          <QAPractice
            book={book}
            apiKey={apiKey}
            needsAiConfiguration={needsAiConfiguration}
            lang={lang}
            quotes={quotes}
            onBookUpdate={handleBookUpdate}
            showHistory={qaShowHistory}
            onShowHistoryChange={setQaShowHistory}
            historyRef={qaHistoryRef}
            onOpenSettings={onOpenSettings}
            onQuoteSelected={handleQuoteSelected}
          />

          {/* 相关推荐 - 移到独立 Tab */}
        </div>
      )}

      {/* Notes Tab */}
      {activeTab === 'notes' && (
        <div className="animate-fade-in">
          <div className="card mb-6">
            <h2 className="flex items-center gap-2 text-xl font-bold mb-4"><AppIcon name="note" tone="amber" size={22} />{t(lang, 'practice.notes')}</h2>
            <textarea
              value={newNote}
              onChange={e => {
                setNewNote(e.target.value)
                setNoteError(null)
              }}
              maxLength={MAX_NOTE_LENGTH}
              placeholder={t(lang, 'practice.notesPlaceholder')}
              className="input-field min-h-[120px] resize-y mb-2"
            />
            <div className="mb-4 flex items-center justify-between gap-4 text-xs text-[var(--text-secondary)]">
              <span className={noteError ? 'text-red-400' : ''}>{noteError || ''}</span>
              <span className="shrink-0">{newNote.length.toLocaleString()} / {MAX_NOTE_LENGTH.toLocaleString()}</span>
            </div>
            <button onClick={handleSaveNote} disabled={!newNote.trim() || noteSaving} className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed">
              {noteSaving
                ? (lang === 'zh' ? '保存中...' : 'Saving...')
                : (lang === 'zh' ? '添加笔记' : 'Add Note')}
            </button>
          </div>

          <div className="card">
            <h3 className="flex items-center gap-2 font-semibold mb-4"><AppIcon name="library" tone="blue" size={19} />{lang === 'zh' ? '笔记历史' : 'History'} ({noteRecords.length})</h3>
            {noteRecords.length === 0 ? (
              <p className="text-[var(--text-secondary)] text-center py-8">
                {lang === 'zh' ? '还没有笔记' : 'No notes yet'}
              </p>
            ) : (
              <div className="space-y-3">
                {noteRecords.slice().reverse().map(note => (
                  <div key={note.id} className="bg-[var(--bg-secondary)] rounded-xl p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {note.phaseId && (
                          <span className="text-xs bg-[var(--accent)]/20 text-[var(--accent)] px-2 py-1 rounded">
                            {t(lang, `phases.${note.phaseId}.subtitle`)}
                          </span>
                        )}
                        <span className="text-xs text-[var(--text-secondary)]">
                          {new Date(note.createdAt).toLocaleString()}
                        </span>
                      </div>
                      <button onClick={() => handleDeleteNote(note.id)} disabled={noteSaving} className="text-red-400 text-sm disabled:opacity-50">
                        {lang === 'zh' ? '删除' : 'Delete'}
                      </button>
                    </div>
                    <p className="whitespace-pre-wrap text-sm">{note.content}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Recommendations Tab */}
      {activeTab === 'recommendations' && (
        <div className="animate-fade-in">
          {book.status !== 'finished' ? (
            <div className="card text-center py-16">
              <AppIcon name="lock" tone="muted" size={56} className="mx-auto mb-4" />
              <h3 className="text-xl font-bold mb-2">
                {lang === 'zh' ? '相关推荐已锁定' : 'Recommendations Locked'}
              </h3>
              <p className="text-[var(--text-secondary)] mb-4">
                {lang === 'zh' 
                  ? '完成阅读后，系统将为你推荐相关书籍，帮助你继续深入探索' 
                  : 'Complete reading to unlock book recommendations'}
              </p>
              <div className="inline-block px-4 py-2 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                <p className="flex items-center gap-2 text-amber-700 dark:text-amber-400 text-sm">
                  <AppIcon name="alert" size={17} />{lang === 'zh'
                    ? '需要完成六阶段学习，并通过教学模拟（60分+）和角色问答（全部60分+）才能解锁'
                    : 'Complete all six phases, pass teaching practice (60+), and pass all Q&A (60+) to unlock'}
                </p>
              </div>
            </div>
          ) : (
            <BookRecommendations 
              book={book} 
              apiKey={apiKey} 
              lang={lang}
              quotes={quotes}
              recommendations={recommendations}
              onRecommendationsChange={async (newRecs) => {
                updateBook(book.id, { recommendations: newRecs })
                try {
                  await flushPendingStoreWrites()
                } catch (error) {
                  const persistedBook = await reloadBookFromPersistence(book.id).catch(() => undefined)
                  if (persistedBook) {
                    setBook(persistedBook)
                    setRecommendations(persistedBook.recommendations || '')
                  }
                  throw error
                }
                const persistedBook = getBook(book.id)
                if (persistedBook) setBook(persistedBook)
                setRecommendations(newRecs)
              }}
              loadingRecommendations={loadingRecommendations}
              onLoadingChange={setLoadingRecommendations}
              onOpenSettings={onOpenSettings}
              needsAiConfiguration={needsAiConfiguration}
              onQuoteSelected={handleQuoteSelected}
            />
          )}
        </div>
      )}

      {showBookOrganizer && (
        <div className="modal-overlay" onClick={() => setShowBookOrganizer(false)}>
          <div className="modal-content product-dialog product-dialog-wide max-h-[calc(100dvh-32px)]" onClick={event => event.stopPropagation()}>
            <div className="product-dialog-header product-dialog-header-compact">
              <div className="product-dialog-title">
                <span className="product-dialog-title-icon"><AppIcon name="library" size={18} /></span>
                <div>
                  <h2>{lang === 'zh' ? '书籍整理' : 'Organize book'}</h2>
                  <p>{lang === 'zh' ? '管理书单归属与书籍关系' : 'Manage list membership and book relationships'}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowBookOrganizer(false)}
                className="icon-button"
                aria-label={lang === 'zh' ? '关闭书籍整理' : 'Close book organizer'}
                title={lang === 'zh' ? '关闭' : 'Close'}
              >
                <AppIcon name="close" size={20} />
              </button>
            </div>
            <div className="product-dialog-body">
            <BookListManager lang={lang} book={book} />
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
