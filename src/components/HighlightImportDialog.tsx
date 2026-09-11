'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Language } from '@/lib/i18n'
import { logger } from '@/lib/logger'
import {
  HighlightExportFormat,
  ImportAdapterKind,
  ImportAdapterError,
  ImportBookCandidate,
  ImportedHighlight,
  MAX_IMPORT_HIGHLIGHTS,
  PLATFORM_CAPABILITIES,
  PLATFORM_CAPABILITY_GROUP_ORDER,
  fetchReadwiseBooks,
  fetchZoteroAnnotations,
  getPlatformCapability,
  parseHighlightExport,
  toImportedNoteRecords
} from '@/lib/importAdapters'
import { flushPendingStoreWrites, getBook, getBooks, reloadBookFromPersistence, updateBook } from '@/lib/store'
import { MAX_NOTE_LENGTH } from '@/lib/dataLimits'
import AppIcon from './AppIcon'
import { useAccountAccess } from './AuthGuard'

interface Props {
  lang: Language
  /** 指定目标书籍时（例如从阅读页进入）跳过选书步骤。 */
  targetBookId?: string
  onImported?: (bookId: string, importedCount: number) => void
  onClose: () => void
}

type ImportTab = 'api' | 'text' | 'platforms'

type SourceKind = 'readwise' | 'zotero' | 'export'

const MAX_EXPORT_FILE_BYTES = 5 * 1024 * 1024

const TEXT_FORMATS: {
  value: HighlightExportFormat
  zh: string
  en: string
  hintZh: string
  hintEn: string
  /** 对应平台支持说明里的条目，用于展示官方导出步骤与链接。 */
  platformId?: string
}[] = [
  { value: 'wechat', zh: '微信读书', en: 'WeChat Reading', hintZh: '「我 → 笔记 → 导出笔记」的 TXT 内容', hintEn: 'TXT from “Me → Notes → Export notes”', platformId: 'wechat-reading' },
  { value: 'kindle', zh: 'Kindle', en: 'Kindle', hintZh: 'Notebook 导出或 My Clippings.txt', hintEn: 'Notebook export or My Clippings.txt', platformId: 'kindle' },
  { value: 'appleBooks', zh: 'Apple Books', en: 'Apple Books', hintZh: 'App 内分享出的引号笔记文本', hintEn: 'Quoted note text shared from the app', platformId: 'apple-books' },
  { value: 'markdown', zh: 'Markdown', en: 'Markdown', hintZh: '> 原文，- 笔记，## 章节', hintEn: '> quote, - note, ## chapter' },
  { value: 'csv', zh: 'CSV', en: 'CSV', hintZh: '表头含 quote / note / chapter', hintEn: 'Header with quote / note / chapter' },
  { value: 'plain', zh: '纯文本', en: 'Plain text', hintZh: '空行分段的段落各算一条划线', hintEn: 'Each blank-line separated paragraph becomes a highlight' }
]

function kindLabel(kind: string, lang: Language): string {
  if (kind === 'api') return lang === 'zh' ? '官方 API' : 'Official API'
  if (kind === 'export') return lang === 'zh' ? '官方导出导入' : 'Official export'
  return lang === 'zh' ? '暂不接入' : 'Not supported'
}

function kindClass(kind: string): string {
  if (kind === 'api') return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
  if (kind === 'export') return 'bg-[var(--accent)]/15 text-[var(--accent)]'
  return 'bg-red-500/10 text-red-600 dark:text-red-300'
}

function groupTitle(kind: ImportAdapterKind, lang: Language): string {
  if (kind === 'api') return lang === 'zh' ? '官方 API 直连' : 'Official APIs'
  if (kind === 'export') return lang === 'zh' ? '官方导出导入' : 'Official exports'
  return lang === 'zh' ? '暂不接入' : 'Not integrated'
}

function normalizeKey(value: string | undefined): string {
  return (value || '').replace(/\s+/g, ' ').trim()
}

