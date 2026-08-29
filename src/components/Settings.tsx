'use client'

import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import QRCode from 'qrcode'
import {
  ArrowUpRight,
  AlertTriangle,
  Check,
  CircleCheck,
  CircleX,
  Database,
  Download,
  Eye,
  EyeOff,
  FileText,
  Gauge,
  HardDrive,
  Languages,
  Mail,
  MessageCircle,
  Moon,
  Pencil,
  Quote,
  Sun,
  Trash2,
  Upload,
  X,
  Wallet,
  RefreshCw,
  ExternalLink,
  Megaphone,
  Sparkles
} from 'lucide-react'
import {
  AppSettings,
  CustomQuote,
  getBooks,
  getSettings,
  getAIUsageRecords,
  getAIUsageSummary,
  saveBooks,
  saveSetting,
  saveSettings,
  downloadDataBackup,
  previewImportBackupFiles,
  applyImportData,
  getDataStats,
  ExportData,
  resetStoreCache,
  flushPendingStoreWrites,
  initializeStore,
  reloadBooksFromPersistence,
  reloadSettingsFromPersistence,
  replaceAIUsageRecords,
  subscribeToAIUsage
} from '@/lib/store'
import { logger } from '@/lib/logger'
import { Language, t } from '@/lib/i18n'
import { privacyPolicyContent } from '@/lib/privacyPolicy'
import { defaultQuotesZh, defaultQuotesEn, localizePresetQuotes } from './LoadingQuotes'
import MarkdownRenderer from './MarkdownRenderer'
import { LAST_BACKUP_AT_KEY } from '@/lib/backupReminder'
import { validateApiKey } from '@/lib/validation'
import { DEEPSEEK_API_KEY_INVALID, validateDeepSeekApiKey } from '@/lib/deepseek'
import { AI_REQUEST_CANCELLED, AI_TASK_BUSY } from '@/lib/aiRequestManager'
import { showAppConfirm } from '@/lib/appDialog'
import { createTokendanceAuthorizationUrl, exchangeTokendanceCode, fetchTokendanceBalance, createTokendancePaymentSession, getTokendancePaymentSession, type TokendanceBalance, type TokendancePaymentSession } from '@/lib/tokendance'
import { deepSeekSunsetMessage, isTokenDanceOnly } from '@/lib/aiProviderPolicy'
import { DEEPSEEK_OFFICIAL_CHANNEL_SUNSET } from '@/lib/deepseek'
import { isAIConfigurationComplete } from '@/lib/startupPrompt'
import { clearAssistantMemories, deleteAssistantMemory, getAssistantMemories, type AssistantMemory } from '@/lib/assistantMemory'

// P0 新增：IndexedDB 支持
import {
  getDatabaseStats,
  migrateFromLocalStorage
} from '@/lib/db'

interface Props {
  onSettingsChange: (settings: AppSettings) => void
  openDataManagement?: boolean
  focusApiConfigurationRequest?: number
  onBackupCompleted?: () => void
  onOpenMigrationNotice?: () => void
}

