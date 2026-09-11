'use client'

import { useState, useRef, useEffect } from 'react'
import { Language } from '@/lib/i18n'
import { logger } from '@/lib/logger'
import {
  MAX_DOCUMENT_FILE_SIZE,
  SUPPORTED_FILE_TYPES,
  SUPPORTED_FILE_TYPE_HINT,
  UNSUPPORTED_BOOK_FORMATS,
  parseDocument
} from '@/lib/document-parser'
import { AI_CONTEXT_LIMIT_EXCEEDED, AI_DATA_CONSENT_REQUIRED, AI_OUTPUT_INCOMPLETE, createDeepSeekClient, analyzeDocumentForBookInfo, AnalyzedBookInfo, GeneratedTag } from '@/lib/deepseek'
import { AI_REQUEST_CANCELLED, AI_TASK_BUSY } from '@/lib/aiRequestManager'
import { tokendanceRecoveryMessage } from '@/lib/tokendance'
import { getSettings, addBook, flushPendingStoreWrites, reloadBookFromPersistence, BookTag, BookChapter } from '@/lib/store'
import { MAX_BOOK_TAGS, MAX_TAG_LENGTH } from '@/lib/dataLimits'
import { detectMaliciousContent, sanitizeTextInput, validateAuthorName, validateBookName, validateContent } from '@/lib/validation'
import { coverReadErrorMessage, readCoverFile } from '@/lib/coverImage'
import { getSafeImageSrc } from '@/lib/safeUrl'
import AppIcon from './AppIcon'
import { useAccountAccess } from './AuthGuard'
import { isWatchaOAuthEnabled } from '@/lib/accountClient'

interface Props {
  lang: Language
  onBookAdded: () => void
  onClose: () => void
  onOpenSettings?: () => void
}

type UploadStep = 'upload' | 'analyzing' | 'confirm'

/** 把解析出的章节转换成只保存偏移量的定位表，避免快照里重复存正文。 */
function buildChapterIndex(chapters: { title: string; content: string }[] | undefined): BookChapter[] | undefined {
  if (!chapters || chapters.length === 0) return undefined
  const index: BookChapter[] = []
  let cursor = 0
  for (const chapter of chapters) {
    const block = `${chapter.title}\n\n${chapter.content}`
    index.push({ title: chapter.title, start: cursor, length: block.length })
    cursor += block.length + 2
  }
  return index
}

