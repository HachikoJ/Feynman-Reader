'use client'

import { useState, useRef } from 'react'
import { Language } from '@/lib/i18n'
import { logger } from '@/lib/logger'
import { MAX_DOCUMENT_FILE_SIZE, parseDocument, SUPPORTED_FILE_TYPES } from '@/lib/document-parser'
import { AI_CONTEXT_LIMIT_EXCEEDED, AI_DATA_CONSENT_REQUIRED, AI_OUTPUT_INCOMPLETE, createDeepSeekClient, analyzeDocumentForBookInfo, AnalyzedBookInfo, GeneratedTag } from '@/lib/deepseek'
import { AI_REQUEST_CANCELLED, AI_TASK_BUSY } from '@/lib/aiRequestManager'
import { getSettings, addBook, flushPendingStoreWrites, reloadBookFromPersistence, BookTag } from '@/lib/store'
import { MAX_BOOK_TAGS, MAX_TAG_LENGTH } from '@/lib/dataLimits'
import { detectMaliciousContent, sanitizeTextInput, validateAuthorName, validateBookName, validateContent } from '@/lib/validation'
import AppIcon from './AppIcon'

interface Props {
  lang: Language
  onBookAdded: () => void
  onClose: () => void
}

type UploadStep = 'upload' | 'analyzing' | 'confirm'

