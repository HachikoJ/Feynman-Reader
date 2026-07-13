'use client'

import { useState, useEffect, useRef } from 'react'
import {
  ArrowUpRight,
  AlertTriangle,
  Check,
  Database,
  Download,
  Eye,
  EyeOff,
  FileText,
  HardDrive,
  Languages,
  Moon,
  Pencil,
  Quote,
  Sun,
  Trash2,
  Upload,
  X
} from 'lucide-react'
import {
  AppSettings,
  CustomQuote,
  getBooks,
  getSettings,
  saveBooks,
  saveSetting,
  saveSettings,
  downloadDataBackup,
  previewImportData,
  applyImportData,
  getDataStats,
  ExportData,
  resetStoreCache,
  flushPendingStoreWrites,
  initializeStore,
  reloadBooksFromPersistence,
  reloadSettingsFromPersistence
} from '@/lib/store'
import { logger } from '@/lib/logger'
import { Language, t } from '@/lib/i18n'
import { privacyPolicyContent } from '@/lib/privacyPolicy'
import { defaultQuotesZh, defaultQuotesEn } from './LoadingQuotes'
import MarkdownRenderer from './MarkdownRenderer'
import { LAST_BACKUP_AT_KEY } from '@/lib/backupReminder'
import { MAX_BACKUP_FILE_BYTES } from '@/lib/backupValidation'
import { validateApiKey } from '@/lib/validation'
import { DEEPSEEK_API_KEY_INVALID, validateDeepSeekApiKey } from '@/lib/deepseek'

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
}

