'use client'

import { useState, useEffect, useRef } from 'react'
import {
  AppSettings,
  CustomQuote,
  getSettings,
  saveSettings,
  Theme,
  downloadDataBackup,
  previewImportData,
  applyImportData,
  getDataStats,
  ExportData
} from '@/lib/store'
import { logger } from '@/lib/logger'
import { Language, t } from '@/lib/i18n'
import { defaultQuotesZh, defaultQuotesEn } from './LoadingQuotes'

// P0 新增：IndexedDB 支持
import {
  getDatabaseStats,
  migrateFromLocalStorage
} from '@/lib/db'

interface Props {
  onSettingsChange: (settings: AppSettings) => void
}

export default function Settings({ onSettingsChange }: Props) {
  const [settings, setSettings] = useState<AppSettings>({
    apiKey: '',
    language: 'zh',
    theme: 'cyber',
    hideApiKeyAlert: false,
    quotes: [],
    quotesInitialized: false
  })
  const [showKey, setShowKey] = useState(false)
  const [saved, setSaved] = useState(false)
  const [newQuoteText, setNewQuoteText] = useState('')
  const [newQuoteAuthor, setNewQuoteAuthor] = useState('')
  const [showQuoteManager, setShowQuoteManager] = useState(false)
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [editText, setEditText] = useState('')
  const [editAuthor, setEditAuthor] = useState('')

  // 数据导出/导入相关状态
  const [showDataManagement, setShowDataManagement] = useState(false)
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
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

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

  useEffect(() => {
    let loaded = getSettings()

    // 始终使用中文金句作为默认
    if (!loaded.quotesInitialized || loaded.quotes.length === 0) {
      loaded = { ...loaded, quotes: [...defaultQuotesZh], quotesInitialized: true }
      saveSettings(loaded)
    }

    setSettings(loaded)

    // 获取数据统计
    if (typeof window !== 'undefined') {
      try {
        setDataStats(getDataStats())
      } catch (e) {
        logger.error('Failed to get data stats:', e)
      }

      // P0 新增：获取 IndexedDB 信息
      loadDbInfo()
    }
  }, [])

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
      console.error('Failed to load DB info:', e)
    }
  }

  // P0 新增：执行迁移
  async function handleMigration() {
    setMigrating(true)
    try {
      const result = await migrateFromLocalStorage()
      if (result.success) {
        localStorage.setItem('feynman-indexedb-just-migrated', 'true')
        await loadDbInfo()
        showToast(
          lang === 'zh'
            ? `迁移成功！已迁移 ${result.migratedBooks} 本书`
            : `Migration successful! ${result.migratedBooks} books migrated`,
          'success'
        )
      } else {
        showToast(
          lang === 'zh'
            ? '迁移部分失败: ' + result.errors.join(', ')
            : 'Migration partially failed: ' + result.errors.join(', '),
          'error'
        )
      }
    } catch (e) {
      showToast(
        lang === 'zh' ? '迁移失败: ' + (e as Error).message : 'Migration failed: ' + (e as Error).message,
        'error'
      )
    } finally {
      setMigrating(false)
    }
  }

  const handleSave = () => {
    saveSettings(settings)
    onSettingsChange(settings)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    showToast('保存成功', 'success')
  }

  const updateSetting = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    const newSettings = { ...settings, [key]: value }
    setSettings(newSettings)
    if (key === 'theme') {
      document.documentElement.setAttribute('data-theme', value as string)
    }
  }

  // 切换语言，直接切换不弹窗
  const handleLanguageChange = (newLang: Language) => {
    const newSettings = { ...settings, language: newLang }
    setSettings(newSettings)
  }

  const addQuote = () => {
    if (!newQuoteText.trim()) return
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
    showToast('已恢复默认金句', 'success')
  }

  // 显示提示消息
  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  // 数据导出
  const handleExport = () => {
    try {
      downloadDataBackup()
      showToast('数据导出成功', 'success')
      setDataStats(getDataStats())
    } catch (e) {
      console.error('Export error:', e)
      showToast('导出失败', 'error')
    }
  }

  // 数据导入 - 选择文件
  const handleImportFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setImportFile(file)
    setImportError(null)

    const reader = new FileReader()
    reader.onload = (event) => {
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
    reader.readAsText(file)
  }

  // 数据导入 - 确认导入
  const handleConfirmImport = async () => {
    if (!importPreview) return

    setImporting(true)
    try {
      applyImportData(importPreview, importOptions)
      showToast('数据导入成功', 'success')

      // 重新加载设置
      const reloaded = getSettings()
      setSettings(reloaded)

      // 更新数据统计
      setDataStats(getDataStats())

      // 关闭模态框
      setShowImportModal(false)
      setImportPreview(null)
      setImportFile(null)
      setImportError(null)

      // 刷新页面以应用更改
      setTimeout(() => window.location.reload(), 500)
    } catch (e) {
      console.error('Import error:', e)
      showToast('导入失败', 'error')
    } finally {
      setImporting(false)
    }
  }

  // 清除所有数据
  const handleClearData = () => {
    if (confirm(settings.language === 'zh'
      ? '确定要清除所有数据吗？此操作不可撤销！'
      : 'Are you sure you want to clear all data? This action cannot be undone!')) {
      localStorage.clear()
      showToast('数据已清除', 'success')
      setTimeout(() => window.location.reload(), 500)
    }
  }

  const lang = settings.language
  const presetCount = settings.quotes.filter(q => q.isPreset).length
  const customCount = settings.quotes.filter(q => !q.isPreset).length

  return (
    <div className="max-w-2xl mx-auto">
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-6 py-3 rounded-xl shadow-lg ${
          toast.type === 'success' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
        }`}>
          {toast.message}
        </div>
      )}

      <h1 className="text-3xl font-bold mb-8">{t(lang, 'settings.title')}</h1>

      <div className="space-y-6">
        {/* API Key */}
        <div className="card">
          <label className="block text-sm font-medium mb-2">{t(lang, 'settings.apiKey')}</label>
          <div className="relative mb-2">
            <input
              type={showKey ? 'text' : 'password'}
              value={settings.apiKey}
              onChange={(e) => updateSetting('apiKey', e.target.value)}
              placeholder={t(lang, 'settings.apiKeyPlaceholder')}
              className="input-field pr-12"
            />
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            >
              {showKey ? '🙈' : '👁️'}
            </button>
          </div>
          <p className="text-sm text-[var(--text-secondary)] mb-2">{t(lang, 'settings.apiKeyHelp')}</p>
          <a
            href="https://platform.deepseek.com/api_keys"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-[var(--accent)] hover:underline"
          >
            {t(lang, 'settings.getApiKey')} →
          </a>
        </div>

        {/* Language */}
        <div className="card">
          <label className="block text-sm font-medium mb-3">{t(lang, 'settings.language')}</label>
          <div className="flex gap-3">
            {(['zh', 'en'] as Language[]).map((l) => (
              <button
                key={l}
                onClick={() => handleLanguageChange(l)}
                className={`px-6 py-3 rounded-xl transition-all ${
                  settings.language === l
                    ? 'bg-[var(--accent)] text-white'
                    : 'bg-[var(--bg-secondary)] hover:bg-[var(--border)]'
                }`}
              >
                {l === 'zh' ? '中文' : 'English'}
              </button>
            ))}
          </div>
        </div>

        {/* Theme */}
        <div className="card">
          <label className="block text-sm font-medium mb-3">{t(lang, 'settings.theme')}</label>
          <div className="flex gap-3">
            {([
              { value: 'cyber', label: t(lang, 'settings.themeCyber'), color: '#38bdf8' },
              { value: 'dark', label: t(lang, 'settings.themeDark'), color: '#64748b' },
              { value: 'light', label: t(lang, 'settings.themeLight'), color: '#f8fafc' }
            ] as { value: Theme; label: string; color: string }[]).map((theme) => (
              <button
                key={theme.value}
                onClick={() => updateSetting('theme', theme.value)}
                className={`flex items-center gap-2 px-6 py-3 rounded-xl transition-all ${
                  settings.theme === theme.value
                    ? 'bg-[var(--accent)] text-white'
                    : 'bg-[var(--bg-secondary)] hover:bg-[var(--border)]'
                }`}
              >
                <span
                  className="w-4 h-4 rounded-full border-2"
                  style={{ backgroundColor: theme.color, borderColor: theme.color }}
                />
                {theme.label}
              </button>
            ))}
          </div>
        </div>

        {/* 数据管理 (P0 新增) */}
        <div className="card">
          <button
            onClick={() => {
              setShowDataManagement(!showDataManagement)
              if (!showDataManagement) {
                setDataStats(getDataStats())
              }
            }}
            className="w-full flex items-center justify-between"
          >
            <div>
              <h3 className="font-medium text-left">
                {lang === 'zh' ? '💾 数据管理' : '💾 Data Management'}
              </h3>
              <p className="text-sm text-[var(--text-secondary)] text-left">
                {lang === 'zh'
                  ? `共 ${dataStats.totalBooks} 本书，数据大小 ${dataStats.dataSize}`
                  : `${dataStats.totalBooks} books, ${dataStats.dataSize}`}
              </p>
            </div>
            <span className={`transition-transform ${showDataManagement ? 'rotate-180' : ''}`}>▼</span>
          </button>

          {showDataManagement && (
            <div className="mt-4 pt-4 border-t border-[var(--border)] space-y-3">
              {/* P0 新增：存储类型显示 */}
              <div className="flex items-center justify-between p-3 bg-[var(--bg-secondary)] rounded-lg">
                <div className="flex items-center gap-2">
                  <span className="text-lg">
                    {dbInfo.usingIndexedDB ? '🗄️' : '💾'}
                  </span>
                  <div>
                    <div className="text-sm font-medium">
                      {lang === 'zh' ? '存储方式' : 'Storage'}
                    </div>
                    <div className="text-xs text-[var(--text-secondary)]">
                      {dbInfo.usingIndexedDB
                        ? (lang === 'zh' ? 'IndexedDB (大容量)' : 'IndexedDB (Large Capacity)')
                        : (lang === 'zh' ? 'LocalStorage (兼容模式)' : 'LocalStorage (Legacy Mode)')
                      }
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
                      : (lang === 'zh' ? '升级到 IndexedDB' : 'Upgrade to IndexedDB')
                    }
                  </button>
                )}
              </div>

              {/* 数据统计 */}
              <div className="grid grid-cols-2 gap-3 text-sm">
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
              </div>

              {/* 操作按钮 */}
              <div className="flex gap-2">
                <button
                  onClick={handleExport}
                  className="btn-secondary flex-1"
                >
                  📥 {lang === 'zh' ? '导出数据' : 'Export'}
                </button>
                <button
                  onClick={() => setShowImportModal(true)}
                  className="btn-secondary flex-1"
                >
                  📤 {lang === 'zh' ? '导入数据' : 'Import'}
                </button>
                <button
                  onClick={handleClearData}
                  className="px-4 py-2 text-red-400 border border-red-400/30 rounded-xl hover:bg-red-400/10"
                >
                  🗑️
                </button>
              </div>

              <p className="text-xs text-[var(--text-secondary)] text-center">
                {lang === 'zh'
                  ? '导出数据可备份到本地，导入可恢复数据。清除数据将删除所有内容。'
                  : 'Export to backup locally, import to restore. Clear data will delete everything.'}
              </p>
            </div>
          )}
        </div>

        {/* Quote Manager */}
        <div className="card">
          <button
            onClick={() => setShowQuoteManager(!showQuoteManager)}
            className="w-full flex items-center justify-between"
          >
            <div>
              <h3 className="font-medium text-left">
                {lang === 'zh' ? '💬 金句管理' : '💬 Quote Manager'}
              </h3>
              <p className="text-sm text-[var(--text-secondary)] text-left">
                {lang === 'zh'
                  ? `共 ${settings.quotes.length} 条（预设 ${presetCount}，自定义 ${customCount}）`
                  : `Total ${settings.quotes.length} (${presetCount} preset, ${customCount} custom)`}
              </p>
            </div>
            <span className={`transition-transform ${showQuoteManager ? 'rotate-180' : ''}`}>▼</span>
          </button>

          {showQuoteManager && (
            <div className="mt-4 pt-4 border-t border-[var(--border)]">
              {/* Add New Quote */}
              <div className="mb-4 p-4 bg-[var(--bg-secondary)] rounded-xl">
                <h4 className="text-sm font-medium mb-2">
                  {lang === 'zh' ? '➕ 添加新金句' : '➕ Add New Quote'}
                </h4>
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
                  <button
                    onClick={addQuote}
                    disabled={!newQuoteText.trim()}
                    className="btn-primary"
                  >
                    {lang === 'zh' ? '添加' : 'Add'}
                  </button>
                </div>
              </div>

              {/* Quotes List */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-medium">
                    {lang === 'zh' ? '📝 金句列表' : '📝 Quote List'}
                  </h4>
                  <button
                    onClick={resetToDefault}
                    className="text-xs text-[var(--accent)] hover:underline"
                  >
                    {lang === 'zh' ? '恢复默认' : 'Reset to Default'}
                  </button>
                </div>

                {settings.quotes.length === 0 ? (
                  <p className="text-sm text-[var(--text-secondary)] text-center py-4">
                    {lang === 'zh' ? '暂无金句，请添加或恢复默认' : 'No quotes, please add or reset'}
                  </p>
                ) : (
                  <div className="space-y-2 max-h-[400px] overflow-y-auto">
                    {settings.quotes.map((quote, idx) => (
                      <div key={idx} className="bg-[var(--bg-secondary)] rounded-xl p-3">
                        {editingIndex === idx ? (
                          // 编辑模式
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
                          // 显示模式
                          <div className="flex items-start gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                {quote.isPreset && (
                                  <span className="text-xs bg-[var(--accent)]/20 text-[var(--accent)] px-2 py-0.5 rounded">
                                    {lang === 'zh' ? '预设' : 'Preset'}
                                  </span>
                                )}
                              </div>
                              <p className="text-sm">"{quote.text}"</p>
                              <p className="text-xs text-[var(--text-secondary)] mt-1">— {quote.author}</p>
                            </div>
                            <div className="flex gap-1 shrink-0">
                              <button
                                onClick={() => startEdit(idx)}
                                className="text-[var(--accent)] hover:bg-[var(--accent)]/10 p-1.5 rounded"
                                title={lang === 'zh' ? '编辑' : 'Edit'}
                              >
                                ✏️
                              </button>
                              <button
                                onClick={() => removeQuote(idx)}
                                className="text-red-400 hover:bg-red-400/10 p-1.5 rounded"
                                title={lang === 'zh' ? '删除' : 'Delete'}
                              >
                                🗑️
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
          )}
        </div>

        {/* Save Button */}
        <button onClick={handleSave} className="btn-primary w-full">
          {saved ? '✓ ' + t(lang, 'settings.saved') : t(lang, 'settings.save')}
        </button>

        {/* P0 新增：隐私政策链接 */}
        <div className="text-center mt-6 text-sm text-[var(--text-secondary)]">
          <a
            href="/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--accent)] hover:underline"
          >
            {lang === 'zh' ? '📋 隐私政策' : '📋 Privacy Policy'}
          </a>
        </div>
      </div>

      {/* 数据导入模态框 */}
      {showImportModal && (
        <div className="modal-overlay" onClick={() => setShowImportModal(false)}>
          <div className="modal-content max-w-md" onClick={e => e.stopPropagation()}>
            <h2 className="text-xl font-bold mb-4">
              {lang === 'zh' ? '📤 导入数据' : '📤 Import Data'}
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
                onClick={() => {
                  setShowImportModal(false)
                  setImportPreview(null)
                  setImportError(null)
                  setImportFile(null)
                }}
                className="btn-secondary flex-1"
                disabled={importing}
              >
                {lang === 'zh' ? '取消' : 'Cancel'}
              </button>
              <button
                onClick={handleConfirmImport}
                className="btn-primary flex-1"
                disabled={!importPreview || importing}
              >
                {importing ? (lang === 'zh' ? '导入中...' : 'Importing...') : (lang === 'zh' ? '导入' : 'Import')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