export default function DocumentUpload({ lang, onBookAdded, onClose }: Props) {
  const [step, setStep] = useState<UploadStep>('upload')
  const [error, setError] = useState<string | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [analyzedInfo, setAnalyzedInfo] = useState<AnalyzedBookInfo | null>(null)
  const [analysisWarning, setAnalysisWarning] = useState<string | null>(null)
  const [documentContent, setDocumentContent] = useState<string>('')
  
  // 可编辑的表单字段
  const [bookName, setBookName] = useState('')
  const [bookAuthor, setBookAuthor] = useState('')
  const [bookDesc, setBookDesc] = useState('')
  const [bookTags, setBookTags] = useState<GeneratedTag[]>([])
  const [newTagName, setNewTagName] = useState('')
  const [newTagCategory, setNewTagCategory] = useState('社科')
  const [customCategory, setCustomCategory] = useState('') // 自定义分类名
  
  const fileInputRef = useRef<HTMLInputElement>(null)
  const descTextareaRef = useRef<HTMLTextAreaElement>(null)
  const fileAnalysisInFlightRef = useRef(false)
  const saveInFlightRef = useRef(false)

  const handleClose = () => {
    if (fileAnalysisInFlightRef.current || saveInFlightRef.current) return
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
      
      // 解析文档
      const parsed = await parseDocument(file)
      logger.debug('文档解析完成，内容长度:', parsed.content.length)
      setDocumentContent(parsed.content)

      const fallbackInfo: AnalyzedBookInfo = {
        name: parsed.fileName.replace(/\.[^/.]+$/, '') || (lang === 'zh' ? '未命名书籍' : 'Untitled book'),
        author: undefined,
        description: undefined,
        tags: [],
        confidence: 0
      }

      // 检查 API Key
      const settings = getSettings()
      if (!settings.apiKey) {
        setAnalyzedInfo(fallbackInfo)
        setBookName(fallbackInfo.name)
        setBookAuthor('')
        setBookDesc('')
        setBookTags([])
        setAnalysisWarning(lang === 'zh'
          ? '未配置 API Key，文档已解析。请手工确认书籍信息后添加。'
          : 'No API key is configured. The document was parsed; confirm the book details manually.')
        setStep('confirm')
        return
      }

      // AI 分析
      logger.debug('开始 AI 分析...')
      let info = fallbackInfo
      try {
        const client = await createDeepSeekClient(settings.apiKey)
        info = await analyzeDocumentForBookInfo(
          client,
          parsed.content,
          parsed.fileName,
          { task: 'document-metadata' }
        )
        logger.debug('AI 分析完成:', info)
        if (info.confidence === 0) {
          setAnalysisWarning(lang === 'zh'
            ? 'AI 未能可靠识别书籍信息，文档已保留，请手工核对后添加。'
            : 'AI could not reliably identify the book. The document was kept; verify the details manually.')
        }
      } catch (analysisError) {
        logger.error('AI 分析失败，转为手工确认:', analysisError)
        const consentRequired = analysisError instanceof Error && analysisError.message === AI_DATA_CONSENT_REQUIRED
        const contextLimitExceeded = analysisError instanceof Error && analysisError.message === AI_CONTEXT_LIMIT_EXCEEDED
        const cancelled = analysisError instanceof Error && analysisError.message === AI_REQUEST_CANCELLED
        const busy = analysisError instanceof Error && analysisError.message === AI_TASK_BUSY
        const incomplete = analysisError instanceof Error && analysisError.message === AI_OUTPUT_INCOMPLETE
        setAnalysisWarning(cancelled
          ? (lang === 'zh' ? '已取消 AI 信息提取。完整文档仍已保留，请手工确认后添加。' : 'AI extraction was cancelled. The full document was kept; confirm the details manually.')
          : busy
          ? (lang === 'zh' ? '已有 AI 任务正在运行。完整文档已保留，请稍后重试或手工确认。' : 'Another AI task is running. The full document was kept; retry later or confirm manually.')
          : incomplete
          ? (lang === 'zh' ? 'AI 返回的信息不完整，系统已拦截。完整文档已保留，请手工确认后添加。' : 'The AI returned incomplete information. The full document was kept; confirm manually.')
          : contextLimitExceeded
          ? (lang === 'zh'
              ? '文档上下文过长，系统自动缩减后仍未能提取书籍信息。完整原文会继续保留，请手工确认后添加。'
              : 'The document context was still too long after automatic reduction. The full text will be kept; confirm the book details manually.')
          : consentRequired
          ? (lang === 'zh'
              ? '尚未同意 AI 数据传输，文档不会发送给 AI。请手工确认信息，或前往设置完成授权。'
              : 'AI data transfer consent is missing. The document was not sent to AI; confirm manually or enable consent in Settings.')
          : (lang === 'zh'
              ? 'AI 分析未完成，文档已保留。请手工确认书籍信息后添加。'
              : 'AI analysis did not finish. The document was kept; confirm the book details manually.'))
      }

      setAnalyzedInfo(info)
      setBookName(info.name)
      setBookAuthor(info.author || '')
      setBookDesc(info.description || '')
      setBookTags(info.tags)
      setStep('confirm')
      
      // 等待 DOM 更新后调整 textarea 高度
      setTimeout(() => {
        autoResizeTextarea(descTextareaRef.current)
      }, 0)
    } catch (err: any) {
      logger.error('处理文件失败:', err)
      setError(err.message || (lang === 'zh' ? '文档解析失败' : 'Failed to parse document'))
      setStep('upload')
    } finally {
      fileAnalysisInFlightRef.current = false
      setAnalyzing(false)
      // 清空 input 以便重新选择同一文件
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
    
    // 如果选择了"其他"，使用自定义分类名
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
      await flushPendingStoreWrites()
      const book = addBook(
        sanitizeTextInput(bookName.trim(), 200),
        bookAuthor.trim() ? sanitizeTextInput(bookAuthor.trim(), 100) : undefined,
        undefined,
        bookDesc.trim() ? sanitizeTextInput(bookDesc.trim(), 500) : undefined,
        bookTags as BookTag[],
        documentContent
      )
      bookId = book.id
      await flushPendingStoreWrites()
      onBookAdded()
      onClose()
    } catch (saveError) {
      if (bookId) await reloadBookFromPersistence(bookId).catch(() => undefined)
      logger.error('Document book save failed:', saveError)
      setError(lang === 'zh' ? '书籍保存失败，文档和填写内容仍保留，请检查浏览器存储后重试。' : 'Saving failed. Your document and form content were kept; check browser storage and try again.')
    } finally {
      saveInFlightRef.current = false
      setSaving(false)
    }
  }

  const categories = ['社科', '心理', '文学', '科技', '经管', '历史', '哲学', '艺术', '生活', '教育', '其他']

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-content max-w-xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
          <AppIcon name="file" tone="blue" size={22} />
          {lang === 'zh' ? '上传文档添加书籍' : 'Upload Document to Add Book'}
        </h2>

        {step === 'upload' && (
          <div className="space-y-4">
            <p className="text-sm text-[var(--text-secondary)]">
              {lang === 'zh'
                ? `支持 PDF、DOCX、Markdown、TXT、JSON 格式（最大 ${MAX_DOCUMENT_FILE_SIZE / 1024 / 1024}MB）。AI 会提取书籍信息，解析出的完整原文将保存在当前浏览器中。`
                : `Supports PDF, DOCX, Markdown, TXT and JSON (max ${MAX_DOCUMENT_FILE_SIZE / 1024 / 1024}MB). AI extracts book details, while the complete parsed text is kept in this browser.`}
            </p>
            
            <div 
              className="border-2 border-dashed border-[var(--border)] rounded-xl p-8 text-center cursor-pointer hover:border-[var(--accent)] transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <AppIcon name="folder" tone="blue" size={48} className="mx-auto mb-3" />
              <p className="text-[var(--text-secondary)]">
                {lang === 'zh' ? '点击选择文件' : 'Click to select a file'}
              </p>
              <p className="text-xs text-[var(--text-secondary)] mt-2">
                {SUPPORTED_FILE_TYPES.join(', ')}
              </p>
            </div>
            
            <input
              ref={fileInputRef}
              type="file"
              accept={SUPPORTED_FILE_TYPES.join(',')}
              onChange={handleFileSelect}
              className="hidden"
            />

        {error && (
              <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
                {error}
              </div>
            )}
          </div>
        )}

        {analysisWarning && step === 'confirm' && (
          <div role="status" className="mb-4 rounded-lg border border-yellow-500/40 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-700 dark:text-yellow-300">
            {analysisWarning}
          </div>
        )}

        {step === 'analyzing' && (
          <div className="text-center py-12">
            <AppIcon name="scan" tone="accent" size={48} className="mx-auto mb-4 animate-pulse" />
            <p className="text-[var(--text-secondary)]">
              {lang === 'zh' ? 'AI 正在分析文档内容...' : 'AI is analyzing document...'}
            </p>
          </div>
        )}

        {step === 'confirm' && analyzedInfo && (
          <div className="space-y-4">
            <div className="rounded-lg border border-sky-500/40 bg-sky-500/10 p-3 text-sm text-sky-700 dark:text-sky-300">
              {lang === 'zh'
                ? `已完整解析 ${documentContent.length.toLocaleString()} 个字符。添加后，原文将用于阶段学习、费曼实践、角色问答和相关推荐。`
                : `${documentContent.length.toLocaleString()} characters parsed in full. After adding the book, the source will support phase learning, Feynman practice, persona Q&A, and recommendations.`}
            </div>

            {/* 置信度提示 */}
            <div className={`p-3 rounded-lg text-sm ${
              analyzedInfo.confidence >= 70 
                ? 'bg-green-500/10 border border-green-500/30 text-green-400'
                : analyzedInfo.confidence >= 40
                ? 'bg-yellow-500/10 border border-yellow-500/30 text-yellow-400'
                : 'bg-red-500/10 border border-red-500/30 text-red-400'
            }`}>
              {lang === 'zh' 
                ? `AI 分析置信度: ${analyzedInfo.confidence}%，请核实以下信息是否准确`
                : `AI confidence: ${analyzedInfo.confidence}%, please verify the information below`}
            </div>

            {/* 书名 */}
            <div>
              <label className="block text-sm font-medium mb-2">
                {lang === 'zh' ? '书名' : 'Book Title'} *
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
            <div>
              <label className="block text-sm font-medium mb-2">
                {lang === 'zh' ? '作者' : 'Author'}
              </label>
              <input
                type="text"
                value={bookAuthor}
                onChange={e => setBookAuthor(e.target.value)}
                className="input-field"
                placeholder={lang === 'zh' ? '请输入作者（可选）' : 'Enter author (optional)'}
              />
            </div>

            {/* 简介 */}
            <div>
              <label className="block text-sm font-medium mb-2">
                {lang === 'zh' ? '简介' : 'Description'}
              </label>
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
            <div>
              <label className="flex items-center gap-2 text-sm font-medium mb-2">
                <AppIcon name="tag" tone="violet" size={17} />
                {lang === 'zh' ? '标签' : 'Tags'}
              </label>
              
              {/* 已有标签 */}
              {bookTags.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {bookTags.map((tag, idx) => (
                    <div 
                      key={idx}
                      className="px-3 py-1.5 bg-[var(--accent)]/10 text-[var(--accent)] rounded-lg text-sm flex items-center gap-2 border border-[var(--accent)]/20"
                    >
                      <span className="text-xs text-[var(--text-secondary)]">{tag.category}</span>
                      <span>·</span>
                      <span>{tag.name}</span>
                      <button 
                        onClick={() => handleRemoveTag(idx)}
                        className="text-red-400 hover:text-red-500 ml-1"
                      >
                        <AppIcon name="close" size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* 添加标签 */}
              <div className="space-y-3">
                <div className="text-xs font-medium text-[var(--text-secondary)] mb-2">
                  {lang === 'zh' ? '添加新标签' : 'Add New Tag'}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
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
                        className="input-field w-full mt-2"
                      />
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                      {lang === 'zh' ? '标签名' : 'Tag Name'}
                    </label>
                    <input
                      type="text"
                      value={newTagName}
                      onChange={e => setNewTagName(e.target.value)}
                      onKeyPress={e => e.key === 'Enter' && handleAddTag()}
                      placeholder={lang === 'zh' ? '如：心理学' : 'e.g., Psychology'}
                      className="input-field w-full"
                    />
                  </div>
                </div>
                <button 
                  onClick={handleAddTag}
                  disabled={!newTagName.trim() || (newTagCategory === '其他' && !customCategory.trim())}
                  className="btn-secondary w-full disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <AppIcon name="plus" tone="violet" size={16} />
                  {lang === 'zh' ? '添加标签' : 'Add Tag'}
                </button>
              </div>
            </div>

            {error && (
              <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
                {error}
              </div>
            )}

            {/* 操作按钮 */}
            <div className="flex gap-3 pt-2">
              <button onClick={handleConfirm} disabled={saving} className="btn-primary flex flex-1 items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                <AppIcon name="check" size={17} />
                {saving ? (lang === 'zh' ? '正在保存...' : 'Saving...') : (lang === 'zh' ? '确认添加' : 'Confirm & Add')}
              </button>
              <button onClick={handleClose} disabled={saving} className="btn-secondary flex-1 disabled:opacity-50 disabled:cursor-not-allowed">
                {lang === 'zh' ? '取消' : 'Cancel'}
              </button>
            </div>
          </div>
        )}

        {step === 'upload' && (
          <div className="flex justify-end mt-4">
            <button onClick={handleClose} disabled={analyzing} className="btn-secondary disabled:opacity-50 disabled:cursor-not-allowed">
              {lang === 'zh' ? '取消' : 'Cancel'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