export default function Settings({
  onSettingsChange,
  openDataManagement = false,
  focusApiConfigurationRequest = 0,
  onBackupCompleted
}: Props) {
  const [settings, setSettings] = useState<AppSettings>({
    apiKey: '',
    language: 'zh',
    theme: 'light',
    hideApiKeyAlert: false,
    quotes: [],
    quotesInitialized: false
  })
  const [showKey, setShowKey] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savingQuickSetting, setSavingQuickSetting] = useState(false)
  const [quickSettingError, setQuickSettingError] = useState<string | null>(null)
  const [apiKeyConsentError, setApiKeyConsentError] = useState<string | null>(null)
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
  const [lastBackupAt, setLastBackupAt] = useState<number | null>(null)
  const [exporting, setExporting] = useState(false)
  const [awaitingBackupConfirmation, setAwaitingBackupConfirmation] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importPreview, setImportPreview] = useState<ExportData | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [importOptions, setImportOptions] = useState({
    importSettings: true,
    importBooks: true,
    mergeBooks: true
  })
  const [importing, setImporting] = useState(false)
  const [dataStats, setDataStats] = useState({
    totalBooks: 0,
    totalNotes: 0,
    totalPractices: 0,
    totalQARecords: 0,
    dataSize: '0 B'
  })
  const [dataStatsError, setDataStatsError] = useState(false)
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

    // 始终使用中文金句作为默认
    if (!loaded.quotesInitialized || loaded.quotes.length === 0) {
      loaded = { ...loaded, quotes: [...defaultQuotesZh], quotesInitialized: true }
      saveSettings(loaded)
      void flushPendingStoreWrites().catch(async error => {
        logger.error('Failed to initialize default quotes:', error)
        const restored = await reloadSettingsFromPersistence().catch(() => null)
        if (!cancelled && restored) setSettings(restored)
      })
    }

    setSettings(loaded)

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
    if (openDataManagement) {
      setShowDataManagement(true)
    }
  }, [openDataManagement])

  useEffect(() => {
    if (
      focusApiConfigurationRequest <= 0 ||
      handledApiConfigurationRequestRef.current === focusApiConfigurationRequest
    ) return
    handledApiConfigurationRequestRef.current = focusApiConfigurationRequest

    const apiKeyMissing = settings.apiKey.trim().length === 0
    const apiKeyValidation = validateApiKey(settings.apiKey)
    const missingConsent = settings.apiKey.trim().length > 0 && !settings.aiDataConsent
    setApiKeyConsentError(apiKeyMissing
      ? (settings.language === 'zh' ? '请先填写 DeepSeek API Key，并在勾选同意后保存。' : 'Add your DeepSeek API key, confirm consent, and save it first.')
      : !apiKeyValidation.valid
        ? (settings.language === 'zh' ? 'API Key 格式不正确，请检查后重新保存。' : 'The API key format is invalid. Check it and save again.')
      : missingConsent
        ? (settings.language === 'zh' ? '使用 AI 功能前，请先确认 AI 数据传输同意。' : 'Confirm AI data transfer consent before using AI features.')
        : null)

    requestAnimationFrame(() => {
      const target = missingConsent ? aiConsentRef.current : apiKeyInputRef.current
      target?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      target?.focus()
    })
  }, [focusApiConfigurationRequest, settings.aiDataConsent, settings.apiKey, settings.language])

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
    const trimmedApiKey = settings.apiKey.trim()
    if (!trimmedApiKey) {
      const message = settings.language === 'zh'
        ? '保存失败：请先填写 DeepSeek API Key。'
        : 'Save failed: enter your DeepSeek API key first.'
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
      await validateDeepSeekApiKey(trimmedApiKey)
    } catch (error) {
      const invalidKey = error instanceof Error && error.message === DEEPSEEK_API_KEY_INVALID
      const message = settings.language === 'zh'
        ? (invalidKey
            ? 'API Key 无效，请检查是否复制正确或已被停用。'
            : '暂时无法验证 API Key，请检查网络后重试。')
        : (invalidKey
            ? 'The API key is invalid. Check that it was copied correctly and is still active.'
            : 'The API key could not be verified. Check your network and try again.')
      logger.warn(invalidKey ? 'DeepSeek rejected the API key.' : 'DeepSeek API key verification failed.')
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

  const updateSetting = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    const newSettings = { ...settings, [key]: value }
    setSettings(newSettings)
    if (key === 'apiKey' || key === 'aiDataConsent') {
      setApiKeyConsentError(null)
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

  const handleLanguageChange = (newLang: Language) => {
    void persistQuickSetting('language', newLang)
  }

  const addQuote = () => {
    if (!newQuoteText.trim()) return
    setQuoteStatus(null)
    const newQuote: CustomQuote = {
      text: newQuoteText.trim(),
      author: newQuoteAuthor.trim() || (settings.language === 'zh' ? '自定义' : 'Custom'),
      isPreset: false
    }
    updateSetting('quotes', [...settings.quotes, newQuote])
    setNewQuoteText('')
    setNewQuoteAuthor('')
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
      setAwaitingBackupConfirmation(false)
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
    setAwaitingBackupConfirmation(false)
    setDataOperationStatus(null)
    try {
      const result = await downloadDataBackup()
      if (result === 'saved') {
        recordBackupCompleted()
      } else {
        setAwaitingBackupConfirmation(true)
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
  const handleImportFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const readToken = ++importReadTokenRef.current

    setImportFile(file)
    setImportError(null)

    if (file.size > MAX_BACKUP_FILE_BYTES) {
      setImportError(`备份文件不能超过 ${MAX_BACKUP_FILE_BYTES / 1024 / 1024} MB`)
      setImportPreview(null)
      return
    }

    const reader = new FileReader()
    reader.onload = (event) => {
      if (readToken !== importReadTokenRef.current) return
      try {
        const content = event.target?.result as string
        const result = previewImportData(content)

        if (result.valid && result.data) {
          setImportPreview(result.data)
        } else {
          setImportError(result.error || '文件格式错误')
          setImportPreview(null)
        }
      } catch (e) {
        setImportError('无法解析文件')
        setImportPreview(null)
      }
    }
    reader.onerror = () => {
      if (readToken !== importReadTokenRef.current) return
      setImportError('无法读取备份文件')
      setImportPreview(null)
    }
    reader.readAsText(file)
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
      setImportFile(null)
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
    const confirmed = confirm(settings.language === 'zh'
      ? '确定要清除所有数据吗？此操作不可撤销，平台也无法恢复。强烈建议先取消并导出备份。'
      : 'Clear all data? This cannot be undone or recovered by the platform. We strongly recommend cancelling and exporting a backup first.')
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
    setAwaitingBackupConfirmation(false)
    setDataOperationStatus(null)
  }

  const closeImportModal = () => {
    if (dataOperationInFlightRef.current) return
    importReadTokenRef.current += 1
    setShowImportModal(false)
    setImportPreview(null)
    setImportError(null)
    setImportFile(null)
  }

  const openConsentPolicy = () => {
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
      updateSetting('aiDataConsent', false)
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

  const acceptConsentPolicy = () => {
    updateSetting('aiDataConsent', true)
    setShowConsentPolicy(false)
  }

  const lang = settings.language
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
            disabled={savingQuickSetting || saving}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--accent)] hover:bg-[var(--bg-secondary)]"
            aria-label={lang === 'zh' ? 'Switch to English' : '切换至中文'}
            title={lang === 'zh' ? 'Switch to English' : '切换至中文'}
          >
            <Languages size={18} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => void persistQuickSetting('theme', settings.theme === 'dark' ? 'light' : 'dark')}
            disabled={savingQuickSetting || saving}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border)] text-amber-500 hover:bg-[var(--bg-secondary)]"
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

      {quickSettingError && (
        <div role="alert" className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-300">
          {quickSettingError}
        </div>
      )}

      <div className="space-y-4">
        {/* API Key */}
        <div className="card p-4">
          <label className="block text-sm font-medium mb-2">{t(lang, 'settings.apiKey')}</label>
          <div className="relative mb-2">
            <input
              ref={apiKeyInputRef}
              type={showKey ? 'text' : 'password'}
              value={settings.apiKey}
              onChange={(e) => updateSetting('apiKey', e.target.value)}
              placeholder={t(lang, 'settings.apiKeyPlaceholder')}
              aria-describedby={apiKeyConsentError ? 'api-key-consent-error' : undefined}
              className="input-field pr-24"
            />
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              className="absolute right-11 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              aria-label={showKey ? (lang === 'zh' ? '隐藏 API Key' : 'Hide API key') : (lang === 'zh' ? '显示 API Key' : 'Show API key')}
            >
              {showKey ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          <p className="text-xs text-[var(--text-secondary)] mb-2">{t(lang, 'settings.apiKeyHelp')}</p>
          <label className="mt-3 flex items-start gap-3 text-sm text-[var(--text-secondary)] cursor-pointer">
            <input
              ref={aiConsentRef}
              type="checkbox"
              checked={settings.aiDataConsent ?? false}
              onChange={(event) => handleConsentChange(event.target.checked)}
              className="mt-1 h-4 w-4"
            />
            <span>
              {lang === 'zh'
                ? '我理解使用 AI 功能会将相关学习内容直接发送至 DeepSeek，并同意进行该传输。'
                : 'I understand that AI features send relevant learning content directly to DeepSeek, and I consent to that transfer.'}
            </span>
          </label>
          {apiKeyConsentError && (
            <p id="api-key-consent-error" role="alert" className="mt-3 text-sm text-red-400">
              {apiKeyConsentError}
            </p>
          )}
          {saved && (
            <p role="status" className="mt-3 flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400">
              <Check size={16} aria-hidden="true" />
              {lang === 'zh' ? 'API Key 验证并保存成功。' : 'API key verified and saved.'}
            </p>
          )}
          <a
            href="https://platform.deepseek.com/api_keys"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 whitespace-nowrap text-sm text-[var(--accent)] hover:underline"
          >
            {t(lang, 'settings.getApiKey')}
            <ArrowUpRight size={15} className="shrink-0" aria-hidden="true" />
          </a>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
        {/* 数据管理 (P0 新增) */}
        <div className="card p-4">
          <button
            onClick={() => {
              setDataStats(getDataStats())
              void loadDbInfo()
              setShowDataManagement(true)
            }}
            className="w-full flex items-center justify-between"
          >
            <div>
              <h3 className="flex items-center gap-2 font-medium text-left">
                <Database size={18} className="text-sky-500" aria-hidden="true" />
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
        </div>

        {/* Save Button */}
        <button
          onClick={handleSave}
          disabled={saving}
          className="btn-primary w-full py-3 flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {saved && <Check size={18} aria-hidden="true" />}
          {saving ? (lang === 'zh' ? '保存中...' : 'Saving...') : saved ? t(lang, 'settings.saved') : t(lang, 'settings.save')}
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

      {showDataManagement && (
        <div className="modal-overlay" onClick={closeDataManagement}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label={lang === 'zh' ? '数据管理' : 'Data Management'}
            className="modal-content max-w-md max-h-[85vh] overflow-y-auto p-5"
            onClick={event => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-4 mb-4">
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
                      ? '当已有学习数据且距离上次成功备份满 7 天时，系统会再次提醒。提醒不会自动保存数据，仍需由你手动导出。'
                      : 'When learning data exists and 7 days have passed since the last successful backup, the system will remind you again. Reminders do not save data automatically.'}
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
                <HardDrive size={20} className="text-violet-500" aria-hidden="true" />
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
                  setImportFile(null)
                  setShowImportModal(true)
                }}
                disabled={migrating || importing || clearingData}
                className="btn-secondary flex flex-1 items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Upload size={16} className="text-sky-500" aria-hidden="true" />
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
                      : 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300'
                }`}
              >
                {dataOperationStatus.message}
              </div>
            )}

            {awaitingBackupConfirmation && (
              <div role="status" className="mt-3 rounded-lg border border-sky-500/40 bg-sky-500/10 p-3 text-sm">
                <p className="font-medium text-sky-700 dark:text-sky-300">
                  {lang === 'zh' ? '请确认备份文件是否已保存' : 'Confirm that the backup file was saved'}
                </p>
                <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
                  {lang === 'zh'
                    ? '下载已经发起，但当前浏览器无法确认文件是否真正保存到本地。请先在下载列表中确认 JSON 文件保存成功，再登记本次备份。'
                    : 'The download started, but this browser cannot confirm that the file was saved locally. Check the JSON file in your downloads before recording this backup.'}
                </p>
                <div className="mt-3 flex gap-2">
                  <button type="button" onClick={recordBackupCompleted} className="btn-primary flex-1 text-sm py-2">
                    {lang === 'zh' ? '确认已保存' : 'Confirm saved'}
                  </button>
                  <button type="button" onClick={() => setAwaitingBackupConfirmation(false)} className="btn-secondary text-sm py-2">
                    {lang === 'zh' ? '未保存' : 'Not saved'}
                  </button>
                </div>
              </div>
            )}

            <p className="mt-3 text-xs text-[var(--text-secondary)] text-center">
              {lang === 'zh'
                ? '只有文件成功保存后才会更新备份时间。API Key 不会被导出。'
                : 'The backup time updates only after the file is saved. Your API key is not exported.'}
            </p>
          </div>
        </div>
      )}

      {/* 数据导入模态框 */}
      {showImportModal && (
        <div className="modal-overlay" onClick={closeImportModal}>
          <div className="modal-content max-w-md" onClick={e => e.stopPropagation()}>
            <h2 className="text-xl font-bold mb-4">
              <span className="flex items-center gap-2">
                <Upload size={20} className="text-sky-500" aria-hidden="true" />
                {lang === 'zh' ? '导入数据' : 'Import Data'}
              </span>
            </h2>

            {/* 文件选择 */}
            <div className="mb-4">
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleImportFileSelect}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="btn-secondary w-full"
              >
                {lang === 'zh' ? '选择备份文件 (.json)' : 'Select backup file (.json)'}
              </button>
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
            <div className="flex gap-2">
              <button
                onClick={closeImportModal}
                className="btn-secondary flex-1"
                disabled={importing}
              >
                {lang === 'zh' ? '取消' : 'Cancel'}
              </button>
              <button
                onClick={handleConfirmImport}
                className="btn-primary flex-1"
                disabled={!importPreview || importing || (!importOptions.importSettings && !importOptions.importBooks)}
              >
                {importing ? (lang === 'zh' ? '导入中...' : 'Importing...') : (lang === 'zh' ? '导入' : 'Import')}
              </button>
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
              <button
                type="button"
                onClick={acceptConsentPolicy}
                disabled={!hasReadConsentPolicy}
                className="btn-primary w-full flex items-center justify-center gap-2"
              >
                <Check size={18} aria-hidden="true" />
                {hasReadConsentPolicy
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