export default function Settings({
  onSettingsChange,
  openDataManagement = false,
  focusApiConfigurationRequest = 0,
  onBackupCompleted,
  onOpenMigrationNotice
}: Props) {
  const [settings, setSettings] = useState<AppSettings>({
    apiKey: '',
    aiProvider: 'tokendance',
    language: 'zh',
    theme: 'light',
    hideApiKeyAlert: false,
    quotes: [],
    quotesInitialized: false
  })
  const [showKey, setShowKey] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [updatingAiPrivacy, setUpdatingAiPrivacy] = useState(false)
  const [savingQuickSetting, setSavingQuickSetting] = useState(false)
  const [quickSettingError, setQuickSettingError] = useState<string | null>(null)
  const [settingsLoaded, setSettingsLoaded] = useState(false)
  const [apiKeyConsentError, setApiKeyConsentError] = useState<string | null>(null)
  const [apiActionStatus, setApiActionStatus] = useState<string | null>(null)
  const [tokendanceBalance, setTokendanceBalance] = useState<TokendanceBalance | null>(null)
  const [loadingTokendanceBalance, setLoadingTokendanceBalance] = useState(false)
  const [tokendancePayment, setTokendancePayment] = useState<TokendancePaymentSession | null>(null)
  const [tokendancePaymentQr, setTokendancePaymentQr] = useState<string | null>(null)
  const [creatingTokendancePayment, setCreatingTokendancePayment] = useState(false)
  const [tokendanceAmount, setTokendanceAmount] = useState('10')
  const [tokendanceOAuthLoading, setTokendanceOAuthLoading] = useState(false)
  const [confirmingApiKeyDeletion, setConfirmingApiKeyDeletion] = useState(false)
  const [showAiConfiguration, setShowAiConfiguration] = useState(true)
  const [showConsentPolicy, setShowConsentPolicy] = useState(false)
  const [hasReadConsentPolicy, setHasReadConsentPolicy] = useState(false)
  const [newQuoteText, setNewQuoteText] = useState('')
  const [newQuoteAuthor, setNewQuoteAuthor] = useState('')
  const [showQuoteManager, setShowQuoteManager] = useState(false)
  const [quoteStatus, setQuoteStatus] = useState<string | null>(null)
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [editText, setEditText] = useState('')
  const [editAuthor, setEditAuthor] = useState('')

  // 数据导出/导入相关状态
  const [showDataManagement, setShowDataManagement] = useState(false)
  const [showAssistantMemoryManager, setShowAssistantMemoryManager] = useState(false)
  const [assistantMemories, setAssistantMemories] = useState<AssistantMemory[]>([])
  const [loadingAssistantMemories, setLoadingAssistantMemories] = useState(false)
  const [lastBackupAt, setLastBackupAt] = useState<number | null>(null)
  const [exporting, setExporting] = useState(false)
  const [pendingBackupDownload, setPendingBackupDownload] = useState<{
    fileCount: number
    format: 'json' | 'multipart'
  } | null>(null)
  const [showImportModal, setShowImportModal] = useState(false)
  const [importFiles, setImportFiles] = useState<File[]>([])
  const [importPreview, setImportPreview] = useState<ExportData | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [importOptions, setImportOptions] = useState({
    importSettings: true,
    importBooks: true,
    mergeBooks: true
  })
  const [importing, setImporting] = useState(false)
  const [readingImport, setReadingImport] = useState(false)
  const [dataStats, setDataStats] = useState({
    totalBooks: 0,
    totalNotes: 0,
    totalPractices: 0,
    totalQARecords: 0,
    dataSize: '0 B'
  })
  const [dataStatsError, setDataStatsError] = useState(false)
  const [aiUsageSummary, setAIUsageSummary] = useState(() => getAIUsageSummary())
  const [dataOperationStatus, setDataOperationStatus] = useState<{
    message: string
    type: 'success' | 'error' | 'info'
  } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const apiKeyInputRef = useRef<HTMLInputElement>(null)
  const aiConsentRef = useRef<HTMLInputElement>(null)
  const consentPolicyScrollRef = useRef<HTMLDivElement>(null)

  // P0 新增：IndexedDB 相关状态
  const [dbInfo, setDbInfo] = useState<{
    usingIndexedDB: boolean
    needsMigration: boolean
    booksCount: number
    dbSize: string
    dataVersion: number
  }>({
    usingIndexedDB: false,
    needsMigration: false,
    booksCount: 0,
    dbSize: '0 B',
    dataVersion: 1
  })
  const [migrating, setMigrating] = useState(false)
  const [clearingData, setClearingData] = useState(false)
  const settingsSaveInFlightRef = useRef(false)
  const dataOperationInFlightRef = useRef(false)
  const importReadTokenRef = useRef(0)
  const handledApiConfigurationRequestRef = useRef(0)

  useEffect(() => {
    let cancelled = false
    let loaded = getSettings()

    if (!loaded.quotesInitialized || loaded.quotes.length === 0) {
      const defaultQuotes = loaded.language === 'zh' ? defaultQuotesZh : defaultQuotesEn
      loaded = { ...loaded, quotes: [...defaultQuotes], quotesInitialized: true }
      saveSettings(loaded)
      void flushPendingStoreWrites().catch(async error => {
        logger.error('Failed to initialize default quotes:', error)
        const restored = await reloadSettingsFromPersistence().catch(() => null)
        if (!cancelled && restored) setSettings(restored)
      })
    } else {
      const localizedQuotes = localizePresetQuotes(loaded.quotes, loaded.language)
      if (localizedQuotes !== loaded.quotes) {
        loaded = { ...loaded, quotes: localizedQuotes }
        saveSettings(loaded)
        void flushPendingStoreWrites().catch(async error => {
          logger.error('Failed to localize default quotes:', error)
          const restored = await reloadSettingsFromPersistence().catch(() => null)
          if (!cancelled && restored) setSettings(restored)
        })
      }
    }

    setSettings(loaded)
    setShowAiConfiguration(!isAIConfigurationComplete(loaded))
    setSettingsLoaded(true)

    // 获取数据统计
    if (typeof window !== 'undefined') {
      try {
        setDataStats(getDataStats())
        setDataStatsError(false)
      } catch (e) {
        logger.error('Failed to get data stats:', e)
        setDataStatsError(true)
      }

      // P0 新增：获取 IndexedDB 信息
      loadDbInfo()
      const savedBackupAt = Number(localStorage.getItem(LAST_BACKUP_AT_KEY))
      setLastBackupAt(Number.isFinite(savedBackupAt) && savedBackupAt > 0 ? savedBackupAt : null)
    }
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined' || !settingsLoaded) return
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    if (!code || params.get('tokendance_callback') !== '1') return
    setShowAiConfiguration(true)
    setTokendanceOAuthLoading(true)
    void exchangeTokendanceCode(code, params.get('state'))
      .then(async key => {
        const next = { ...getSettings(), ...settings, apiKey: key, aiProvider: 'tokendance' as const }
        setSettings(next)
        setSaved(false)
        setApiKeyConsentError(null)
        setApiActionStatus(lang === 'zh' ? 'TokenDance 授权成功。请确认数据传输同意，然后点击“保存设置”。' : 'TokenDance authorization succeeded. Confirm data consent, then click Save Settings.')
        window.history.replaceState({}, '', window.location.pathname)
      })
      .catch(error => setApiKeyConsentError(error instanceof Error ? error.message : 'TokenDance OAuth failed.'))
      .finally(() => setTokendanceOAuthLoading(false))
  }, [settingsLoaded])

  useEffect(() => subscribeToAIUsage(() => {
    setAIUsageSummary(getAIUsageSummary())
    try {
      setDataStats(getDataStats())
    } catch (error) {
      logger.warn('Failed to refresh data size after AI usage update:', error)
    }
  }), [])

  useEffect(() => {
    let cancelled = false
    setTokendancePaymentQr(null)
    if (!tokendancePayment?.payment_url) return

    void QRCode.toDataURL(tokendancePayment.payment_url, {
      width: 220,
      margin: 2,
      errorCorrectionLevel: 'M'
    }).then(dataUrl => {
      if (!cancelled) setTokendancePaymentQr(dataUrl)
    }).catch(error => {
      logger.warn('Unable to render TokenDance payment QR code.', error)
    })

    return () => {
      cancelled = true
    }
  }, [tokendancePayment?.payment_url])

  useEffect(() => {
    if (openDataManagement) {
      setShowDataManagement(true)
    }
  }, [openDataManagement])

  useEffect(() => {
    if (
      !settingsLoaded ||
      focusApiConfigurationRequest <= 0 ||
      handledApiConfigurationRequestRef.current === focusApiConfigurationRequest
    ) return
    handledApiConfigurationRequestRef.current = focusApiConfigurationRequest
    setShowAiConfiguration(true)

    const apiKeyMissing = settings.apiKey.trim().length === 0
    const configuredProvider = isTokenDanceOnly() ? 'tokendance' : (settings.aiProvider ?? 'deepseek')
    const apiKeyValidation = validateApiKey(settings.apiKey)
    const missingConsent = settings.apiKey.trim().length > 0 && !settings.aiDataConsent
    const configurationError = apiKeyMissing
      ? (settings.language === 'zh' ? `请先填写 ${configuredProvider === 'tokendance' ? 'TokenDance' : 'DeepSeek'} API Key，并在勾选同意后保存。` : `Add your ${configuredProvider === 'tokendance' ? 'TokenDance' : 'DeepSeek'} API key, confirm consent, and save it first.`)
      : !apiKeyValidation.valid
        ? (settings.language === 'zh' ? 'API Key 格式不正确，请检查后重新保存。' : 'The API key format is invalid. Check it and save again.')
      : missingConsent
        ? (settings.language === 'zh' ? '使用 AI 功能前，请先确认 AI 数据传输同意。' : 'Confirm AI data transfer consent before using AI features.')
        : null

    setApiKeyConsentError(configurationError)
    if (!configurationError) return

    requestAnimationFrame(() => {
      const target = missingConsent ? aiConsentRef.current : apiKeyInputRef.current
      target?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      target?.focus()
    })
  }, [focusApiConfigurationRequest, settings.aiDataConsent, settings.apiKey, settings.language, settingsLoaded])

  // P0 新增：加载 IndexedDB 信息
  async function loadDbInfo() {
    try {
      const hasLocalStorageData = !!(localStorage.getItem('feynman-settings') || localStorage.getItem('feynman-books'))
      const migrationFlag = localStorage.getItem('feynman-indexedb-migrated')
      const usingIndexedDB = migrationFlag === 'true' || !hasLocalStorageData

      if (usingIndexedDB) {
        const stats = await getDatabaseStats()
        setDbInfo({
          usingIndexedDB: true,
          needsMigration: false,
          booksCount: stats.booksCount,
          dbSize: stats.dbSize.formatted,
          dataVersion: stats.dataVersion
        })
      } else {
        setDbInfo({
          usingIndexedDB: false,
          needsMigration: hasLocalStorageData,
          booksCount: dataStats.totalBooks,
          dbSize: dataStats.dataSize,
          dataVersion: 1
        })
      }
    } catch (e) {
      logger.error('Failed to load DB info:', e)
    }
  }

  // P0 新增：执行迁移
  async function handleMigration() {
    if (dataOperationInFlightRef.current) return
    dataOperationInFlightRef.current = true
    setMigrating(true)
    setDataOperationStatus(null)
    try {
      const result = await migrateFromLocalStorage()
      if (result.success) {
        localStorage.setItem('feynman-indexedb-just-migrated', 'true')
        resetStoreCache()
        await initializeStore()
        const migratedSettings = getSettings()
        setSettings(migratedSettings)
        onSettingsChange(migratedSettings)
        setDataStats(getDataStats())
        await loadDbInfo()
        setDataOperationStatus({
          message: lang === 'zh'
            ? `迁移成功，已迁移 ${result.migratedBooks} 本书。`
            : `Migration completed. ${result.migratedBooks} books migrated.`,
          type: 'success'
        })
      } else {
        setDataOperationStatus({
          message: lang === 'zh'
            ? '迁移部分失败：' + result.errors.join(', ')
            : 'Migration partially failed: ' + result.errors.join(', '),
          type: 'error'
        })
      }
    } catch (e) {
      setDataOperationStatus({
        message: lang === 'zh' ? '迁移失败：' + (e as Error).message : 'Migration failed: ' + (e as Error).message,
        type: 'error'
      })
    } finally {
      dataOperationInFlightRef.current = false
      setMigrating(false)
    }
  }

  const handleSave = async () => {
    if (settingsSaveInFlightRef.current) return
    setApiActionStatus(null)
    const trimmedApiKey = settings.apiKey.trim()
    if (!trimmedApiKey) {
      const message = settings.language === 'zh'
        ? `保存失败：请先填写 ${activeProvider === 'tokendance' ? 'TokenDance' : 'DeepSeek'} API Key。`
        : `Save failed: enter your ${activeProvider === 'tokendance' ? 'TokenDance' : 'DeepSeek'} API key first.`
      setApiKeyConsentError(message)
      setSaved(false)
      requestAnimationFrame(() => {
        apiKeyInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        apiKeyInputRef.current?.focus()
      })
      return
    }

    const apiKeyValidation = validateApiKey(trimmedApiKey)
    if (!apiKeyValidation.valid) {
      const message = settings.language === 'zh'
        ? 'API Key 格式不正确，请检查是否复制完整。'
        : 'The API key format is invalid. Check that it was copied completely.'
      setApiKeyConsentError(message)
      setSaved(false)
      requestAnimationFrame(() => {
        apiKeyInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        apiKeyInputRef.current?.focus()
      })
      return
    }
    if (!settings.aiDataConsent) {
      const message = settings.language === 'zh'
        ? '保存 API Key 前，请先确认 AI 数据传输同意。'
        : 'Confirm AI data transfer consent before saving an API key.'
      setApiKeyConsentError(message)
      setSaved(false)
      requestAnimationFrame(() => {
        aiConsentRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        aiConsentRef.current?.focus()
      })
      return
    }

    settingsSaveInFlightRef.current = true
    setSaving(true)
    const settingsToSave = { ...settings, apiKey: trimmedApiKey }
    try {
      await validateDeepSeekApiKey(trimmedApiKey, undefined, activeProvider)
    } catch (error) {
      const invalidKey = error instanceof Error && error.message === DEEPSEEK_API_KEY_INVALID
      const sunset = error instanceof Error && error.message === DEEPSEEK_OFFICIAL_CHANNEL_SUNSET
      const cancelled = error instanceof Error && error.message === AI_REQUEST_CANCELLED
      const busy = error instanceof Error && error.message === AI_TASK_BUSY
      const message = settings.language === 'zh'
        ? (cancelled
            ? '已取消 API Key 验证，设置未保存。'
            : busy
            ? '已有 AI 任务正在运行，请等待完成或先取消当前任务。'
            : sunset
            ? deepSeekSunsetMessage('zh')
            : invalidKey
            ? 'API Key 无效，请检查是否复制正确或已被停用。'
            : '暂时无法验证 API Key，请检查网络后重试。')
        : (cancelled
            ? 'API key validation was cancelled. Settings were not saved.'
            : busy
            ? 'Another AI task is running. Wait for it to finish or cancel it first.'
            : sunset
            ? deepSeekSunsetMessage('en')
            : invalidKey
            ? 'The API key is invalid. Check that it was copied correctly and is still active.'
            : 'The API key could not be verified. Check your network and try again.')
      logger.warn(sunset ? 'Official DeepSeek channel has ended.' : invalidKey ? 'AI provider rejected the API key.' : 'AI provider API key verification failed.')
      setApiKeyConsentError(message)
      setSaved(false)
      requestAnimationFrame(() => {
        apiKeyInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        apiKeyInputRef.current?.focus()
      })
      settingsSaveInFlightRef.current = false
      setSaving(false)
      return
    }

    try {
      await flushPendingStoreWrites()
      saveSettings(settingsToSave)
      await flushPendingStoreWrites()
      setSettings(settingsToSave)
      onSettingsChange(settingsToSave)
      setApiKeyConsentError(null)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (error) {
      logger.error('Settings save failed:', error)
      const restored = await reloadSettingsFromPersistence().catch(() => getSettings())
      setSettings(restored)
      onSettingsChange(restored)
      setSaved(false)
      setApiKeyConsentError(
        restored.language === 'zh'
          ? '保存失败，设置已恢复到上次保存状态。'
          : 'Save failed. Settings were restored to the last saved state.'
      )
    } finally {
      settingsSaveInFlightRef.current = false
      setSaving(false)
    }
  }

  const handleTokendanceAuthorize = async () => {
    try {
      setTokendanceOAuthLoading(true)
      window.location.href = await createTokendanceAuthorizationUrl()
    } catch (error) {
      setTokendanceOAuthLoading(false)
      setApiKeyConsentError(error instanceof Error ? error.message : 'TokenDance OAuth failed.')
    }
  }

  const handleTokendanceBalance = async () => {
    if (!settings.apiKey) return
    setLoadingTokendanceBalance(true)
    try {
      setTokendanceBalance(await fetchTokendanceBalance(settings.apiKey))
    } catch (error) {
      setApiKeyConsentError(error instanceof Error ? error.message : 'Unable to load TokenDance balance.')
    } finally {
      setLoadingTokendanceBalance(false)
    }
  }

  const handleTokendanceTopUp = async () => {
    const amount = Number.parseInt(tokendanceAmount, 10)
    if (!settings.apiKey || !Number.isInteger(amount) || amount < 1 || amount > 100000) {
      setApiKeyConsentError(lang === 'zh' ? '充值金额须为 1 至 100000 元的整数。' : 'Top-up amount must be an integer from 1 to 100000.')
      return
    }
    try {
      setCreatingTokendancePayment(true)
      setApiKeyConsentError(null)
      const session = await createTokendancePaymentSession(settings.apiKey, amount)
      setTokendancePayment(session)
      const startedAt = Date.now()
      const poll = async () => {
        if (!session || Date.now() - startedAt > 10 * 60 * 1000) return
        try {
          const current = await getTokendancePaymentSession(settings.apiKey, session.status_url)
          setTokendancePayment(current)
          if (current.status === 'paid') await handleTokendanceBalance()
          else if (current.status === 'pending') window.setTimeout(poll, 3000)
        } catch (error) {
          setApiKeyConsentError(error instanceof Error ? error.message : 'Unable to check payment status.')
        }
      }
      window.setTimeout(poll, 3000)
    } catch (error) {
      setApiKeyConsentError(error instanceof Error ? error.message : 'Unable to create payment session.')
    } finally {
      setCreatingTokendancePayment(false)
    }
  }

  const updateSetting = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    const newSettings = { ...settings, [key]: value }
    setSettings(newSettings)
    if (key === 'apiKey' || key === 'aiDataConsent') {
      setApiKeyConsentError(null)
      setApiActionStatus(null)
      setSaved(false)
    }
    if (key === 'theme') {
      document.documentElement.setAttribute('data-theme', value as string)
    }
  }

  const persistQuickSetting = async <K extends 'language' | 'theme'>(key: K, value: AppSettings[K]) => {
    if (settingsSaveInFlightRef.current) return

    settingsSaveInFlightRef.current = true
    setSavingQuickSetting(true)
    setQuickSettingError(null)
    setSettings(current => ({ ...current, [key]: value }))
    if (key === 'theme') document.documentElement.setAttribute('data-theme', value as string)

    try {
      await flushPendingStoreWrites()
      const persistedSettings = saveSetting(key, value)
      await flushPendingStoreWrites()
      onSettingsChange(persistedSettings)
    } catch (error) {
      logger.error(`Failed to persist ${key}:`, error)
      const restored = await reloadSettingsFromPersistence().catch(() => getSettings())
      setSettings(current => ({ ...current, [key]: restored[key] }))
      onSettingsChange(restored)
      if (key === 'theme') document.documentElement.setAttribute('data-theme', restored.theme)
      setQuickSettingError(
        settings.language === 'zh'
          ? '切换保存失败，已恢复原设置。'
          : 'The change could not be saved and was reverted.'
      )
    } finally {
      settingsSaveInFlightRef.current = false
      setSavingQuickSetting(false)
    }
  }

  const handleLanguageChange = async (newLang: Language) => {
    if (settingsSaveInFlightRef.current) return

    settingsSaveInFlightRef.current = true
    setSavingQuickSetting(true)
    setQuickSettingError(null)
    const localizedDraftQuotes = localizePresetQuotes(settings.quotes, newLang)
    setSettings(current => ({ ...current, language: newLang, quotes: localizedDraftQuotes }))

    try {
      await flushPendingStoreWrites()
      const persisted = getSettings()
      const persistedSettings = {
        ...persisted,
        language: newLang,
        quotes: localizePresetQuotes(persisted.quotes, newLang)
      }
      saveSettings(persistedSettings)
      await flushPendingStoreWrites()
      onSettingsChange(persistedSettings)
    } catch (error) {
      logger.error('Failed to persist language:', error)
      const restored = await reloadSettingsFromPersistence().catch(() => getSettings())
      setSettings(current => ({ ...current, language: restored.language, quotes: restored.quotes }))
      onSettingsChange(restored)
      setQuickSettingError(
        settings.language === 'zh'
          ? '语言切换保存失败，已恢复原设置。'
          : 'The language change could not be saved and was reverted.'
      )
    } finally {
      settingsSaveInFlightRef.current = false
      setSavingQuickSetting(false)
    }
  }

  const persistAiPrivacySettings = async (
    updates: Partial<Pick<AppSettings, 'apiKey' | 'aiDataConsent' | 'hideApiKeyAlert'>>,
    successMessage: string
  ): Promise<boolean> => {
    if (settingsSaveInFlightRef.current) return false

    settingsSaveInFlightRef.current = true
    setUpdatingAiPrivacy(true)
    setSaved(false)
    setApiActionStatus(null)
    setApiKeyConsentError(null)

    try {
      await flushPendingStoreWrites()
      const persistedSettings = { ...getSettings(), ...updates }
      saveSettings(persistedSettings)
      await flushPendingStoreWrites()
      setSettings(current => ({ ...current, ...updates }))
      onSettingsChange(persistedSettings)
      setApiActionStatus(successMessage)
      return true
    } catch (error) {
      logger.error('Failed to update AI privacy settings:', error)
      const restored = await reloadSettingsFromPersistence().catch(() => getSettings())
      setSettings(current => ({
        ...current,
        apiKey: restored.apiKey,
        aiDataConsent: restored.aiDataConsent,
        hideApiKeyAlert: restored.hideApiKeyAlert
      }))
      onSettingsChange(restored)
      setApiKeyConsentError(
        settings.language === 'zh'
          ? '操作保存失败，已恢复到上次保存状态。'
          : 'The change could not be saved and was reverted.'
      )
      return false
    } finally {
      settingsSaveInFlightRef.current = false
      setUpdatingAiPrivacy(false)
    }
  }

  const loadAssistantMemoryManager = async () => {
    setLoadingAssistantMemories(true)
    try {
      setAssistantMemories(await getAssistantMemories())
    } finally {
      setLoadingAssistantMemories(false)
    }
  }

  const toggleAssistantMemory = async (enabled: boolean) => {
    const persisted = { ...getSettings(), assistantMemoryEnabled: enabled }
    saveSettings(persisted)
    await flushPendingStoreWrites()
    setSettings(current => ({ ...current, assistantMemoryEnabled: enabled }))
    onSettingsChange(persisted)
  }

  const exportAssistantMemories = () => {
    const payload = JSON.stringify({ version: 1, exportedAt: Date.now(), memories: assistantMemories }, null, 2)
    const url = URL.createObjectURL(new Blob([payload], { type: 'application/json' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `feynman-assistant-memory-${new Date().toISOString().slice(0, 10)}.json`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const addQuote = () => {
    if (!newQuoteText.trim()) return
    const newQuote: CustomQuote = {
      text: newQuoteText.trim(),
      author: newQuoteAuthor.trim() || (settings.language === 'zh' ? '自定义' : 'Custom'),
      isPreset: false
    }
    updateSetting('quotes', [newQuote, ...settings.quotes])
    setNewQuoteText('')
    setNewQuoteAuthor('')
    setQuoteStatus(settings.language === 'zh'
      ? '金句已添加到顶部，请点击“保存设置”完成保存。'
      : 'Quote added to the top. Click “Save Settings” to finish saving.')
  }

  const removeQuote = (index: number) => {
    setQuoteStatus(null)
    const updated = settings.quotes.filter((_, i) => i !== index)
    updateSetting('quotes', updated)
  }

  const startEdit = (index: number) => {
    const quote = settings.quotes[index]
    setEditingIndex(index)
    setEditText(quote.text)
    setEditAuthor(quote.author)
  }

  const saveEdit = () => {
    if (editingIndex === null || !editText.trim()) return
    setQuoteStatus(null)
    const updated = [...settings.quotes]
    updated[editingIndex] = {
      ...updated[editingIndex],
      text: editText.trim(),
      author: editAuthor.trim() || (settings.language === 'zh' ? '未知' : 'Unknown')
    }
    updateSetting('quotes', updated)
    setEditingIndex(null)
    setEditText('')
    setEditAuthor('')
  }

  const cancelEdit = () => {
    setEditingIndex(null)
    setEditText('')
    setEditAuthor('')
  }

  const resetToDefault = () => {
    const defaultQuotes = settings.language === 'zh' ? defaultQuotesZh : defaultQuotesEn
    updateSetting('quotes', [...defaultQuotes])
    setQuoteStatus(settings.language === 'zh'
      ? '已恢复默认金句，关闭弹窗后请点击“保存设置”。'
      : 'Default quotes restored. Close this dialog and select “Save Settings”.')
  }

  const recordBackupCompleted = () => {
    const backupAt = Date.now()
    try {
      localStorage.setItem(LAST_BACKUP_AT_KEY, String(backupAt))
      setLastBackupAt(backupAt)
      setPendingBackupDownload(null)
      onBackupCompleted?.()
      setDataOperationStatus({
        message: settings.language === 'zh' ? '备份已成功保存，备份时间已更新。' : 'Backup saved successfully. The backup time was updated.',
        type: 'success'
      })
    } catch (metadataError) {
      logger.error('Failed to record backup timestamp:', metadataError)
      setDataOperationStatus({
        message: settings.language === 'zh'
          ? '文件已保存，但浏览器未能记录本次备份时间。'
          : 'The file was saved, but the browser could not record the backup time.',
        type: 'error'
      })
    }
  }

  // 数据导出
  const handleExport = async () => {
    if (dataOperationInFlightRef.current) return
    dataOperationInFlightRef.current = true
    setExporting(true)
    setPendingBackupDownload(null)
    setDataOperationStatus(null)
    try {
      const result = await downloadDataBackup()
      if (result.status === 'saved') {
        recordBackupCompleted()
      } else {
        setPendingBackupDownload({ fileCount: result.fileCount, format: result.format })
      }
      try {
        setDataStats(getDataStats())
      } catch (statsError) {
        logger.error('Failed to refresh data stats after export:', statsError)
        setDataStatsError(true)
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        setDataOperationStatus({
          message: settings.language === 'zh' ? '已取消导出，备份时间未更新。' : 'Export cancelled. The backup time was not updated.',
          type: 'info'
        })
        return
      }
      logger.error('Export error:', e)
      setDataOperationStatus({
        message: settings.language === 'zh' ? '导出失败，备份时间未更新，请重试。' : 'Export failed. The backup time was not updated. Try again.',
        type: 'error'
      })
    } finally {
      dataOperationInFlightRef.current = false
      setExporting(false)
    }
  }

  // 数据导入 - 选择文件
  const handleImportFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return
    const readToken = ++importReadTokenRef.current

    setImportFiles(files)
    setImportError(null)
    setImportPreview(null)
    setReadingImport(true)

    const result = await previewImportBackupFiles(files)
    if (readToken !== importReadTokenRef.current) return

    if (result.valid && result.data) {
      setImportPreview(result.data)
    } else {
      setImportError(result.error || (settings.language === 'zh' ? '文件格式错误' : 'Invalid backup format'))
    }
    setReadingImport(false)
  }

  // 数据导入 - 确认导入
  const handleConfirmImport = async () => {
    if (dataOperationInFlightRef.current) return
    if (!importPreview) return
    if (!importOptions.importSettings && !importOptions.importBooks) {
      setImportError(settings.language === 'zh' ? '请至少选择一项要导入的内容' : 'Select at least one item to import')
      return
    }

    dataOperationInFlightRef.current = true
    const previousSettings = getSettings()
    const previousBooks = getBooks()
    const previousAIUsageRecords = getAIUsageRecords()
    setImporting(true)
    try {
      await flushPendingStoreWrites()
      applyImportData(importPreview, importOptions)
      await flushPendingStoreWrites()

      // 重新加载设置
      const reloaded = getSettings()
      setSettings(reloaded)
      onSettingsChange(reloaded)

      // 更新数据统计
      setDataStats(getDataStats())

      // 关闭模态框
      setShowImportModal(false)
      setImportPreview(null)
      setImportFiles([])
      setImportError(null)
      setDataOperationStatus({
        message: reloaded.language === 'zh' ? '数据导入成功。' : 'Data imported successfully.',
        type: 'success'
      })
    } catch (e) {
      logger.error('Import error:', e)
      let rollbackSucceeded = false
      try {
        saveSettings(previousSettings)
        saveBooks(previousBooks)
        replaceAIUsageRecords(previousAIUsageRecords)
        await flushPendingStoreWrites()
        rollbackSucceeded = true
      } catch (rollbackError) {
        logger.error('Import rollback failed:', rollbackError)
      }
      const [restoredSettings] = await Promise.all([
        reloadSettingsFromPersistence().catch(() => previousSettings),
        reloadBooksFromPersistence().catch(() => previousBooks)
      ])
      setSettings(restoredSettings)
      onSettingsChange(restoredSettings)
      try {
        setDataStats(getDataStats())
        setDataStatsError(false)
      } catch (statsError) {
        logger.error('Failed to refresh data stats after import rollback:', statsError)
        setDataStatsError(true)
      }
      setImportError(rollbackSucceeded
        ? (settings.language === 'zh' ? '导入失败，已恢复导入前的数据。' : 'Import failed. The previous data was restored.')
        : (settings.language === 'zh' ? '导入失败且自动恢复未完成，请刷新页面并检查现有数据。' : 'Import failed and automatic recovery did not finish. Refresh and check the current data.'))
    } finally {
      dataOperationInFlightRef.current = false
      setImporting(false)
    }
  }

  // 清除所有数据
  const handleClearData = async () => {
    if (dataOperationInFlightRef.current) return
    dataOperationInFlightRef.current = true
    const confirmed = await showAppConfirm({
      title: settings.language === 'zh' ? '确认清空全部数据' : 'Confirm data deletion',
      message: settings.language === 'zh'
        ? '此操作不可撤销，平台也无法恢复。强烈建议先取消并导出备份。'
        : 'This cannot be undone or recovered by the platform. We strongly recommend cancelling and exporting a backup first.',
      confirmText: settings.language === 'zh' ? '确认清空' : 'Clear data',
      cancelText: settings.language === 'zh' ? '取消' : 'Cancel',
      tone: 'danger'
    })
    if (!confirmed) {
      dataOperationInFlightRef.current = false
      return
    }

    setClearingData(true)
    setDataOperationStatus(null)
    try {
      try {
        await flushPendingStoreWrites()
        try {
          const { deleteDatabase } = await import('@/lib/indexedDB')
          await deleteDatabase()
          resetStoreCache()
          localStorage.clear()
          sessionStorage.clear()
          setDataOperationStatus({
            message: settings.language === 'zh' ? '数据已清除，页面即将刷新。' : 'Data cleared. The page will refresh shortly.',
            type: 'success'
          })
          setTimeout(() => window.location.reload(), 800)
        } catch (error) {
          logger.error('Failed to clear application data:', error)
          setDataOperationStatus({
            message: settings.language === 'zh' ? '清除数据失败，请关闭其他页面后重试。' : 'Failed to clear data. Close other tabs and try again.',
            type: 'error'
          })
        }
      } catch (pendingWriteError) {
        logger.error('Pending writes failed before clearing data:', pendingWriteError)
        setDataOperationStatus({
          message: settings.language === 'zh'
            ? '检测到尚未成功保存的数据，已取消清除，请刷新后重试。'
            : 'Some data has not been saved successfully. Clearing was cancelled; refresh and try again.',
          type: 'error'
        })
      }
    } finally {
      dataOperationInFlightRef.current = false
      setClearingData(false)
    }
  }

  const closeDataManagement = () => {
    if (dataOperationInFlightRef.current) return
    setShowDataManagement(false)
    setPendingBackupDownload(null)
    setDataOperationStatus(null)
  }

  const closeImportModal = () => {
    if (dataOperationInFlightRef.current) return
    importReadTokenRef.current += 1
    setShowImportModal(false)
    setImportPreview(null)
    setImportError(null)
    setImportFiles([])
    setReadingImport(false)
  }

  const openConsentPolicy = () => {
    setApiKeyConsentError(null)
    setApiActionStatus(null)
    setHasReadConsentPolicy(false)
    setShowConsentPolicy(true)
    requestAnimationFrame(() => {
      const container = consentPolicyScrollRef.current
      if (!container) return

      container.scrollTop = 0
      setHasReadConsentPolicy(container.scrollHeight <= container.clientHeight)
    })
  }

  const handleConsentChange = (checked: boolean) => {
    if (!checked) {
      void persistAiPrivacySettings(
        { aiDataConsent: false },
        settings.language === 'zh'
          ? 'AI 数据传输同意已撤回，后续 AI 功能已停用。'
          : 'AI data transfer consent was withdrawn. AI features are now disabled.'
      )
      return
    }

    if (!settings.aiDataConsent) openConsentPolicy()
  }

  const handleConsentPolicyScroll = (event: React.UIEvent<HTMLDivElement>) => {
    const container = event.currentTarget
    setHasReadConsentPolicy(
      container.scrollTop + container.clientHeight >= container.scrollHeight - 8
    )
  }

  const acceptConsentPolicy = async () => {
    if (updatingAiPrivacy || !hasReadConsentPolicy) return
    setSettings(current => ({ ...current, aiDataConsent: true }))
    setSaved(false)
    setApiKeyConsentError(null)
    setApiActionStatus(
      settings.language === 'zh'
        ? '已勾选 AI 数据传输同意，请点击“保存设置”完成配置。'
        : 'AI data transfer consent selected. Click Save Settings to complete configuration.'
    )
    setShowConsentPolicy(false)
  }

  const handleDeleteApiKey = async () => {
    if (confirmingApiKeyDeletion || updatingAiPrivacy || saving) return
    setConfirmingApiKeyDeletion(true)
    try {
      const confirmed = await showAppConfirm({
        title: settings.language === 'zh' ? '确认删除 API Key' : 'Confirm API key deletion',
        message: settings.language === 'zh'
          ? '删除后 AI 功能将停用，并同步撤回 AI 数据传输同意。'
          : 'AI features will be disabled and AI data transfer consent will also be withdrawn.',
        confirmText: settings.language === 'zh' ? '确认删除' : 'Delete',
        cancelText: settings.language === 'zh' ? '取消' : 'Cancel',
        tone: 'danger'
      })
      if (!confirmed) return

      setShowKey(false)
      await persistAiPrivacySettings(
        { apiKey: '', aiDataConsent: false, hideApiKeyAlert: false },
        settings.language === 'zh'
          ? 'API Key 已删除，AI 数据传输同意已同步撤回。'
          : 'The API key was deleted and AI data transfer consent was withdrawn.'
      )
    } finally {
      setConfirmingApiKeyDeletion(false)
    }
  }

  const lang = settings.language
  const tokenDanceOnly = isTokenDanceOnly()
  const activeProvider = tokenDanceOnly ? 'tokendance' : (settings.aiProvider ?? 'deepseek')
  const persistedSettings = getSettings()
  const hasSavedApiKey = persistedSettings.apiKey.trim().length > 0
  const aiConfigurationComplete = isAIConfigurationComplete(persistedSettings)
  const consentPolicy = privacyPolicyContent[lang]
  const presetCount = settings.quotes.filter(q => q.isPreset).length
  const customCount = settings.quotes.filter(q => !q.isPreset).length

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between gap-4 mb-4">
        <h1 className="text-2xl font-bold">{t(lang, 'settings.title')}</h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => handleLanguageChange(lang === 'zh' ? 'en' : 'zh')}
            disabled={savingQuickSetting || saving || updatingAiPrivacy}
            className="flex h-11 w-11 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--accent)] hover:bg-[var(--bg-secondary)]"
            aria-label={lang === 'zh' ? 'Switch to English' : '切换至中文'}
            title={lang === 'zh' ? 'Switch to English' : '切换至中文'}
          >
            <Languages size={18} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => void persistQuickSetting('theme', settings.theme === 'dark' ? 'light' : 'dark')}
            disabled={savingQuickSetting || saving || updatingAiPrivacy}
            className="flex h-11 w-11 items-center justify-center rounded-lg border border-[var(--border)] text-amber-500 hover:bg-[var(--bg-secondary)]"
            aria-label={settings.theme === 'dark'
              ? (lang === 'zh' ? '切换至浅色主题' : 'Switch to light theme')
              : (lang === 'zh' ? '切换至深色主题' : 'Switch to dark theme')}
            title={settings.theme === 'dark'
              ? (lang === 'zh' ? '切换至浅色主题' : 'Switch to light theme')
              : (lang === 'zh' ? '切换至深色主题' : 'Switch to dark theme')}
          >
            {settings.theme === 'dark'
              ? <Sun size={18} aria-hidden="true" />
              : <Moon size={18} aria-hidden="true" />}
          </button>
        </div>
      </div>

      {onOpenMigrationNotice && (
        <button
          type="button"
          onClick={onOpenMigrationNotice}
          className="tokendance-panel mb-4 flex w-full items-start gap-3 rounded-lg p-3 text-left text-sm transition-colors hover:bg-[color-mix(in_srgb,var(--bg-card)_86%,var(--text-primary)_14%)]"
        >
          <Megaphone size={18} className="mt-0.5 shrink-0 text-[var(--text-primary)]" aria-hidden="true" />
          <span className="min-w-0">
            <span className="block font-semibold">{lang === 'zh' ? '查看渠道迁移说明' : 'View provider migration notice'}</span>
            <span className="mt-0.5 block text-xs leading-5 text-[var(--text-secondary)]">
              {lang === 'zh' ? '了解 TokenDance 推荐接入、DeepSeek 官方渠道下线时间，以及历史数据保留规则。' : 'Review the TokenDance recommendation, the DeepSeek sunset date, and historical data retention.'}
            </span>
          </span>
          <ExternalLink size={16} className="ml-auto mt-0.5 shrink-0 text-[var(--text-secondary)]" aria-hidden="true" />
        </button>
      )}

      {quickSettingError && (
        <div role="alert" className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-300">
          {quickSettingError}
        </div>
      )}

      <div className="space-y-4">
        {/* API Key */}
        <div className={`card p-4 ${activeProvider === 'tokendance' ? 'tokendance-surface' : ''}`}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <label className="block text-sm font-medium">{lang === 'zh' ? 'AI 接入渠道' : 'AI provider'}</label>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold ${aiConfigurationComplete ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'bg-amber-500/10 text-amber-700 dark:text-amber-300'}`}>
                {aiConfigurationComplete ? <Check size={14} aria-hidden="true" /> : <AlertTriangle size={14} aria-hidden="true" />}
              {aiConfigurationComplete
                  ? (activeProvider === 'tokendance'
                      ? (lang === 'zh' ? 'TokenDance 合作接入已连接' : 'TokenDance partner connection active')
                      : (lang === 'zh' ? 'DeepSeek 官方 API 已连接' : 'DeepSeek Official API connected'))
                  : (lang === 'zh' ? '完成 3 步后启用 AI' : 'Complete 3 steps to enable AI')}
              </span>
              {aiConfigurationComplete && (
                <button type="button" onClick={() => setShowAiConfiguration(current => !current)} className="text-sm text-[var(--accent)] hover:underline">
                  {showAiConfiguration ? (lang === 'zh' ? '收起' : 'Collapse') : (lang === 'zh' ? '管理连接' : 'Manage connection')}
                </button>
              )}
            </div>
          </div>
          {aiConfigurationComplete && !showAiConfiguration && (
            <div className="flex flex-col gap-3 border-t border-[var(--border)] pt-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                {activeProvider === 'tokendance' ? (
                  <img src="https://tokendance.space/TokenDance%E5%93%81%E7%89%8C%E5%9B%BE%E6%A0%87-%E9%80%8F%E6%98%8E%E5%BA%95.svg" alt="TokenDance" className="h-7 w-auto max-w-[150px] object-contain" />
                ) : (
                  <span className="font-semibold">{lang === 'zh' ? 'DeepSeek 官方 API' : 'DeepSeek Official API'}</span>
                )}
                <p className="text-sm text-[var(--text-secondary)]">
                  {lang === 'zh' ? 'DeepSeek V4 Flash 已就绪，可直接返回书籍继续分析。' : 'DeepSeek V4 Flash is ready. Return to a book to continue analyzing.'}
                </p>
              </div>
              {activeProvider === 'tokendance' && (
                <a href="https://tokendance.space/models/deepseek-v4-flash-0731" target="_blank" rel="noopener noreferrer" className="brand-emphasis-coral text-xs hover:underline">
                  {lang === 'zh' ? '峰时火山方舟端口最高约省 20% · 查看实时价目' : 'Up to ~20% off the Volcengine Ark route at peak · Live pricing'}
                </a>
              )}
            </div>
          )}
          {(!aiConfigurationComplete || showAiConfiguration) && (
            <>
          {!tokenDanceOnly && (
            <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300" role="note">
              {lang === 'zh' ? '迁移提醒：官方 DeepSeek 配置渠道将在 2026 年 10 月 1 日下线。到期后已配置的旧 Key 也不再支持，请提前保存相关配置并改用 TokenDance API Key。' : 'Migration notice: the official DeepSeek configuration channel ends on October 1, 2026. Existing keys will also stop working; save your configuration and set up a TokenDance API key before then.'}
            </div>
          )}
          {tokenDanceOnly && (
            <div className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300" role="alert">
              {deepSeekSunsetMessage(lang)}
            </div>
          )}
          <div className={`mb-4 grid gap-2 ${tokenDanceOnly ? '' : 'sm:grid-cols-2'}`} role="radiogroup" aria-label={lang === 'zh' ? 'AI 接入渠道' : 'AI provider'}>
            {(['tokendance', ...(tokenDanceOnly ? [] : ['deepseek' as const])] as const).map(provider => (
              <button
                key={provider}
                type="button"
                role="radio"
                aria-checked={activeProvider === provider}
                onClick={() => updateSetting('aiProvider', provider)}
                className={`rounded-lg border p-3 text-left transition ${activeProvider === provider ? (provider === 'tokendance' ? 'tokendance-panel' : 'border-[var(--accent)] bg-[var(--accent)]/10') : 'border-[var(--border)] hover:bg-[var(--bg-secondary)]'}`}
              >
                {provider === 'tokendance' && <img src="https://tokendance.space/TokenDance%E5%93%81%E7%89%8C%E5%9B%BE%E6%A0%87-%E9%80%8F%E6%98%8E%E5%BA%95.svg" alt="TokenDance" className="mb-2 h-7 w-auto max-w-[150px] object-contain object-left" />}
                <span className="flex flex-wrap items-center gap-2 font-medium">
                  {provider === 'tokendance' ? 'TokenDance / TokenPay' : (lang === 'zh' ? 'DeepSeek 官方 API' : 'DeepSeek Official API')}
                  {provider === 'tokendance' && (
                    <span className="brand-offer-badge !px-2 !py-0.5 !text-[11px]">
                      {lang === 'zh' ? '峰时最高约省 20%' : 'Up to ~20% off at peak'}
                    </span>
                  )}
                </span>
                <span className="mt-1 block text-xs text-[var(--text-secondary)]">{provider === 'tokendance' ? (lang === 'zh' ? 'OAuth、余额与充值；峰时火山方舟端口提供限时优惠，并支持智能路由。' : 'OAuth, balance, and top-up, with limited-time savings on the Volcengine Ark route at peak hours and smart routing.') : (lang === 'zh' ? '使用 DeepSeek 官方控制台与账单管理。' : 'Use the official DeepSeek console and billing.')}</span>
              </button>
            ))}
          </div>
          {activeProvider === 'tokendance' && (
            <div className="brand-offer mb-4 rounded-lg p-4" role="note">
              <div className="flex flex-wrap items-start gap-2">
                <span className="brand-offer-badge shrink-0">
                  {lang === 'zh' ? '限时优惠' : 'Limited-time savings'}
                </span>
                <div className="min-w-0 flex-1 text-sm">
                  <p className="brand-emphasis-coral text-base">
                    {lang === 'zh' ? 'DeepSeek V4 Flash（v4flash0731）峰时路由到火山方舟端口，最高约省 20%' : 'Up to about 20% off DeepSeek V4 Flash (v4flash0731) when peak-hour traffic uses the Volcengine Ark route'}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
                    {lang === 'zh'
                      ? 'TokenDance 当前为 DeepSeek V4 Flash 峰时火山方舟端口提供限时优惠，并支持智能路由与路由偏好设置。适用线路、价格、时段和活动期限以官方实时价目与通知为准。'
                      : 'TokenDance currently provides limited-time savings for the DeepSeek V4 Flash Volcengine Ark route at peak hours, with smart routing and route preference controls. Eligible routes, pricing, periods, and offer dates follow TokenDance official live pricing and notices.'}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-x-2 gap-y-1 text-xs">
                    <a href="https://tokendance.space/models/deepseek-v4-flash-0731" target="_blank" rel="noopener noreferrer" className="tokendance-link inline-flex min-h-11 items-center rounded-md px-1 hover:underline">
                      {lang === 'zh' ? '查看 V4 Flash 实时价目' : 'View live V4 Flash pricing'}
                    </a>
                    <a href="https://tokendance.space" target="_blank" rel="noopener noreferrer" className="tokendance-link inline-flex min-h-11 items-center rounded-md px-1 hover:underline">
                      {lang === 'zh' ? '前往 TokenDance 设置路由偏好' : 'Set route preferences in TokenDance'}
                    </a>
                  </div>
                </div>
              </div>
            </div>
          )}
          {!aiConfigurationComplete && activeProvider === 'tokendance' && (
            <ol className="mb-4 grid gap-2 text-sm sm:grid-cols-3" aria-label={lang === 'zh' ? 'TokenDance 配置步骤' : 'TokenDance setup steps'}>
              {[
                { done: settings.apiKey.trim().length > 0, zh: '授权或填写 Key', en: 'Authorize or add key' },
                { done: settings.aiDataConsent === true, zh: '确认数据传输', en: 'Confirm data transfer' },
                { done: aiConfigurationComplete, zh: '验证并启用 AI', en: 'Verify and enable AI' }
              ].map((step, index) => (
                <li key={step.en} className="flex items-center gap-2 rounded-lg bg-[var(--bg-secondary)] px-3 py-2">
                  <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${step.done ? 'bg-emerald-600 text-white' : 'border border-[var(--border)]'}`}>
                    {step.done ? <Check size={14} aria-hidden="true" /> : index + 1}
                  </span>
                  <span>{lang === 'zh' ? step.zh : step.en}</span>
                </li>
              ))}
            </ol>
          )}
          {activeProvider === 'tokendance' && (
            <div className="tokendance-panel mb-4 rounded-lg p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium">TokenDance OAuth</p>
                  <p className="text-xs text-[var(--text-secondary)]">{lang === 'zh' ? '在 TokenDance 确认后自动返回，不需要复制 Key。' : 'Confirm on TokenDance and return automatically; no copy-paste required.'}</p>
                </div>
                <button type="button" onClick={() => void handleTokendanceAuthorize()} disabled={tokendanceOAuthLoading || updatingAiPrivacy || saving} className="btn-primary inline-flex items-center gap-1.5">
                  {tokendanceOAuthLoading ? <RefreshCw size={15} className="animate-spin" aria-hidden="true" /> : <ExternalLink size={15} aria-hidden="true" />}
                  {tokendanceOAuthLoading ? (lang === 'zh' ? '跳转中...' : 'Opening...') : (lang === 'zh' ? '授权 TokenDance' : 'Authorize TokenDance')}
                </button>
              </div>
            </div>
          )}
          <label className="block text-sm font-medium mb-2">{activeProvider === 'tokendance' ? 'TokenDance API Key' : t(lang, 'settings.apiKey')}</label>
          <div className="relative mb-2">
            <input
              ref={apiKeyInputRef}
              type={showKey ? 'text' : 'password'}
              value={settings.apiKey}
              onChange={(e) => updateSetting('apiKey', e.target.value)}
              disabled={updatingAiPrivacy}
              placeholder={activeProvider === 'tokendance' ? 'TokenDance API Key' : t(lang, 'settings.apiKeyPlaceholder')}
              aria-describedby={apiKeyConsentError ? 'api-key-consent-error' : undefined}
              className="input-field pr-24"
            />
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              className="absolute right-9 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-lg text-[var(--text-secondary)] hover:bg-black/5 hover:text-[var(--text-primary)]"
              aria-label={showKey ? (lang === 'zh' ? '隐藏 API Key' : 'Hide API key') : (lang === 'zh' ? '显示 API Key' : 'Show API key')}
            >
              {showKey ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          {activeProvider !== 'tokendance' && (
            <p className="mb-2 text-xs text-[var(--text-secondary)]">{t(lang, 'settings.apiKeyHelp')}</p>
          )}
          <label className="mt-3 flex items-start gap-3 text-sm text-[var(--text-secondary)] cursor-pointer">
            <input
              ref={aiConsentRef}
              type="checkbox"
              checked={settings.aiDataConsent ?? false}
              onChange={(event) => handleConsentChange(event.target.checked)}
              disabled={updatingAiPrivacy || saving}
              className="mt-1 h-4 w-4"
            />
            <span>
              {lang === 'zh'
                ? `我理解使用 AI 功能会将相关学习内容直接发送至 ${activeProvider === 'tokendance' ? 'TokenDance' : 'DeepSeek'}，并同意进行该传输。`
                : `I understand that AI features send relevant learning content directly to ${activeProvider === 'tokendance' ? 'TokenDance' : 'DeepSeek'}, and I consent to that transfer.`}
            </span>
          </label>
          {apiKeyConsentError && !showConsentPolicy && (
            <p id="api-key-consent-error" role="alert" className="mt-3 text-sm text-red-400">
              {apiKeyConsentError}
            </p>
          )}
          {apiActionStatus && (
            <p role="status" className="mt-3 flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400">
              <Check size={16} aria-hidden="true" />
              {apiActionStatus}
            </p>
          )}
          {saved && (
            <p role="status" className="mt-3 flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400">
              <Check size={16} aria-hidden="true" />
              {lang === 'zh' ? 'API Key 验证并保存成功。' : 'API key verified and saved.'}
            </p>
          )}
          {!aiConfigurationComplete && (
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || updatingAiPrivacy}
              className="btn-primary mt-4 w-full py-3"
            >
              {saving ? <RefreshCw size={17} className="animate-spin" aria-hidden="true" /> : <Check size={17} aria-hidden="true" />}
              {saving
                ? (lang === 'zh' ? '正在验证...' : 'Verifying...')
                : (lang === 'zh' ? '验证并启用 AI' : 'Verify and enable AI')}
            </button>
          )}
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <a
              href={activeProvider === 'tokendance' ? 'https://tokendance.space/docs/api-key-oauth' : 'https://platform.deepseek.com/api_keys'}
              target="_blank"
              rel="noopener noreferrer"
              className={`inline-flex min-h-11 items-center gap-1 rounded-md text-sm ${activeProvider === 'tokendance' ? 'tokendance-link hover:underline' : 'text-[var(--accent)] hover:bg-[var(--bg-secondary)]'}`}
            >
              {activeProvider === 'tokendance' ? (lang === 'zh' ? '查看 TokenDance 授权文档' : 'View TokenDance OAuth docs') : t(lang, 'settings.getApiKey')}
              <ArrowUpRight size={15} className="shrink-0" aria-hidden="true" />
            </a>
            {hasSavedApiKey && (
              <button
                type="button"
                onClick={handleDeleteApiKey}
                disabled={confirmingApiKeyDeletion || updatingAiPrivacy || saving}
                className="inline-flex items-center gap-1.5 text-sm text-red-500 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50 dark:text-red-400"
              >
                <Trash2 size={15} aria-hidden="true" />
                {lang === 'zh' ? '删除 API Key' : 'Delete API key'}
              </button>
            )}
          </div>
          {activeProvider === 'tokendance' && aiConfigurationComplete && (
            <div className="mt-4 border-t border-[var(--border)] pt-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2"><Wallet size={17} className="text-[var(--text-primary)]" aria-hidden="true" /><span className="font-medium">{lang === 'zh' ? 'TokenDance 账户' : 'TokenDance account'}</span></div>
                <button type="button" onClick={() => void handleTokendanceBalance()} disabled={loadingTokendanceBalance} className="btn-secondary inline-flex items-center gap-1.5 text-sm"><RefreshCw size={14} className={loadingTokendanceBalance ? 'animate-spin' : ''} aria-hidden="true" />{lang === 'zh' ? '刷新余额' : 'Refresh balance'}</button>
              </div>
              {tokendanceBalance && <p className="mt-2 text-sm">{lang === 'zh' ? `可用余额：${(tokendanceBalance.balance / 1_000_000).toFixed(2)} 元` : `Available balance: ¥${(tokendanceBalance.balance / 1_000_000).toFixed(2)}`}</p>}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <label htmlFor="tokendance-amount" className="text-sm">{lang === 'zh' ? '充值金额（元）' : 'Top-up amount (CNY)'}</label>
                <input id="tokendance-amount" inputMode="numeric" pattern="[0-9]*" value={tokendanceAmount} onChange={event => setTokendanceAmount(event.target.value)} className="input-field w-28" />
                <button type="button" onClick={() => void handleTokendanceTopUp()} disabled={creatingTokendancePayment} className="btn-secondary inline-flex items-center gap-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-50">
                  {creatingTokendancePayment ? <RefreshCw size={14} className="animate-spin" aria-hidden="true" /> : <Wallet size={14} aria-hidden="true" />}
                  {creatingTokendancePayment ? (lang === 'zh' ? '正在创建...' : 'Creating...') : (lang === 'zh' ? '创建充值会话' : 'Create top-up')}
                </button>
              </div>
              {tokendancePayment && (
                <div
                  className="mt-3 border-t border-[var(--border)] pt-3"
                  role={tokendancePayment.status === 'failed' || tokendancePayment.status === 'closed' || tokendancePayment.status === 'refunded' ? 'alert' : 'status'}
                  aria-live={tokendancePayment.status === 'failed' || tokendancePayment.status === 'closed' || tokendancePayment.status === 'refunded' ? 'assertive' : 'polite'}
                >
                  {tokendancePayment.status === 'paid' ? (
                    <div className="flex items-start gap-3 rounded-lg border border-emerald-500/60 bg-emerald-500/10 p-3 text-emerald-800 dark:text-emerald-200">
                      <CircleCheck size={22} className="mt-0.5 shrink-0" aria-hidden="true" />
                      <div className="min-w-0">
                        <p className="text-base font-bold">
                          {lang === 'zh' ? '充值已到账' : 'Top-up received'}
                        </p>
                        <p className="mt-1 text-sm">
                          {lang === 'zh'
                            ? `充值金额 ¥${tokendancePayment.amount} 已到账，余额已更新。`
                            : `Your ¥${tokendancePayment.amount} top-up has arrived and the balance is updated.`}
                        </p>
                      </div>
                    </div>
                  ) : (tokendancePayment.status === 'failed' || tokendancePayment.status === 'closed' || tokendancePayment.status === 'refunded') ? (
                    <div className="rounded-lg border border-rose-500/60 bg-rose-500/10 p-3 text-rose-800 dark:text-rose-200">
                      <div className="flex items-start gap-3">
                        <CircleX size={22} className="mt-0.5 shrink-0" aria-hidden="true" />
                        <div className="min-w-0">
                          <p className="text-base font-bold">
                            {lang === 'zh'
                              ? `充值${tokendancePayment.status === 'closed' ? '已取消' : tokendancePayment.status === 'refunded' ? '已退款' : '失败'}`
                              : `Top-up ${tokendancePayment.status === 'closed' ? 'cancelled' : tokendancePayment.status === 'refunded' ? 'refunded' : 'failed'}`}
                          </p>
                          <p className="mt-1 text-sm">
                            {lang === 'zh' ? '本次充值未完成，如需帮助请联系客服处理。' : 'This top-up was not completed. Contact support if you need help.'}
                          </p>
                          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm font-semibold">
                            <a
                              href="mailto:18682408521@163.com"
                              aria-label={lang === 'zh' ? '联系客服：18682408521@163.com' : 'Contact support: 18682408521@163.com'}
                              className="inline-flex min-h-11 min-w-0 flex-wrap items-center gap-1.5 rounded-md border border-rose-500/40 bg-white/50 px-2 underline decoration-current/40 underline-offset-2 hover:bg-white/80 hover:decoration-current dark:bg-black/20 dark:hover:bg-black/30"
                            >
                              <Mail size={15} aria-hidden="true" />
                              <span>{lang === 'zh' ? '联系客服：' : 'Contact support: '}</span>
                              <span className="whitespace-nowrap">18682408521@163.com</span>
                            </a>
                            <span className="inline-flex min-h-11 items-center gap-1.5">
                              <MessageCircle size={15} aria-hidden="true" />
                              <span>{lang === 'zh' ? '微信：hostrow' : 'WeChat: hostrow'}</span>
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm font-medium">
                      {lang === 'zh' ? '充值状态：等待支付' : 'Payment status: Waiting for payment'}
                    </p>
                  )}
                  {tokendancePayment.status === 'pending' && (
                    <div className="mt-3">
                      <div className="hidden sm:block">
                        <p className="mb-2 text-xs text-[var(--text-secondary)]">
                          {lang === 'zh' ? '请使用手机扫描二维码完成支付，本页面会自动刷新到账状态。' : 'Scan with your phone to pay. This page will refresh the balance automatically.'}
                        </p>
                        {tokendancePaymentQr ? (
                          <Image src={tokendancePaymentQr} alt={lang === 'zh' ? 'TokenDance 充值支付二维码' : 'TokenDance top-up payment QR code'} width={220} height={220} unoptimized className="rounded-lg border border-[var(--border)] bg-white p-2" />
                        ) : (
                          <div className="flex h-[220px] w-[220px] items-center justify-center rounded-lg border border-[var(--border)] bg-white text-sm text-gray-600">
                            {lang === 'zh' ? '正在生成支付二维码...' : 'Generating payment QR code...'}
                          </div>
                        )}
                      </div>
                      <a href={tokendancePayment.payment_url} target="_blank" rel="noopener noreferrer" className="btn-primary inline-flex min-h-11 items-center justify-center gap-2 sm:hidden">
                        <ExternalLink size={16} aria-hidden="true" />
                        {lang === 'zh' ? '打开支付页' : 'Open payment page'}
                      </a>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
            </>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
        {/* 数据管理 (P0 新增) */}
        <div className="card p-4">
          <button
            onClick={() => {
              setDataStats(getDataStats())
              setAIUsageSummary(getAIUsageSummary())
              void loadDbInfo()
              setShowDataManagement(true)
            }}
            className="w-full flex items-center justify-between"
          >
            <div>
              <h3 className="flex items-center gap-2 font-medium text-left">
                <Database size={18} className="text-[var(--accent)]" aria-hidden="true" />
                {lang === 'zh' ? '数据管理' : 'Data Management'}
              </h3>
              <p className="text-sm text-[var(--text-secondary)] text-left">
                {lang === 'zh'
                  ? `共 ${dataStats.totalBooks} 本书，数据大小 ${dataStats.dataSize}`
                  : `${dataStats.totalBooks} books, ${dataStats.dataSize}`}
              </p>
            </div>
            <ArrowUpRight size={18} className="text-[var(--text-secondary)]" aria-hidden="true" />
          </button>
        </div>

        {/* Quote Manager */}
        <div className="card p-4">
          <button
            onClick={() => {
              setQuoteStatus(null)
              setShowQuoteManager(true)
            }}
            className="w-full flex items-center justify-between"
          >
            <div>
              <h3 className="flex items-center gap-2 font-medium text-left">
                <Quote size={18} className="text-amber-500" aria-hidden="true" />
                {lang === 'zh' ? '金句管理' : 'Quote Manager'}
              </h3>
              <p className="text-sm text-[var(--text-secondary)] text-left">
                {lang === 'zh'
                  ? `共 ${settings.quotes.length} 条（预设 ${presetCount}，自定义 ${customCount}）`
                  : `Total ${settings.quotes.length} (${presetCount} preset, ${customCount} custom)`}
              </p>
            </div>
            <ArrowUpRight size={18} className="text-[var(--text-secondary)]" aria-hidden="true" />
          </button>

        </div>

        <div className="card p-4 sm:col-span-2">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h3 className="flex items-center gap-2 font-medium">
                <Sparkles size={18} className="text-[var(--accent-secondary)]" aria-hidden="true" />
                {lang === 'zh' ? '费曼小助手记忆' : 'Feynman Assistant memory'}
              </h3>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                {lang === 'zh' ? '只保存你明确要求记住的偏好，保存在当前浏览器，独立于书籍历史记录。' : 'Only explicit “remember this” preferences are stored in this browser, separately from book history.'}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-3 sm:justify-end">
              <button
                type="button"
                role="switch"
                aria-checked={settings.assistantMemoryEnabled !== false}
                onClick={() => void toggleAssistantMemory(settings.assistantMemoryEnabled === false)}
                className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${settings.assistantMemoryEnabled === false ? 'bg-[var(--border)]' : 'bg-[var(--accent)]'}`}
                aria-label={lang === 'zh' ? '切换费曼小助手长期记忆' : 'Toggle assistant memory'}
              >
                <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-transform ${settings.assistantMemoryEnabled === false ? 'left-1' : 'left-6'}`} />
              </button>
              <button
                type="button"
                onClick={() => { setShowAssistantMemoryManager(true); void loadAssistantMemoryManager() }}
                className="inline-flex min-h-10 items-center gap-1.5 text-sm text-[var(--accent)] hover:underline"
              >
                <Eye size={15} aria-hidden="true" />
                {lang === 'zh' ? '查看与管理已保存记忆' : 'View and manage saved memories'}
              </button>
            </div>
          </div>
        </div>
        </div>

        {/* Save non-AI settings; AI setup has its own adjacent action above. */}
        <button
          onClick={handleSave}
          disabled={saving || updatingAiPrivacy}
          className="btn-primary w-full py-3 flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {saved && <Check size={18} aria-hidden="true" />}
          {saving ? (lang === 'zh' ? '保存中...' : 'Saving...') : saved ? t(lang, 'settings.saved') : (aiConfigurationComplete ? (lang === 'zh' ? '保存其他设置' : 'Save other settings') : t(lang, 'settings.save'))}
        </button>

        {/* P0 新增：隐私政策链接 */}
        <div className="text-center text-sm text-[var(--text-secondary)]">
          <a
            href="/privacy"
            className="inline-flex items-center gap-1.5 text-[var(--accent)] hover:underline"
          >
            <FileText size={16} aria-hidden="true" />
            {lang === 'zh' ? '隐私政策' : 'Privacy Policy'}
          </a>
        </div>
      </div>

      {showQuoteManager && (
        <div className="modal-overlay" onClick={() => setShowQuoteManager(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label={lang === 'zh' ? '金句管理' : 'Quote Manager'}
            className="modal-content max-w-2xl max-h-[85vh] flex flex-col overflow-hidden p-5"
            onClick={event => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-4 mb-3 shrink-0">
              <div>
                <h2 className="text-xl font-bold">{lang === 'zh' ? '金句管理' : 'Quote Manager'}</h2>
                <p className="text-sm text-[var(--text-secondary)]">
                  {lang === 'zh'
                    ? `共 ${settings.quotes.length} 条（预设 ${presetCount}，自定义 ${customCount}）`
                    : `Total ${settings.quotes.length} (${presetCount} preset, ${customCount} custom)`}
                </p>
              </div>
              <button
                onClick={() => setShowQuoteManager(false)}
                className="btn-secondary px-3 py-2"
                aria-label={lang === 'zh' ? '关闭金句管理' : 'Close quote manager'}
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            <div className="p-3 bg-[var(--bg-secondary)] rounded-xl shrink-0">
              <h3 className="text-sm font-medium mb-2">
                {lang === 'zh' ? '添加新金句' : 'Add New Quote'}
              </h3>
              <textarea
                value={newQuoteText}
                onChange={(e) => setNewQuoteText(e.target.value)}
                placeholder={lang === 'zh' ? '输入金句内容...' : 'Enter quote text...'}
                className="input-field min-h-[60px] resize-y mb-2"
              />
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newQuoteAuthor}
                  onChange={(e) => setNewQuoteAuthor(e.target.value)}
                  placeholder={lang === 'zh' ? '作者（选填）' : 'Author (optional)'}
                  className="input-field flex-1"
                />
                <button onClick={addQuote} disabled={!newQuoteText.trim()} className="btn-primary">
                  {lang === 'zh' ? '添加' : 'Add'}
                </button>
              </div>
            </div>

            <div className="mt-3 min-h-0 flex flex-1 flex-col">
              <div className="flex items-center justify-between mb-2 shrink-0">
                <h3 className="text-sm font-medium">
                  {lang === 'zh' ? '金句列表' : 'Quote List'}
                </h3>
                <button onClick={resetToDefault} className="text-xs text-[var(--accent)] hover:underline">
                  {lang === 'zh' ? '恢复默认' : 'Reset to Default'}
                </button>
              </div>

              {quoteStatus && (
                <div role="status" className="mb-3 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-300">
                  {quoteStatus}
                </div>
              )}

              {settings.quotes.length === 0 ? (
                <p className="text-sm text-[var(--text-secondary)] text-center py-4">
                  {lang === 'zh' ? '暂无金句，请添加或恢复默认' : 'No quotes, please add or reset'}
                </p>
              ) : (
                <div className="space-y-2 min-h-0 flex-1 overflow-y-auto pr-1">
                  {settings.quotes.map((quote, idx) => (
                    <div key={idx} className="bg-[var(--bg-secondary)] rounded-xl p-3">
                      {editingIndex === idx ? (
                        <div className="space-y-2">
                          <textarea
                            value={editText}
                            onChange={(e) => setEditText(e.target.value)}
                            className="input-field min-h-[60px] resize-y"
                            autoFocus
                          />
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={editAuthor}
                              onChange={(e) => setEditAuthor(e.target.value)}
                              placeholder={lang === 'zh' ? '作者' : 'Author'}
                              className="input-field flex-1"
                            />
                            <button onClick={saveEdit} className="btn-primary text-sm py-2">
                              {lang === 'zh' ? '保存' : 'Save'}
                            </button>
                            <button onClick={cancelEdit} className="btn-secondary text-sm py-2">
                              {lang === 'zh' ? '取消' : 'Cancel'}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-start gap-2">
                          <div className="flex-1 min-w-0">
                            {quote.isPreset && (
                              <span className="text-xs bg-[var(--accent)]/20 text-[var(--accent)] px-2 py-0.5 rounded">
                                {lang === 'zh' ? '预设' : 'Preset'}
                              </span>
                            )}
                            <p className="text-sm mt-1">"{quote.text}"</p>
                            <p className="text-xs text-[var(--text-secondary)] mt-1">- {quote.author}</p>
                          </div>
                          <div className="flex gap-1 shrink-0">
                            <button
                              onClick={() => startEdit(idx)}
                              className="text-[var(--accent)] hover:bg-[var(--accent)]/10 p-1.5 rounded"
                              aria-label={lang === 'zh' ? '编辑金句' : 'Edit quote'}
                              title={lang === 'zh' ? '编辑' : 'Edit'}
                            >
                              <Pencil size={16} aria-hidden="true" />
                            </button>
                            <button
                              onClick={() => removeQuote(idx)}
                              className="text-red-400 hover:bg-red-400/10 p-1.5 rounded"
                              aria-label={lang === 'zh' ? '删除金句' : 'Delete quote'}
                              title={lang === 'zh' ? '删除' : 'Delete'}
                            >
                              <Trash2 size={16} aria-hidden="true" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showAssistantMemoryManager && (
        <div className="modal-overlay" onClick={() => setShowAssistantMemoryManager(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label={lang === 'zh' ? '费曼小助手记忆管理' : 'Feynman Assistant memory'}
            className="modal-content product-dialog max-w-lg max-h-[calc(100dvh-32px)]"
            onClick={event => event.stopPropagation()}
          >
            <div className="product-dialog-header">
              <div>
                <h2 className="text-xl font-bold">{lang === 'zh' ? '费曼小助手记忆' : 'Feynman Assistant memory'}</h2>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">{lang === 'zh' ? '这些内容只用于个性化回答，可随时删除。' : 'Used only to personalize replies. You can remove them at any time.'}</p>
              </div>
              <button type="button" onClick={() => setShowAssistantMemoryManager(false)} className="btn-secondary px-3 py-2" aria-label={lang === 'zh' ? '关闭' : 'Close'}><X size={18} aria-hidden="true" /></button>
            </div>
            <div className="product-dialog-body">
            {loadingAssistantMemories ? <p className="py-8 text-center text-sm text-[var(--text-secondary)]">{lang === 'zh' ? '正在读取…' : 'Loading…'}</p> : assistantMemories.length === 0 ? (
              <div className="rounded-lg border border-dashed border-[var(--border)] p-6 text-center text-sm text-[var(--text-secondary)]">{lang === 'zh' ? '还没有保存的记忆。对小助手说“请记住……”即可添加。' : 'No saved memories yet. Tell the assistant “remember that…” to add one.'}</div>
            ) : (
              <div className="space-y-2">
                {assistantMemories.map(memory => (
                  <div key={memory.id} className="flex items-start gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-3">
                    <p className="min-w-0 flex-1 text-sm leading-5">{memory.content}</p>
                    <button type="button" onClick={async () => { await deleteAssistantMemory(memory.id); setAssistantMemories(current => current.filter(item => item.id !== memory.id)) }} className="icon-button h-9 w-9 shrink-0 text-red-500" aria-label={lang === 'zh' ? '删除记忆' : 'Delete memory'} title={lang === 'zh' ? '删除记忆' : 'Delete memory'}><Trash2 size={15} aria-hidden="true" /></button>
                  </div>
                ))}
              </div>
            )}
            </div>
            <div className="product-dialog-footer">
              <button type="button" onClick={exportAssistantMemories} disabled={!assistantMemories.length} className="btn-secondary inline-flex min-h-10 items-center gap-1.5 text-sm disabled:opacity-50"><Download size={15} aria-hidden="true" />{lang === 'zh' ? '导出记忆' : 'Export memories'}</button>
              <button type="button" onClick={async () => { if (!assistantMemories.length) return; const confirmed = await showAppConfirm({ title: lang === 'zh' ? '清空记忆' : 'Clear memories', message: lang === 'zh' ? '将删除费曼小助手保存的全部偏好，书籍和会话不会受影响。' : 'This removes all assistant preferences. Books and conversations are not affected.', confirmText: lang === 'zh' ? '清空' : 'Clear', cancelText: lang === 'zh' ? '取消' : 'Cancel', tone: 'danger' }); if (!confirmed) return; await clearAssistantMemories(); setAssistantMemories([]) }} disabled={!assistantMemories.length} className="btn-secondary inline-flex min-h-10 items-center gap-1.5 text-sm text-red-500 disabled:opacity-50"><Trash2 size={15} aria-hidden="true" />{lang === 'zh' ? '清空全部' : 'Clear all'}</button>
            </div>
          </div>
        </div>
      )}

      {showDataManagement && (
        <div className="modal-overlay" onClick={closeDataManagement}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label={lang === 'zh' ? '数据管理' : 'Data Management'}
            className="modal-content product-dialog max-w-md max-h-[calc(100dvh-32px)]"
            onClick={event => event.stopPropagation()}
          >
            <div className="product-dialog-header">
              <div>
                <h2 className="text-xl font-bold">{lang === 'zh' ? '数据管理' : 'Data Management'}</h2>
                <p className="text-sm text-[var(--text-secondary)]">
                  {dataStatsError
                    ? (lang === 'zh' ? '统计读取失败' : 'Statistics unavailable')
                    : lang === 'zh'
                    ? `共 ${dataStats.totalBooks} 本书，数据大小 ${dataStats.dataSize}`
                    : `${dataStats.totalBooks} books, ${dataStats.dataSize}`}
                </p>
              </div>
              <button
                onClick={closeDataManagement}
                disabled={migrating || importing || clearingData || exporting}
                className="btn-secondary px-3 py-2 disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label={lang === 'zh' ? '关闭数据管理' : 'Close data management'}
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            <div className="product-dialog-body">
            <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
              <div className="flex items-start gap-2.5">
                <AlertTriangle size={19} className="mt-0.5 shrink-0 text-amber-500" aria-hidden="true" />
                <div className="text-sm leading-5">
                  <p className="font-semibold text-amber-700 dark:text-amber-300">
                    {lang === 'zh' ? '本地数据可能永久丢失，请定期导出备份' : 'Local data can be permanently lost. Export backups regularly.'}
                  </p>
                  <p className="mt-1 text-xs text-[var(--text-secondary)]">
                    {lang === 'zh'
                      ? '清理浏览器缓存或网站数据、卸载重装、更新或重置浏览器、切换设备或用户配置，都可能删除全部学习数据。平台当前不提供云端备份与恢复服务，无法代为找回本地丢失的数据。'
                      : 'Clearing site data, reinstalling, updating or resetting the browser, or switching devices or profiles may delete all learning data. The platform currently does not provide cloud backup or recovery services and cannot recover locally lost data.'}
                  </p>
                  <p className="mt-2 text-xs text-[var(--text-secondary)]">
                    {lang === 'zh'
                      ? '当已有学习数据且距离上次成功备份满 7 天时，系统会再次提醒。提醒不会自动保存数据，仍需由你手动导出；数据较大时会自动分卷，导入时需一次选择全部分卷。只有确认文件保存成功后才会记录备份时间。'
                      : 'When learning data exists and 7 days have passed since the last successful backup, the system will remind you again. Reminders do not save data automatically. Large backups are split automatically; select every part together when importing. Backup time is recorded only after the files are confirmed saved.'}
                  </p>
                  <p className="mt-2 text-xs text-[var(--text-secondary)]">
                    <strong className="text-amber-700 dark:text-amber-300">
                      {lang === 'zh' ? '备份文件未加密：' : 'Backups are not encrypted: '}
                    </strong>
                    {lang === 'zh'
                      ? '其中包含完整书籍原文、笔记、教学实践、角色问答和 AI Token 用量记录，请只保存在可信设备或存储介质中；API Key 不会被导出。'
                      : 'They contain full book text, notes, teaching practice, persona Q&A, and AI token usage records. Store them only on trusted devices or media. The API key is excluded.'}
                  </p>
                  <p className="mt-2 text-xs font-medium">
                    {lastBackupAt
                      ? (lang === 'zh'
                        ? `上次成功备份：${new Date(lastBackupAt).toLocaleString('zh-CN')}`
                        : `Last successful backup: ${new Date(lastBackupAt).toLocaleString('en-US')}`)
                      : (lang === 'zh' ? '当前未记录到任何备份' : 'No backup has been recorded')}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between p-3 bg-[var(--bg-secondary)] rounded-lg mb-3">
              <div className="flex items-center gap-2">
                <HardDrive size={20} className="text-[var(--accent-secondary)]" aria-hidden="true" />
                <div>
                  <div className="text-sm font-medium">{lang === 'zh' ? '存储方式' : 'Storage'}</div>
                  <div className="text-xs text-[var(--text-secondary)]">
                    {dbInfo.usingIndexedDB
                      ? (lang === 'zh' ? 'IndexedDB（浏览器本地存储）' : 'IndexedDB (Browser Local Storage)')
                      : (lang === 'zh' ? 'LocalStorage (兼容模式)' : 'LocalStorage (Legacy Mode)')}
                  </div>
                </div>
              </div>
              {!dbInfo.usingIndexedDB && dbInfo.needsMigration && (
                <button
                  onClick={handleMigration}
                  disabled={migrating}
                  className="px-3 py-1 text-xs bg-[var(--accent)] text-white rounded-lg hover:opacity-80 disabled:opacity-50"
                >
                  {migrating
                    ? (lang === 'zh' ? '迁移中...' : 'Migrating...')
                    : (lang === 'zh' ? '升级到 IndexedDB' : 'Upgrade to IndexedDB')}
                </button>
              )}
            </div>

            {dataStatsError ? (
              <div role="alert" className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-500">
                {lang === 'zh' ? '无法读取本地数据统计，请刷新页面后重试。' : 'Local data statistics could not be read. Refresh and try again.'}
              </div>
            ) : <div className="grid grid-cols-2 gap-3 text-sm mb-3">
              <div className="bg-[var(--bg-secondary)] p-3 rounded-lg text-center">
                <div className="text-2xl font-bold text-[var(--accent)]">{dataStats.totalBooks}</div>
                <div className="text-[var(--text-secondary)] text-xs">{lang === 'zh' ? '书籍' : 'Books'}</div>
              </div>
              <div className="bg-[var(--bg-secondary)] p-3 rounded-lg text-center">
                <div className="text-2xl font-bold text-[var(--accent)]">{dataStats.totalNotes}</div>
                <div className="text-[var(--text-secondary)] text-xs">{lang === 'zh' ? '笔记' : 'Notes'}</div>
              </div>
              <div className="bg-[var(--bg-secondary)] p-3 rounded-lg text-center">
                <div className="text-2xl font-bold text-[var(--accent)]">{dataStats.totalPractices}</div>
                <div className="text-[var(--text-secondary)] text-xs">{lang === 'zh' ? '实践' : 'Practices'}</div>
              </div>
              <div className="bg-[var(--bg-secondary)] p-3 rounded-lg text-center">
                <div className="text-2xl font-bold text-[var(--accent)]">{dataStats.dataSize}</div>
                <div className="text-[var(--text-secondary)] text-xs">{lang === 'zh' ? '大小' : 'Size'}</div>
              </div>
            </div>}

            <div className="mb-3 rounded-lg border border-[var(--accent)]/25 bg-[var(--accent)]/8 p-3">
              <div className="mb-2 flex items-center gap-2">
                <Gauge size={18} className="text-[var(--accent)]" aria-hidden="true" />
                <span className="text-sm font-medium">{lang === 'zh' ? 'AI Token 实际用量' : 'Actual AI Token Usage'}</span>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-[var(--text-secondary)]">
                <span>{lang === 'zh' ? '已记录请求' : 'Recorded requests'}</span>
                <strong className="text-right text-[var(--text-primary)]">{aiUsageSummary.requestCount.toLocaleString()}</strong>
                <span>{lang === 'zh' ? '输入 Token' : 'Input tokens'}</span>
                <strong className="text-right text-[var(--text-primary)]">{aiUsageSummary.promptTokens.toLocaleString()}</strong>
                <span>{lang === 'zh' ? '输出 Token' : 'Output tokens'}</span>
                <strong className="text-right text-[var(--text-primary)]">{aiUsageSummary.completionTokens.toLocaleString()}</strong>
                <span>{lang === 'zh' ? '合计 Token' : 'Total tokens'}</span>
                <strong className="text-right text-[var(--accent)]">{aiUsageSummary.totalTokens.toLocaleString()}</strong>
              </div>
              <p className="mt-2 text-xs text-[var(--text-secondary)]">
                {lang === 'zh'
                  ? '这里记录接口实际返回的 Token 数；API 不返回扣费金额，实际费用请以 DeepSeek 官方价格和控制台账单为准。'
                  : 'These are token counts returned by the API. The API does not return the billed amount; use official DeepSeek pricing and your console bill as the source of truth.'}
              </p>
            </div>

            <div className="flex gap-2">
              <button onClick={handleExport} disabled={migrating || importing || clearingData || exporting} className="btn-secondary flex flex-1 items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed">
                <Download size={16} className="text-emerald-500" aria-hidden="true" />
                {exporting
                  ? (lang === 'zh' ? '正在导出...' : 'Exporting...')
                  : (lang === 'zh' ? '导出数据' : 'Export')}
              </button>
              <button
                onClick={() => {
                  setImportError(null)
                  setImportPreview(null)
                  setImportFiles([])
                  if (fileInputRef.current) fileInputRef.current.value = ''
                  setShowImportModal(true)
                }}
                disabled={migrating || importing || clearingData}
                className="btn-secondary flex flex-1 items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Upload size={16} className="text-[var(--accent)]" aria-hidden="true" />
                {lang === 'zh' ? '导入数据' : 'Import'}
              </button>
              <button
                onClick={handleClearData}
                disabled={migrating || importing || clearingData}
                className="flex items-center justify-center px-4 py-2 text-red-400 border border-red-400/30 rounded-xl hover:bg-red-400/10 disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label={lang === 'zh' ? '清除所有数据' : 'Clear all data'}
              >
                <Trash2 size={18} aria-hidden="true" />
              </button>
            </div>

            {dataOperationStatus && (
              <div
                role={dataOperationStatus.type === 'error' ? 'alert' : 'status'}
                className={`mt-3 rounded-lg border p-3 text-sm ${
                  dataOperationStatus.type === 'success'
                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                    : dataOperationStatus.type === 'error'
                      ? 'border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-300'
                      : 'border-[var(--accent)]/35 bg-[var(--accent)]/8 text-[var(--accent)]'
                }`}
              >
                {dataOperationStatus.message}
              </div>
            )}

            {pendingBackupDownload && (
              <div role="status" className="mt-3 rounded-lg border border-[var(--accent)]/35 bg-[var(--accent)]/8 p-3 text-sm">
                <p className="font-medium text-[var(--accent)]">
                  {lang === 'zh' ? '请确认备份文件是否已保存' : 'Confirm that the backup file was saved'}
                </p>
                <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
                  {lang === 'zh'
                    ? `下载已经发起，但当前浏览器无法确认文件是否真正保存到本地。请先在下载列表中确认 ${pendingBackupDownload.fileCount} 个${pendingBackupDownload.format === 'multipart' ? '分卷' : '备份'}文件全部保存成功，再登记本次备份。`
                    : `The download started, but this browser cannot confirm it was saved. Confirm that all ${pendingBackupDownload.fileCount} ${pendingBackupDownload.format === 'multipart' ? 'backup parts' : 'backup file'} were saved before recording this backup.`}
                </p>
                <div className="mt-3 flex gap-2">
                  <button type="button" onClick={recordBackupCompleted} className="btn-primary flex-1 text-sm py-2">
                    {lang === 'zh' ? '确认已保存' : 'Confirm saved'}
                  </button>
                  <button type="button" onClick={() => setPendingBackupDownload(null)} className="btn-secondary text-sm py-2">
                    {lang === 'zh' ? '未保存' : 'Not saved'}
                  </button>
                </div>
              </div>
            )}

            </div>
            <div className="product-dialog-footer">
              <button type="button" onClick={closeDataManagement} disabled={migrating || importing || clearingData || exporting} className="btn-secondary w-full disabled:opacity-50 disabled:cursor-not-allowed">
                {lang === 'zh' ? '完成' : 'Done'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 数据导入模态框 */}
      {showImportModal && (
        <div className="modal-overlay" onClick={closeImportModal}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label={lang === 'zh' ? '导入数据' : 'Import Data'}
            className="modal-content product-dialog max-w-md max-h-[calc(100dvh-32px)]"
            onClick={e => e.stopPropagation()}
          >
            <div className="product-dialog-header product-dialog-header-compact">
            <h2 className="text-xl font-bold">
              <span className="flex items-center gap-2">
                <Upload size={20} className="text-[var(--accent)]" aria-hidden="true" />
                {lang === 'zh' ? '导入数据' : 'Import Data'}
              </span>
            </h2>
            </div>
            <div className="product-dialog-body">

            {/* 文件选择 */}
            <div className="mb-4">
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,.feynman-part,application/json,application/octet-stream"
                multiple
                onChange={handleImportFileSelect}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={readingImport}
                className="btn-secondary w-full"
              >
                {readingImport
                  ? (lang === 'zh' ? '正在校验备份...' : 'Validating backup...')
                  : (lang === 'zh' ? '选择 JSON 或全部分卷文件' : 'Select JSON or all backup parts')}
              </button>
              {importFiles.length > 0 && (
                <p className="mt-2 text-xs text-[var(--text-secondary)]">
                  {lang === 'zh' ? `已选择 ${importFiles.length} 个文件` : `${importFiles.length} file(s) selected`}
                </p>
              )}
            </div>

            {/* 错误提示 */}
            {importError && (
              <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-500 text-sm">
                {importError}
              </div>
            )}

            {/* 预览信息 */}
            {importPreview && (
              <div className="mb-4 p-3 bg-[var(--bg-secondary)] rounded-lg">
                <div className="text-sm font-medium mb-2">
                  {lang === 'zh' ? '备份内容：' : 'Backup contains:'}
                </div>
                <div className="text-sm text-[var(--text-secondary)] space-y-1">
                  <div>• {importPreview.books.length} {lang === 'zh' ? '本书' : 'books'}</div>
                  <div>• {importPreview.aiUsageRecords.length.toLocaleString()} {lang === 'zh' ? '条 AI Token 用量记录' : 'AI token usage records'}</div>
                  <div>• {new Date(importPreview.exportDate).toLocaleString()}</div>
                  <div>• {lang === 'zh' ? '数据版本' : 'Version'} v{importPreview.version}</div>
                </div>
              </div>
            )}

            {/* 导入选项 */}
            {importPreview && (
              <div className="mb-4 space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={importOptions.importSettings}
                    onChange={e => setImportOptions({ ...importOptions, importSettings: e.target.checked })}
                    className="w-4 h-4 accent-[var(--accent)]"
                  />
                  <span className="text-sm">{lang === 'zh' ? '导入设置（不含 API Key）' : 'Import settings (excluding API Key)'}</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={importOptions.importBooks}
                    onChange={e => setImportOptions({ ...importOptions, importBooks: e.target.checked })}
                    className="w-4 h-4 accent-[var(--accent)]"
                  />
                  <span className="text-sm">{lang === 'zh' ? '导入书籍数据' : 'Import book data'}</span>
                </label>
                {importOptions.importBooks && (
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={importOptions.mergeBooks}
                      onChange={e => setImportOptions({ ...importOptions, mergeBooks: e.target.checked })}
                      className="w-4 h-4 accent-[var(--accent)]"
                    />
                    <span className="text-sm">{lang === 'zh' ? '合并模式（保留现有书籍）' : 'Merge mode (keep existing books)'}</span>
                  </label>
                )}
              </div>
            )}

            {/* 按钮 */}
            </div>
            <div className="product-dialog-footer">
            <div className="flex w-full gap-2">
              <button
                onClick={closeImportModal}
                className="btn-secondary flex-1"
                disabled={importing || readingImport}
              >
                {lang === 'zh' ? '取消' : 'Cancel'}
              </button>
              <button
                onClick={handleConfirmImport}
                className="btn-primary flex-1"
                disabled={!importPreview || importing || readingImport || (!importOptions.importSettings && !importOptions.importBooks)}
              >
                {importing ? (lang === 'zh' ? '导入中...' : 'Importing...') : (lang === 'zh' ? '导入' : 'Import')}
              </button>
            </div>
            </div>
          </div>
        </div>
      )}

      {showConsentPolicy && (
        <div className="modal-overlay z-[60]">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="consent-policy-title"
            className="modal-content !max-w-3xl h-[85vh] flex flex-col overflow-hidden !p-0"
          >
            <div className="shrink-0 px-6 py-5 border-b border-[var(--border)]">
              <h2 id="consent-policy-title" className="flex items-center gap-2 text-xl font-bold">
                <FileText size={20} className="text-[var(--accent)]" aria-hidden="true" />
                {consentPolicy.title}
              </h2>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">{consentPolicy.lastUpdated}</p>
            </div>

            <div
              ref={consentPolicyScrollRef}
              onScroll={handleConsentPolicyScroll}
              className="min-h-0 flex-1 overflow-y-auto px-6 py-5"
            >
              <div className="space-y-5">
                {consentPolicy.sections.map((section) => (
                  <section key={section.title} className="border-b border-[var(--border)] pb-5 last:border-b-0">
                    <h3 className="mb-3 text-base font-semibold text-[var(--text-primary)]">{section.title}</h3>
                    <MarkdownRenderer content={section.content} />
                  </section>
                ))}
              </div>
            </div>

            <div className="shrink-0 border-t border-[var(--border)] px-6 py-4">
              {apiKeyConsentError && (
                <p role="alert" className="mb-3 text-sm text-red-500">
                  {apiKeyConsentError}
                </p>
              )}
              <button
                type="button"
                onClick={() => void acceptConsentPolicy()}
                disabled={!hasReadConsentPolicy || updatingAiPrivacy}
                className="btn-primary w-full flex items-center justify-center gap-2"
              >
                <Check size={18} aria-hidden="true" />
                {updatingAiPrivacy
                  ? (lang === 'zh' ? '正在保存...' : 'Saving...')
                  : hasReadConsentPolicy
                  ? (lang === 'zh' ? '已阅读并同意' : 'I have read and agree')
                  : (lang === 'zh' ? '请阅读至政策末尾' : 'Read to the end to continue')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