export default function HighlightImportDialog({ lang, targetBookId, onImported, onClose }: Props) {
  const { isAuthenticated, requestLogin } = useAccountAccess()
  const [tab, setTab] = useState<ImportTab>('api')
  const [books, setBooks] = useState(() => getBooks())
  const [targetId, setTargetId] = useState(targetBookId || '')
  const [pending, setPending] = useState<ImportedHighlight[]>([])
  const [sourceKind, setSourceKind] = useState<SourceKind | null>(null)
  const [sourceLabel, setSourceLabel] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)

  // Readwise
  const [readwiseToken, setReadwiseToken] = useState('')
  const [readwiseQuery, setReadwiseQuery] = useState('')
  const [readwiseBooks, setReadwiseBooks] = useState<ImportBookCandidate[]>([])
  const [readwiseLoading, setReadwiseLoading] = useState(false)

  // Zotero
  const [zoteroKey, setZoteroKey] = useState('')
  const [zoteroUserId, setZoteroUserId] = useState('')
  const [zoteroLoading, setZoteroLoading] = useState(false)

  // 导入文本（笔记来源 + 粘贴 / 上传）
  const [textFormat, setTextFormat] = useState<HighlightExportFormat>('wechat')
  const [rawText, setRawText] = useState('')
  const [parsing, setParsing] = useState(false)

  const abortRef = useRef<AbortController | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const importInFlightRef = useRef(false)

  useEffect(() => () => {
    abortRef.current?.abort()
  }, [])

  const targetBook = useMemo(() => books.find(book => book.id === targetId), [books, targetId])

  const selectedTextSource = useMemo(
    () => getPlatformCapability(TEXT_FORMATS.find(item => item.value === textFormat)?.platformId || ''),
    [textFormat]
  )

  useEffect(() => {
    if (books.length === 0) return
    if (targetId && books.some(book => book.id === targetId)) return
    setTargetId(books[0].id)
  }, [books, targetId])

  const resetPending = () => {
    setPending([])
    setSourceKind(null)
    setSourceLabel('')
  }

  const handleError = (value: unknown, fallback: string) => {
    if (value instanceof ImportAdapterError) {
      setError(value.message)
      return
    }
    logger.error('Highlight import failed:', value)
    setError(value instanceof Error && value.message ? value.message : fallback)
  }

  const handleLoadReadwise = async () => {
    if (readwiseLoading) return
    setError(null)
    setNotice(null)
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setReadwiseLoading(true)
    try {
      const result = await fetchReadwiseBooks({
        token: readwiseToken,
        query: readwiseQuery,
        signal: controller.signal
      })
      if (abortRef.current !== controller) return
      setReadwiseBooks(result)
      if (result.length === 0) {
        setNotice(lang === 'zh' ? '没有找到匹配的书籍或划线。' : 'No matching books or highlights were found.')
      }
    } catch (loadError) {
      if (abortRef.current !== controller) return
      handleError(loadError, lang === 'zh' ? 'Readwise 读取失败，请检查网络后重试。' : 'Reading Readwise failed. Check your connection and retry.')
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null
        setReadwiseLoading(false)
      }
    }
  }

  const handleSelectReadwiseBook = (candidate: ImportBookCandidate) => {
    if (candidate.highlights.length === 0) {
      setError(lang === 'zh' ? '这本书在 Readwise 里还没有划线。' : 'This book has no highlights in Readwise yet.')
      return
    }
    setError(null)
    setPending(candidate.highlights)
    setSourceKind('readwise')
    setSourceLabel(candidate.title)
    const matched = books.find(book => normalizeKey(book.name) === normalizeKey(candidate.title))
    if (matched) setTargetId(matched.id)
    setNotice(lang === 'zh'
      ? `已读取《${candidate.title}》的 ${candidate.highlights.length} 条划线，确认后导入。`
      : `Loaded ${candidate.highlights.length} highlights from “${candidate.title}”. Confirm to import.`)
  }

  const handleLoadZotero = async () => {
    if (zoteroLoading) return
    setError(null)
    setNotice(null)
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setZoteroLoading(true)
    try {
      const highlights = await fetchZoteroAnnotations({
        apiKey: zoteroKey,
        userId: zoteroUserId,
        signal: controller.signal
      })
      if (abortRef.current !== controller) return
      if (highlights.length === 0) {
        setNotice(lang === 'zh' ? '这个账号下没有找到批注。' : 'No annotations were found for this account.')
        return
      }
      setPending(highlights)
      setSourceKind('zotero')
      setSourceLabel('Zotero')
      setNotice(lang === 'zh'
        ? `已读取 ${highlights.length} 条 Zotero 批注，确认后导入。`
        : `Loaded ${highlights.length} Zotero annotations. Confirm to import.`)
    } catch (loadError) {
      if (abortRef.current !== controller) return
      handleError(loadError, lang === 'zh' ? 'Zotero 读取失败，请检查网络后重试。' : 'Reading Zotero failed. Check your connection and retry.')
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null
        setZoteroLoading(false)
      }
    }
  }

  const handleText = (text: string, label: string) => {
    setError(null)
    setNotice(null)
    const highlights = parseHighlightExport(text, textFormat)
    if (highlights.length === 0) {
      setPending([])
      setError(lang === 'zh'
        ? '没有解析到划线或笔记，请确认导出格式与所选的平台一致。'
        : 'No highlights or notes were parsed. Make sure the export format matches the selected platform.')
      return
    }
    setPending(highlights)
    setSourceKind('export')
    setSourceLabel(label)
    setNotice(lang === 'zh'
      ? `已解析 ${highlights.length} 条划线 / 笔记，确认后导入。`
      : `Parsed ${highlights.length} highlights/notes. Confirm to import.`)
  }

  const handleTextFile = async (file: File) => {
    if (file.size > MAX_EXPORT_FILE_BYTES) {
      setError(lang === 'zh'
        ? `导出文件请控制在 ${Math.round(MAX_EXPORT_FILE_BYTES / 1024 / 1024)}MB 以内。`
        : `Keep the export file under ${Math.round(MAX_EXPORT_FILE_BYTES / 1024 / 1024)}MB.`)
      return
    }
    setParsing(true)
    try {
      const text = await file.text()
      handleText(text, file.name)
    } catch (readError) {
      handleError(readError, lang === 'zh' ? '读取文件失败，请重试。' : 'Reading the file failed. Please retry.')
    } finally {
      setParsing(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleImport = async () => {
    if (importInFlightRef.current) return
    if (!isAuthenticated) {
      requestLogin(lang === 'zh'
        ? '登录后才能把外部划线导入书架并用于费曼练习。'
        : 'Sign in to import highlights into your library for Feynman practice.')
      return
    }
    if (!targetId) {
      setError(lang === 'zh' ? '请先选择要导入到哪本书。' : 'Choose the book to import into first.')
      return
    }
    const book = getBook(targetId)
    if (!book) {
      setError(lang === 'zh' ? '目标书籍不存在，请重新选择。' : 'The target book no longer exists. Please choose again.')
      setBooks(getBooks())
      return
    }
    if (pending.length === 0) {
      setError(lang === 'zh' ? '请先解析或拉取划线。' : 'Parse or fetch highlights first.')
      return
    }

    importInFlightRef.current = true
    setImporting(true)
    setError(null)
    setNotice(null)
    try {
      const existing = new Set(book.noteRecords.map(record => normalizeKey(record.quote)).filter(Boolean))
      const fresh = pending.filter(highlight => {
        const key = normalizeKey(highlight.quote)
        if (!key) return Boolean(normalizeKey(highlight.note))
        return !existing.has(key)
      })
      if (fresh.length === 0) {
        setNotice(lang === 'zh'
          ? '这些划线都已经在这本书里了，无需重复导入。'
          : 'These highlights are already in this book; nothing to import.')
        return
      }

      const records = toImportedNoteRecords(fresh, {
        chapters: book.chapters,
        maxRecords: MAX_IMPORT_HIGHLIGHTS
      }).map(record => ({
        ...record,
        content: record.content.slice(0, MAX_NOTE_LENGTH),
        ...(record.quote ? { quote: record.quote.slice(0, MAX_NOTE_LENGTH) } : {})
      }))
      if (records.length === 0) {
        setError(lang === 'zh' ? '没有可导入的划线，请检查内容后重试。' : 'No importable highlights were found.')
        return
      }

      updateBook(book.id, { noteRecords: [...book.noteRecords, ...records] })
      await flushPendingStoreWrites()
      const persisted = getBook(book.id)
      if (persisted) setBooks(getBooks())
      onImported?.(book.id, records.length)
      setNotice(lang === 'zh'
        ? `已把 ${records.length} 条划线 / 笔记导入《${book.name}》，可在「我的笔记」里查看并回到原文核对。`
        : `Imported ${records.length} highlights/notes into “${book.name}”. Open Notes to review them against the source.`)
      resetPending()
    } catch (importError) {
      await reloadBookFromPersistence(targetId).catch(() => undefined)
      setBooks(getBooks())
      logger.error('Highlight import save failed:', importError)
      setError(lang === 'zh'
        ? '导入保存失败，原有数据未改动，请稍后重试。'
        : 'Saving the import failed. Existing data was left untouched; please retry.')
    } finally {
      importInFlightRef.current = false
      setImporting(false)
    }
  }

  const tabs: { key: ImportTab; label: string; icon: Parameters<typeof AppIcon>[0]['name'] }[] = [
    { key: 'api', label: lang === 'zh' ? '官方 API' : 'Official API', icon: 'key' },
    { key: 'text', label: lang === 'zh' ? '导入文本' : 'Import text', icon: 'clipboard' },
    { key: 'platforms', label: lang === 'zh' ? '平台支持说明' : 'Platform support', icon: 'info' }
  ]

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content product-dialog max-h-[calc(100dvh-32px)]" onClick={event => event.stopPropagation()}>
        <div className="product-dialog-header">
          <div className="product-dialog-title">
            <span className="product-dialog-title-icon"><AppIcon name="note" size={19} /></span>
            <div>
              <h2>{lang === 'zh' ? '导入笔记' : 'Import notes'}</h2>
              <p>{lang === 'zh'
                ? '把其他阅读器里的划线和笔记导入书架，与站内阅读一起用于费曼练习'
                : 'Bring highlights and notes from other readers into your library for Feynman practice'}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} disabled={importing} className="icon-button shrink-0" aria-label={lang === 'zh' ? '关闭导入窗口' : 'Close import dialog'}>
            <AppIcon name="close" size={20} />
          </button>
        </div>

        <div className="product-dialog-body">
          <div className="mb-4 flex gap-1 rounded-lg bg-[var(--bg-secondary)] p-1">
            {tabs.map(item => (
              <button
                key={item.key}
                type="button"
                onClick={() => setTab(item.key)}
                className={`flex min-h-10 flex-1 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium transition-colors ${
                  tab === item.key ? 'bg-[var(--bg-card)] text-[var(--accent)] shadow-sm' : 'text-[var(--text-secondary)]'
                }`}
              >
                <AppIcon name={item.icon} size={16} />
                <span className="truncate">{item.label}</span>
              </button>
            ))}
          </div>

          {tab === 'api' && (
            <div className="space-y-4">
              <div className="product-dialog-callout rounded-lg p-3 text-xs leading-5">
                {lang === 'zh'
                  ? '只接入官方开放的接口：Readwise 与 Zotero 均提供个人开发者可用的官方 API，令牌只保存在当前浏览器，不会上传到本平台服务器。微信读书、Kindle、Apple Books 等没有开放接口的平台请使用「导入文本」。'
                  : 'Only official APIs are used: Readwise and Zotero both offer developer APIs for individuals. Tokens stay in this browser and are never uploaded to this service. Platforms without an open API (WeChat Reading, Kindle, Apple Books) use “Import text”.'}
              </div>

              <div className="product-dialog-section">
                <label className="product-dialog-label">Readwise</label>
                <p className="mb-2 text-xs text-[var(--text-secondary)]">
                  {lang === 'zh'
                    ? '在 readwise.io/access_token 生成个人访问令牌，即可读取全部书籍、划线与笔记。'
                    : 'Create a personal token at readwise.io/access_token to read all books, highlights, and notes.'}
                </p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <input
                    type="password"
                    value={readwiseToken}
                    onChange={event => setReadwiseToken(event.target.value)}
                    autoComplete="off"
                    className="input-field w-full"
                    placeholder={lang === 'zh' ? 'Readwise 访问令牌' : 'Readwise access token'}
                    aria-label={lang === 'zh' ? 'Readwise 访问令牌' : 'Readwise access token'}
                  />
                  <input
                    type="text"
                    value={readwiseQuery}
                    onChange={event => setReadwiseQuery(event.target.value)}
                    className="input-field w-full"
                    placeholder={lang === 'zh' ? '按书名筛选（可选）' : 'Filter by title (optional)'}
                    aria-label={lang === 'zh' ? '按书名筛选' : 'Filter by title'}
                  />
                </div>
                <button
                  type="button"
                  onClick={handleLoadReadwise}
                  disabled={readwiseLoading || !readwiseToken.trim()}
                  className="btn-secondary product-dialog-action mt-3 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <AppIcon name="refresh" tone="blue" size={16} />
                  {readwiseLoading
                    ? (lang === 'zh' ? '正在读取...' : 'Loading...')
                    : (lang === 'zh' ? '读取我的 Readwise 书籍' : 'Load my Readwise books')}
                </button>

                {readwiseBooks.length > 0 && (
                  <div className="mt-3 max-h-56 space-y-2 overflow-y-auto">
                    {readwiseBooks.map(candidate => (
                      <button
                        key={candidate.externalId}
                        type="button"
                        onClick={() => handleSelectReadwiseBook(candidate)}
                        className="flex w-full items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-left text-sm hover:border-[var(--accent)]"
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-[var(--text-primary)]">{candidate.title}</span>
                          <span className="block truncate text-xs text-[var(--text-secondary)]">
                            {[candidate.author, lang === 'zh'
                              ? `${candidate.highlightCount ?? candidate.highlights.length} 条划线`
                              : `${candidate.highlightCount ?? candidate.highlights.length} highlights`].filter(Boolean).join(' · ')}
                          </span>
                        </span>
                        <AppIcon name="chevronRight" tone="muted" size={16} />
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="product-dialog-section">
                <label className="product-dialog-label">Zotero</label>
                <p className="mb-2 text-xs text-[var(--text-secondary)]">
                  {lang === 'zh'
                    ? '在 zotero.org/settings/keys 创建个人 API Key（勾选读取权限），可导入 PDF 批注与笔记。'
                    : 'Create a personal API key with read access at zotero.org/settings/keys to import PDF annotations and notes.'}
                </p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <input
                    type="password"
                    value={zoteroKey}
                    onChange={event => setZoteroKey(event.target.value)}
                    autoComplete="off"
                    className="input-field w-full"
                    placeholder={lang === 'zh' ? 'Zotero API Key' : 'Zotero API key'}
                    aria-label={lang === 'zh' ? 'Zotero API Key' : 'Zotero API key'}
                  />
                  <input
                    type="text"
                    value={zoteroUserId}
                    onChange={event => setZoteroUserId(event.target.value)}
                    autoComplete="off"
                    className="input-field w-full"
                    placeholder={lang === 'zh' ? 'Zotero 用户 ID（数字）' : 'Zotero user ID (numeric)'}
                    aria-label={lang === 'zh' ? 'Zotero 用户 ID' : 'Zotero user ID'}
                  />
                </div>
                <button
                  type="button"
                  onClick={handleLoadZotero}
                  disabled={zoteroLoading || !zoteroKey.trim() || !zoteroUserId.trim()}
                  className="btn-secondary product-dialog-action mt-3 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <AppIcon name="refresh" tone="violet" size={16} />
                  {zoteroLoading
                    ? (lang === 'zh' ? '正在读取...' : 'Loading...')
                    : (lang === 'zh' ? '读取我的 Zotero 批注' : 'Load my Zotero annotations')}
                </button>
              </div>
            </div>
          )}

          {tab === 'text' && (
            <div className="space-y-4">
              <div className="product-dialog-section">
                <label className="product-dialog-label" htmlFor="highlight-import-source">
                  {lang === 'zh' ? '笔记来源' : 'Note source'}
                </label>
                <select
                  id="highlight-import-source"
                  value={textFormat}
                  onChange={event => setTextFormat(event.target.value as HighlightExportFormat)}
                  className="input-field w-full"
                >
                  {TEXT_FORMATS.map(item => (
                    <option key={item.value} value={item.value}>
                      {lang === 'zh' ? `${item.zh}（${item.hintZh}）` : `${item.en} (${item.hintEn})`}
                    </option>
                  ))}
                </select>
                {selectedTextSource && (
                  <div className="mt-2 rounded-lg bg-[var(--bg-secondary)] p-3 text-xs leading-5 text-[var(--text-secondary)]">
                    {selectedTextSource.guideZh || selectedTextSource.guideEn ? (
                      <p>
                        <span className="font-medium text-[var(--text-primary)]">
                          {lang === 'zh' ? '导出步骤：' : 'Export steps: '}
                        </span>
                        {lang === 'zh' ? selectedTextSource.guideZh : selectedTextSource.guideEn}
                      </p>
                    ) : null}
                    {selectedTextSource.officialUrl && (
                      <a
                        href={selectedTextSource.officialUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 inline-flex items-center gap-1 text-[var(--accent)] hover:underline"
                      >
                        <AppIcon name="externalLink" size={13} />
                        {lang === 'zh'
                          ? selectedTextSource.officialUrlLabelZh || '官方导出说明'
                          : selectedTextSource.officialUrlLabelEn || 'Official export guide'}
                      </a>
                    )}
                  </div>
                )}
              </div>

              <div className="product-dialog-section">
                <label className="product-dialog-label" htmlFor="highlight-import-text">
                  {lang === 'zh' ? '粘贴笔记内容' : 'Paste notes'}
                </label>
                <textarea
                  id="highlight-import-text"
                  value={rawText}
                  onChange={event => setRawText(event.target.value)}
                  rows={7}
                  className="input-field min-h-[140px] w-full resize-y"
                  placeholder={lang === 'zh'
                    ? '把导出的笔记文本粘贴到这里，然后点击「解析内容」'
                    : 'Paste the exported notes here, then choose “Parse text”'}
                />
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => handleText(rawText, lang === 'zh' ? '粘贴的笔记文本' : 'Pasted notes')}
                    disabled={parsing || !rawText.trim()}
                    className="btn-secondary product-dialog-action disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <AppIcon name="scan" tone="blue" size={16} />
                    {lang === 'zh' ? '解析内容' : 'Parse text'}
                  </button>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={parsing}
                    className="btn-secondary product-dialog-action disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <AppIcon name="folder" tone="violet" size={16} />
                    {parsing ? (lang === 'zh' ? '读取中...' : 'Reading...') : (lang === 'zh' ? '选择笔记文件' : 'Choose notes file')}
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".txt,.md,.markdown,.csv,.html,.htm,text/plain,text/markdown,text/csv"
                    onChange={event => {
                      const file = event.target.files?.[0]
                      if (file) void handleTextFile(file)
                    }}
                    className="hidden"
                    aria-label={lang === 'zh' ? '选择笔记文件' : 'Choose notes file'}
                  />
                </div>
              </div>

              <div className="product-dialog-callout rounded-lg p-3 text-xs leading-5">
                {lang === 'zh'
                  ? '导入的笔记只用于你自己的学习与 AI 核对。带有账号 Cookie、模拟登录或逆向抓取的第三方工具不符合平台条款，本项目不会接入；各平台的官方导出方式见「平台支持说明」。'
                  : 'Imported notes are used only for your own study and AI verification. Tools that rely on cookies, scripted logins, or scraping violate platform terms and are not supported. See “Platform support” for each official export path.'}
              </div>
            </div>
          )}

          {tab === 'platforms' && (
            <div className="space-y-4">
              <div className="product-dialog-callout rounded-lg p-3 text-xs leading-5">
                {lang === 'zh'
                  ? '接入原则：只使用平台官方提供的能力。开放官方 API 的直接读取（令牌只保存在当前浏览器）；只有官方导出的，按下面的步骤导出后导入。没有官方途径的平台一律不接入。'
                  : 'Only official capabilities are used. Platforms with an official API are read directly (tokens stay in this browser); platforms with exports only are imported following the steps below. Platforms without an official path are not integrated.'}
              </div>

              {PLATFORM_CAPABILITY_GROUP_ORDER.map(kind => {
                const platforms = PLATFORM_CAPABILITIES.filter(platform => platform.kind === kind)
                if (platforms.length === 0) return null
                return (
                  <div key={kind} className="space-y-2">
                    <h3 className="text-xs font-semibold tracking-wide text-[var(--text-secondary)]">
                      {groupTitle(kind, lang)}
                    </h3>
                    {platforms.map(platform => {
                      const requirement = lang === 'zh' ? platform.requirementZh : platform.requirementEn
                      const guide = lang === 'zh' ? platform.guideZh : platform.guideEn
                      const linkLabel = lang === 'zh'
                        ? platform.officialUrlLabelZh || '官方导出说明'
                        : platform.officialUrlLabelEn || 'Official export guide'
                      return (
                        <div key={platform.id} className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-3">
                          <div className="flex items-center justify-between gap-3">
                            <span className="font-medium text-[var(--text-primary)]">{platform.name}</span>
                            <span className={`shrink-0 rounded px-2 py-0.5 text-xs ${kindClass(platform.kind)}`}>
                              {kindLabel(platform.kind, lang)}
                            </span>
                          </div>
                          <p className="mt-1.5 text-sm leading-6 text-[var(--text-secondary)]">
                            {lang === 'zh' ? platform.detailZh : platform.detailEn}
                          </p>
                          {requirement && (
                            <p className="mt-1 text-xs text-[var(--text-secondary)]">{requirement}</p>
                          )}
                          {guide && (
                            <p className="mt-2 text-xs leading-5 text-[var(--text-secondary)]">
                              <span className="font-medium text-[var(--text-primary)]">
                                {kind === 'api'
                                  ? (lang === 'zh' ? '接入步骤：' : 'Setup steps: ')
                                  : (lang === 'zh' ? '导出步骤：' : 'Export steps: ')}
                              </span>
                              {guide}
                            </p>
                          )}
                          {platform.officialUrl && (
                            <a
                              href={platform.officialUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="mt-2 inline-flex items-center gap-1 text-xs text-[var(--accent)] hover:underline"
                            >
                              <AppIcon name="externalLink" size={13} />
                              {linkLabel}
                            </a>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          )}

          {error && (
            <div role="alert" className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-500">
              {error}
            </div>
          )}
          {notice && (
            <div role="status" className="product-dialog-status-warning mt-4 rounded-lg px-3 py-2 text-sm">
              {notice}
            </div>
          )}
          {pending.length > 0 && sourceKind && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-xs text-[var(--text-secondary)]">
              <span className="min-w-0 truncate">
                {lang === 'zh'
                  ? `待导入来源：${sourceKind === 'readwise' ? 'Readwise' : sourceKind === 'zotero' ? 'Zotero' : '官方导出'} · ${sourceLabel}`
                  : `Pending source: ${sourceKind === 'readwise' ? 'Readwise' : sourceKind === 'zotero' ? 'Zotero' : 'Official export'} · ${sourceLabel}`}
              </span>
              <span className="shrink-0">
                {lang === 'zh' ? `${pending.length} 条划线 / 笔记` : `${pending.length} highlights/notes`}
              </span>
            </div>
          )}
        </div>

        <div className="product-dialog-footer">
          <div className="mr-auto flex min-w-0 flex-1 items-center gap-2">
            {tab !== 'platforms' && books.length > 0 && (
              <>
                <label htmlFor="highlight-import-target" className="shrink-0 text-xs text-[var(--text-secondary)]">
                  {lang === 'zh' ? '导入到' : 'Import into'}
                </label>
                <select
                  id="highlight-import-target"
                  value={targetId}
                  onChange={event => setTargetId(event.target.value)}
                  className="input-field min-w-0 flex-1 truncate !py-1.5 text-sm"
                >
                  {books.map(book => (
                    <option key={book.id} value={book.id}>{book.name}</option>
                  ))}
                </select>
              </>
            )}
          </div>
          <button type="button" onClick={onClose} disabled={importing} className="btn-secondary disabled:cursor-not-allowed disabled:opacity-50">
            {lang === 'zh' ? '关闭' : 'Close'}
          </button>
          {tab !== 'platforms' && (
            <button
              type="button"
              onClick={handleImport}
              disabled={importing || pending.length === 0 || !targetBook}
              className="btn-primary items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <AppIcon name="check" size={17} />
              {importing
                ? (lang === 'zh' ? '正在导入...' : 'Importing...')
                : (lang === 'zh' ? `导入 ${pending.length} 条` : `Import ${pending.length}`)}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