export default function DocumentUpload({ lang, onBookAdded, onClose, onOpenSettings }: Props) {
  const { isAuthenticated, requestLogin } = useAccountAccess()
  const [step, setStep] = useState<UploadStep>('upload')
  const [error, setError] = useState<string | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [analyzedInfo, setAnalyzedInfo] = useState<AnalyzedBookInfo | null>(null)
  const [analysisWarning, setAnalysisWarning] = useState<string | null>(null)
  const [documentContent, setDocumentContent] = useState<string>('')
  const [chapters, setChapters] = useState<BookChapter[] | undefined>(undefined)
  const [parsedLabel, setParsedLabel] = useState<string>('')

  // 可编辑的表单字段
  const [bookName, setBookName] = useState('')
  const [bookAuthor, setBookAuthor] = useState('')
  const [bookDesc, setBookDesc] = useState('')
  const [bookCover, setBookCover] = useState('')
  const [bookTags, setBookTags] = useState<GeneratedTag[]>([])
  const [newTagName, setNewTagName] = useState('')
  const [newTagCategory, setNewTagCategory] = useState('社科')
  const [customCategory, setCustomCategory] = useState('')
  const [readingCover, setReadingCover] = useState(false)
  const [coverError, setCoverError] = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const coverInputRef = useRef<HTMLInputElement>(null)
  const descTextareaRef = useRef<HTMLTextAreaElement>(null)
  const fileAnalysisInFlightRef = useRef(false)
  const saveInFlightRef = useRef(false)
  const coverReadControllerRef = useRef<AbortController | null>(null)

  useEffect(() => () => {
    coverReadControllerRef.current?.abort()
  }, [])

  const handleClose = () => {
    if (saveInFlightRef.current) return
    coverReadControllerRef.current?.abort()
    onClose()
  }

  // 自动调整 textarea 高度
  const autoResizeTextarea = (textarea: HTMLTextAreaElement | null) => {
    if (textarea) {
      textarea.style.height = 'auto'
      textarea.style.height = textarea.scrollHeight + 'px'
    }
  }

  const handleDescChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setBookDesc(e.target.value)
    autoResizeTextarea(e.target)
  }

  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    coverReadControllerRef.current?.abort()
    const controller = new AbortController()
    coverReadControllerRef.current = controller
    setReadingCover(true)
    setCoverError(null)
    try {
      const dataUrl = await readCoverFile(file, controller.signal)
      if (coverReadControllerRef.current !== controller) return
      setBookCover(dataUrl)
    } catch (coverReadError) {
      if (coverReadControllerRef.current !== controller) return
      if (coverReadError instanceof Error && coverReadError.message === 'COVER_READ_ABORTED') return
      setCoverError(coverReadErrorMessage(coverReadError, lang))
    } finally {
      if (coverReadControllerRef.current === controller) {
        coverReadControllerRef.current = null
        setReadingCover(false)
      }
    }
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (fileAnalysisInFlightRef.current) return
    const file = e.target.files?.[0]
    if (!file) return

    fileAnalysisInFlightRef.current = true
    setError(null)
    setAnalysisWarning(null)
    setStep('analyzing')
    setAnalyzing(true)

    try {
      logger.debug('开始解析文件:', file.name, file.type, file.size)

      const parsed = await parseDocument(file)
      logger.debug('文档解析完成，内容长度:', parsed.content.length)
      setDocumentContent(parsed.content)
      setChapters(buildChapterIndex(parsed.chapters))
      setBookCover(parsed.cover || '')
      setParsedLabel(parsed.chapters && parsed.chapters.length > 1
        ? (lang === 'zh'
          ? `已识别 ${parsed.chapters.length} 个章节 · ${parsed.content.length.toLocaleString()} 字符`
          : `${parsed.chapters.length} chapters · ${parsed.content.length.toLocaleString()} characters`)
        : (lang === 'zh'
          ? `已解析 ${parsed.content.length.toLocaleString()} 字符`
          : `${parsed.content.length.toLocaleString()} characters parsed`))

      const fallbackName = parsed.title?.trim() ||
        parsed.fileName.replace(/\.[^/.]+$/, '') ||
        (lang === 'zh' ? '未命名书籍' : 'Untitled book')
      const fallbackInfo: AnalyzedBookInfo = {
        name: fallbackName,
        author: parsed.author,
        description: parsed.description,
        tags: [],
        confidence: 0
      }

      // 文件自带元数据优先，AI 仅用于补全缺失信息。
      setBookName(fallbackInfo.name)
      setBookAuthor(fallbackInfo.author || '')
      setBookDesc(fallbackInfo.description || '')

      const settings = getSettings()
      if (!settings.apiKey || !isAuthenticated) {
        setAnalyzedInfo(fallbackInfo)
        setBookTags([])
        setAnalysisWarning(!isAuthenticated
          ? (lang === 'zh'
            ? `文件已在当前页面完成解析。请先${isWatchaOAuthEnabled() ? '使用【观猹】' : ''}登录，再添加到个人书架。`
            : `The file was parsed on this page. Sign in${isWatchaOAuthEnabled() ? ' with Watcha' : ''} to add it to your library.`)
          : (lang === 'zh'
            ? '尚未配置 TokenDance API Key，已使用文件自带的书籍信息，可手工修改后添加。'
            : 'No TokenDance API key is configured. Metadata from the file was used; edit it if needed.'))
        setStep('confirm')
        return
      }

      logger.debug('开始 AI 分析...')
      let info = fallbackInfo
      try {
        const client = await createDeepSeekClient(settings.apiKey)
        const analyzed = await analyzeDocumentForBookInfo(
          client,
          parsed.content,
          parsed.fileName,
          { task: 'document-metadata' }
        )
        info = {
          ...analyzed,
          name: analyzed.name?.trim() || fallbackInfo.name,
          author: analyzed.author?.trim() || fallbackInfo.author,
          description: analyzed.description?.trim() || fallbackInfo.description
        }
        logger.debug('AI 分析完成:', info)
        if (info.confidence === 0) {
          setAnalysisWarning(lang === 'zh'
            ? 'AI 未能可靠识别书籍信息，已保留文件自带信息，请手工核对后添加。'
            : 'AI could not reliably identify the book. Metadata from the file was kept; verify it manually.')
        }
      } catch (analysisError) {
        logger.error('AI 分析失败，转为手工确认:', analysisError)
        const consentRequired = analysisError instanceof Error && analysisError.message === AI_DATA_CONSENT_REQUIRED
        const contextLimitExceeded = analysisError instanceof Error && analysisError.message === AI_CONTEXT_LIMIT_EXCEEDED
        const cancelled = analysisError instanceof Error && analysisError.message === AI_REQUEST_CANCELLED
        const busy = analysisError instanceof Error && analysisError.message === AI_TASK_BUSY
        const incomplete = analysisError instanceof Error && analysisError.message === AI_OUTPUT_INCOMPLETE
        const recoveryMessage = tokendanceRecoveryMessage(analysisError, lang)
        setAnalysisWarning(cancelled
          ? (lang === 'zh' ? '已取消 AI 信息提取。完整文件仍已保留，请手工确认后添加。' : 'AI extraction was cancelled. The full file was kept; confirm the details manually.')
          : busy
          ? (lang === 'zh' ? '已有 AI 任务正在运行。完整文件已保留，请稍后重试或手工确认。' : 'Another AI task is running. The full file was kept; retry later or confirm manually.')
          : incomplete
          ? (lang === 'zh' ? 'AI 返回的信息不完整，系统已拦截。完整文件已保留，请手工确认后添加。' : 'The AI returned incomplete information. The full file was kept; confirm manually.')
          : contextLimitExceeded
          ? (lang === 'zh'
              ? '文件上下文过长，系统自动缩减后仍未能提取书籍信息。完整原文会继续保留，请手工确认后添加。'
              : 'The document context was still too long after automatic reduction. The full text will be kept; confirm the book details manually.')
          : recoveryMessage
          ? recoveryMessage
          : consentRequired
          ? (lang === 'zh'
              ? '尚未完成 TokenDance AI 数据传输授权，文件不会发送给 AI。请手工确认信息，或前往设置完成授权。'
              : 'TokenDance AI data transfer consent is missing. The file was not sent to AI; confirm manually or enable consent in Settings.')
          : (lang === 'zh'
              ? 'AI 分析未完成，文件已保留。请手工确认书籍信息后添加。'
              : 'AI analysis did not finish. The file was kept; confirm the book details manually.'))
      }

      setAnalyzedInfo(info)
      setBookName(info.name)
      setBookAuthor(info.author || '')
      setBookDesc(info.description || '')
      setBookTags(info.tags)
      setStep('confirm')

      setTimeout(() => {
        autoResizeTextarea(descTextareaRef.current)
      }, 0)
    } catch (err) {
      logger.error('处理文件失败:', err)
      setError(err instanceof Error && err.message ? err.message : (lang === 'zh' ? '文件解析失败' : 'Failed to parse the file'))
      setStep('upload')
    } finally {
      fileAnalysisInFlightRef.current = false
      setAnalyzing(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const handleAddTag = () => {
    if (!newTagName.trim()) return
    if (bookTags.length >= MAX_BOOK_TAGS) {
      setError(lang === 'zh' ? `最多添加 ${MAX_BOOK_TAGS} 个标签` : `You can add up to ${MAX_BOOK_TAGS} tags`)
      return
    }

    const finalCategory = newTagCategory === '其他'
      ? (customCategory.trim() || '其他')
      : newTagCategory

    const cleanName = sanitizeTextInput(newTagName.trim(), MAX_TAG_LENGTH)
    const cleanCategory = sanitizeTextInput(finalCategory, MAX_TAG_LENGTH)
    if (detectMaliciousContent(cleanName) || detectMaliciousContent(cleanCategory)) {
      setError(lang === 'zh' ? '标签包含不安全的内容' : 'The tag contains unsafe content')
      return
    }
    setError(null)
    setBookTags([...bookTags, { name: cleanName, category: cleanCategory }])
    setNewTagName('')
    setCustomCategory('')
  }

  const handleRemoveTag = (index: number) => {
    setBookTags(bookTags.filter((_, i) => i !== index))
  }

  const handleConfirm = async () => {
    if (saveInFlightRef.current) return
    if (!isAuthenticated) {
      requestLogin(lang === 'zh'
        ? '登录后才能保存这本书，并在其他设备继续学习。'
        : 'Sign in to save this book and continue learning on other devices.')
      return
    }
    const nameValidation = validateBookName(bookName)
    if (!nameValidation.valid) {
      setError(nameValidation.error || (lang === 'zh' ? '书名无效' : 'Invalid book name'))
      return
    }
    const authorValidation = validateAuthorName(bookAuthor)
    if (!authorValidation.valid) {
      setError(authorValidation.error || (lang === 'zh' ? '作者名无效' : 'Invalid author name'))
      return
    }
    const descValidation = validateContent(bookDesc, 500)
    if (!descValidation.valid) {
      setError(descValidation.error || (lang === 'zh' ? '简介过长' : 'Description is too long'))
      return
    }
    if (bookTags.length > MAX_BOOK_TAGS || bookTags.some(tag => tag.name.length > MAX_TAG_LENGTH || tag.category.length > MAX_TAG_LENGTH)) {
      setError(lang === 'zh' ? '标签数量或长度超出限制' : 'Tag count or length exceeds the limit')
      return
    }
    if (detectMaliciousContent(bookName) || detectMaliciousContent(bookAuthor) || detectMaliciousContent(bookDesc)) {
      setError(lang === 'zh' ? '输入包含不安全的内容' : 'The input contains unsafe content')
      return
    }

    saveInFlightRef.current = true
    setSaving(true)
    setError(null)
    let bookId: string | undefined
    try {
      const book = addBook(
        sanitizeTextInput(bookName.trim(), 200),
        bookAuthor.trim() ? sanitizeTextInput(bookAuthor.trim(), 100) : undefined,
        bookCover || undefined,
        bookDesc.trim() ? sanitizeTextInput(bookDesc.trim(), 500) : undefined,
        bookTags as BookTag[],
        documentContent,
        chapters
      )
      bookId = book.id
      await flushPendingStoreWrites()
      onBookAdded()
      onClose()
    } catch (saveError) {
      if (bookId) await reloadBookFromPersistence(bookId).catch(() => undefined)
      logger.error('Document book save failed:', saveError)
      setError(lang === 'zh' ? '书籍保存失败，文件和填写内容仍保留，请稍后重试。' : 'Saving failed. Your file and form content were kept; please try again shortly.')
    } finally {
      saveInFlightRef.current = false
      setSaving(false)
    }
  }

  const categories = ['社科', '心理', '文学', '科技', '经管', '历史', '哲学', '艺术', '生活', '教育', '其他']
  const coverPreview = getSafeImageSrc(bookCover)

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-content product-dialog max-h-[calc(100dvh-32px)]" onClick={e => e.stopPropagation()}>
        <div className="product-dialog-header">
          <div className="product-dialog-title">
            <span className="product-dialog-title-icon"><AppIcon name="bookOpen" size={19} /></span>
            <div>
              <h2>{lang === 'zh' ? '导入书籍' : 'Import Book'}</h2>
              <p>{lang === 'zh' ? '导入原文后，书名、作者、封面、标签都可以自由修改' : 'Import a source, then edit title, author, cover, and tags freely'}</p>
            </div>
          </div>
          <button type="button" onClick={handleClose} disabled={saving} className="icon-button shrink-0" aria-label={lang === 'zh' ? '关闭导入窗口' : 'Close import dialog'} title={lang === 'zh' ? '关闭' : 'Close'}>
            <AppIcon name="close" size={20} />
          </button>
        </div>

        <div className="product-dialog-body">
        {step === 'upload' && (
          <div>
            <p className="mb-4 text-sm leading-6 text-[var(--text-secondary)]">
              {lang === 'zh'
                ? `支持 ${SUPPORTED_FILE_TYPE_HINT} 等常用格式（最大 ${MAX_DOCUMENT_FILE_SIZE / 1024 / 1024}MB）。EPUB / MOBI / AZW3 / FB2 会自动读取书名、作者、封面与章节；DOCX / DOC 与 PDF 也能直接转成可阅读、可划线的正文。`
                : `Supports ${SUPPORTED_FILE_TYPE_HINT} and more (max ${MAX_DOCUMENT_FILE_SIZE / 1024 / 1024}MB). EPUB / MOBI / AZW3 / FB2 automatically provide title, author, cover, and chapters; DOCX / DOC and PDF are converted into readable, highlightable text.`}
            </p>

            <div
              className="product-dialog-dropzone"
              onClick={() => fileInputRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={event => {
                if (event.key === 'Enter' || event.key === ' ') fileInputRef.current?.click()
              }}
            >
              <AppIcon name="folder" tone="blue" size={34} />
              <p className="font-medium text-[var(--text-primary)]">
                {lang === 'zh' ? '点击选择电子书或文档' : 'Click to choose a book or document'}
              </p>
              <p className="mt-2 text-xs text-[var(--text-secondary)]">
                {SUPPORTED_FILE_TYPES.join('  ')}
              </p>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept={SUPPORTED_FILE_TYPES.join(',')}
              onChange={handleFileSelect}
              className="hidden"
            />

            <div className="product-dialog-callout mt-4 rounded-lg p-3 text-xs leading-5">
              {lang === 'zh'
                ? <>带有 DRM 加密的电子书（如 Kindle / 微信读书商城下载的加密文件）无法解析，请先使用官方渠道导出无 DRM 的 EPUB/PDF 或笔记。暂不支持：{UNSUPPORTED_BOOK_FORMATS.join('、')}。</>
                : <>DRM-protected books (for example encrypted Kindle or WeChat Reading downloads) cannot be parsed. Export a DRM-free EPUB/PDF or your notes through the official app first. Not supported: {UNSUPPORTED_BOOK_FORMATS.join(', ')}.</>}
            </div>

            {error && (
              <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
                {error}
              </div>
            )}
          </div>
        )}

        {analysisWarning && step === 'confirm' && (
          <div role="status" className="product-dialog-status-warning mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg px-4 py-3 text-sm">
            <span className="min-w-0 flex-1">{analysisWarning}</span>
            {!getSettings().apiKey && onOpenSettings && (
              <button type="button" onClick={() => {
                if (!isAuthenticated) {
                  requestLogin(lang === 'zh' ? `请先${isWatchaOAuthEnabled() ? '使用观猹' : ''}登录，再保存文件或配置 TokenDance AI。` : `Sign in${isWatchaOAuthEnabled() ? ' with Watcha' : ''} before saving the file or configuring TokenDance AI.`)
                  return
                }
                onClose()
                onOpenSettings()
              }} className="btn-secondary min-h-10 shrink-0 !px-3 !text-sm">
                {isAuthenticated
                  ? (lang === 'zh' ? '去配置 TokenDance' : 'Set up TokenDance')
                  : (lang === 'zh' ? '登录账号' : 'Sign in')}
              </button>
            )}
          </div>
        )}

        {step === 'analyzing' && (
          <div className="text-center py-12">
            <AppIcon name="scan" tone="accent" size={48} className="mx-auto mb-4 animate-pulse" />
            <p className="text-[var(--text-secondary)]">
              {lang === 'zh' ? '正在解析书籍内容...' : 'Parsing the book...'}
            </p>
          </div>
        )}

        {step === 'confirm' && analyzedInfo && (
          <div className="space-y-4">
            <div className="product-dialog-callout mb-4 rounded-lg p-3 text-sm leading-6">
              {parsedLabel || (lang === 'zh'
                ? `已完整解析 ${documentContent.length.toLocaleString()} 个字符。`
                : `${documentContent.length.toLocaleString()} characters parsed in full.`)}
              {' '}
              {lang === 'zh'
                ? '原文将用于站内阅读划线、阶段学习、费曼实践和相关推荐。'
                : 'The source powers in-app reading, highlights, phase learning, Feynman practice, and recommendations.'}
            </div>

            <div className={`mb-4 rounded-lg border p-3 text-sm ${
              analyzedInfo.confidence >= 70
                ? 'border-emerald-500/20 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300'
                : analyzedInfo.confidence >= 40
                ? 'border-amber-500/20 bg-amber-500/5 text-amber-700 dark:text-amber-300'
                : 'border-[var(--border)] bg-[var(--bg-secondary)] text-[var(--text-secondary)]'
            }`}>
              {analyzedInfo.confidence > 0
                ? (lang === 'zh'
                  ? `AI 分析置信度: ${analyzedInfo.confidence}%，请核实以下信息是否准确`
                  : `AI confidence: ${analyzedInfo.confidence}%, please verify the information below`)
                : (lang === 'zh' ? '书籍信息来自文件元数据或文件名，请按需要修改。' : 'Book details come from the file metadata or name. Edit them as needed.')}
            </div>

            {/* 封面 */}
            <div className="product-dialog-section">
              <label className="product-dialog-label">{lang === 'zh' ? '封面图片' : 'Cover Image'}</label>
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  disabled={saving}
                  aria-label={lang === 'zh' ? '上传封面' : 'Upload cover'}
                  className="product-dialog-cover flex items-center justify-center cursor-pointer"
                  onClick={() => coverInputRef.current?.click()}
                >
                  {coverPreview
                    // eslint-disable-next-line @next/next/no-img-element -- 封面来自本地文件或跨域链接，无需 Next 图片优化
                    ? <img src={coverPreview} alt="Cover" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
                    : <AppIcon name="camera" tone="blue" size={28} />}
                </button>
                <input
                  ref={coverInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleCoverUpload}
                  disabled={saving}
                  aria-label={lang === 'zh' ? '封面图片文件' : 'Cover image file'}
                  className="hidden"
                />
                <div className="text-sm text-[var(--text-secondary)]">
                  <span className="font-medium text-[var(--text-primary)]">{lang === 'zh' ? '上传封面' : 'Upload cover'}</span>
                  <span className="mt-1 block text-xs">
                    {bookCover
                      ? (lang === 'zh' ? '已从文件中读取封面，可替换或移除' : 'Cover read from the file; replace or remove it')
                      : (lang === 'zh' ? '建议使用竖版图片，可选' : 'Portrait image, optional')}
                  </span>
                  {(bookCover || readingCover || coverError) && (
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => {
                        coverReadControllerRef.current?.abort()
                        coverReadControllerRef.current = null
                        setReadingCover(false)
                        setCoverError(null)
                        setBookCover('')
                      }}
                      className="mt-2 block text-xs text-[var(--text-secondary)] underline underline-offset-2 hover:text-[var(--text-primary)]"
                    >
                      {lang === 'zh' ? '移除图片' : 'Remove'}
                    </button>
                  )}
                </div>
              </div>
              {readingCover && <p role="status" className="mt-2 text-sm text-[var(--text-secondary)]">{lang === 'zh' ? '正在读取封面图片...' : 'Reading cover image...'}</p>}
              {coverError && <p role="alert" className="mt-2 text-sm text-[var(--error)]">{coverError}</p>}
            </div>

            {/* 书名 */}
            <div className="product-dialog-section">
              <label className="product-dialog-label">
                {lang === 'zh' ? '书名' : 'Book Title'} <span className="product-dialog-required">*</span>
              </label>
              <input
                type="text"
                value={bookName}
                onChange={e => setBookName(e.target.value)}
                className="input-field"
                placeholder={lang === 'zh' ? '请输入书名' : 'Enter book title'}
              />
            </div>

            {/* 作者 */}
            <div className="product-dialog-section">
              <label className="product-dialog-label">{lang === 'zh' ? '作者' : 'Author'}</label>
              <input
                type="text"
                value={bookAuthor}
                onChange={e => setBookAuthor(e.target.value)}
                className="input-field"
                placeholder={lang === 'zh' ? '请输入作者（可选）' : 'Enter author (optional)'}
              />
            </div>

            {/* 简介 */}
            <div className="product-dialog-section">
              <label className="product-dialog-label">{lang === 'zh' ? '简介' : 'Description'}</label>
              <textarea
                ref={descTextareaRef}
                value={bookDesc}
                onChange={handleDescChange}
                className="input-field min-h-[80px] resize-none overflow-hidden"
                placeholder={lang === 'zh' ? '一句话介绍或简短描述（可选）' : 'Brief description (optional)'}
                rows={3}
              />
            </div>

            {/* 标签 */}
            <div className="product-dialog-section">
              <label className="product-dialog-label flex items-center gap-2">
                <AppIcon name="tag" size={16} />
                {lang === 'zh' ? '标签' : 'Tags'}
              </label>

              {bookTags.length > 0 && (
                <div className="mb-3 flex flex-wrap gap-2">
                  {bookTags.map((tag, idx) => (
                    <div
                      key={idx}
                      className="product-dialog-tag flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm text-[var(--text-primary)]"
                    >
                      <span className="text-xs text-[var(--text-secondary)]">{tag.category}</span>
                      <span>·</span>
                      <span className="font-medium text-[var(--accent)]">{tag.name}</span>
                      <button
                        onClick={() => handleRemoveTag(idx)}
                        aria-label={lang === 'zh' ? '移除标签' : 'Remove tag'}
                        className="ml-1 text-red-400 hover:text-red-500"
                      >
                        <AppIcon name="close" size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="space-y-3">
                <div className="mb-2 text-xs font-medium text-[var(--text-secondary)]">
                  {lang === 'zh' ? '添加新标签' : 'Add New Tag'}
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">
                      {lang === 'zh' ? '分类' : 'Category'}
                    </label>
                    <select
                      value={newTagCategory}
                      onChange={e => {
                        setNewTagCategory(e.target.value)
                        if (e.target.value !== '其他') {
                          setCustomCategory('')
                        }
                      }}
                      className="input-field w-full"
                    >
                      {categories.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                    {newTagCategory === '其他' && (
                      <input
                        type="text"
                        value={customCategory}
                        onChange={e => setCustomCategory(e.target.value)}
                        placeholder={lang === 'zh' ? '输入自定义分类' : 'Enter custom category'}
                        className="input-field mt-2 w-full"
                      />
                    )}
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">
                      {lang === 'zh' ? '标签名' : 'Tag Name'}
                    </label>
                    <input
                      type="text"
                      value={newTagName}
                      onChange={e => setNewTagName(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleAddTag()}
                      placeholder={lang === 'zh' ? '如：心理学' : 'e.g., Psychology'}
                      className="input-field w-full"
                    />
                  </div>
                </div>
                <button
                  onClick={handleAddTag}
                  disabled={!newTagName.trim() || (newTagCategory === '其他' && !customCategory.trim())}
                  className="btn-secondary product-dialog-action w-full disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <AppIcon name="plus" tone="violet" size={16} />
                  {lang === 'zh' ? '添加标签' : 'Add Tag'}
                </button>
              </div>
            </div>

            {error && (
              <div className="rounded-lg border border-red-500/25 bg-red-500/5 p-3 text-sm text-red-700 dark:text-red-300">
                {error}
              </div>
            )}
          </div>
        )}

        </div>

        <div className="product-dialog-footer">
          <button onClick={handleClose} disabled={analyzing || saving} className="btn-secondary disabled:cursor-not-allowed disabled:opacity-50">
            {lang === 'zh' ? '取消' : 'Cancel'}
          </button>
          {step === 'confirm' && analyzedInfo && (
            <button onClick={handleConfirm} disabled={saving || readingCover} className="btn-primary items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-50">
              <AppIcon name="check" size={17} />
              {saving ? (lang === 'zh' ? '正在保存...' : 'Saving...') : (lang === 'zh' ? '确认添加' : 'Confirm & Add')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
