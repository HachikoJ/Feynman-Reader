'use client'

import { useState, useRef } from 'react'
import { Language, t } from '@/lib/i18n'
import { logger } from '@/lib/logger'
import { parseDocument, SUPPORTED_FILE_TYPES } from '@/lib/document-parser'
import { createDeepSeekClient, analyzeDocumentForBookInfo, AnalyzedBookInfo, GeneratedTag } from '@/lib/deepseek'
import { getSettings, addBook, updateBook, BookTag } from '@/lib/store'

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
  const [analyzedInfo, setAnalyzedInfo] = useState<AnalyzedBookInfo | null>(null)
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
    const file = e.target.files?.[0]
    if (!file) return

    setError(null)
    setStep('analyzing')
    setAnalyzing(true)

    try {
      // 检查文件大小（限制 50MB）
      if (file.size > 50 * 1024 * 1024) {
        throw new Error(lang === 'zh' ? '文件大小不能超过 50MB' : 'File size cannot exceed 50MB')
      }

      logger.debug('开始解析文件:', file.name, file.type, file.size)
      
      // 解析文档
      const parsed = await parseDocument(file)
      logger.debug('文档解析完成，内容长度:', parsed.content.length)
      setDocumentContent(parsed.content)

      // 检查 API Key
      const settings = getSettings()
      if (!settings.apiKey) {
        setError(lang === 'zh' ? '请先在设置中配置 API Key' : 'Please configure API Key in settings first')
        setStep('upload')
        setAnalyzing(false)
        return
      }

      // AI 分析
      logger.debug('开始 AI 分析...')
      const client = await createDeepSeekClient(settings.apiKey)
      const info = await analyzeDocumentForBookInfo(client, parsed.content, parsed.fileName)
      logger.debug('AI 分析完成:', info)
      
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
      setAnalyzing(false)
      // 清空 input 以便重新选择同一文件
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const handleAddTag = () => {
    if (!newTagName.trim()) return
    
    // 如果选择了"其他"，使用自定义分类名
    const finalCategory = newTagCategory === '其他' 
      ? (customCategory.trim() || '其他')
      : newTagCategory
    
    setBookTags([...bookTags, { name: newTagName.trim(), category: finalCategory }])
    setNewTagName('')
    setCustomCategory('')
  }

  const handleRemoveTag = (index: number) => {
    setBookTags(bookTags.filter((_, i) => i !== index))
  }

  const handleConfirm = () => {
    if (!bookName.trim()) {
      setError(lang === 'zh' ? '书名不能为空' : 'Book name is required')
      return
    }

    // 添加书籍，包含文档内容
    const book = addBook(
      bookName.trim(),
      bookAuthor.trim() || undefined,
      undefined,
      bookDesc.trim() || undefined,
      bookTags as BookTag[],
      documentContent // 保存文档内容作为知识库
    )

    onBookAdded()
    onClose()
  }

  const categories = ['社科', '心理', '文学', '科技', '经管', '历史', '哲学', '艺术', '生活', '教育', '其他']

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content max-w-xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
          📄 {lang === 'zh' ? '上传文档添加书籍' : 'Upload Document to Add Book'}
        </h2>

        {step === 'upload' && (
          <div className="space-y-4">
            <p className="text-sm text-[var(--text-secondary)]">
              {lang === 'zh' 
                ? '支持 PDF、Word、Excel、Markdown、TXT、JSON 格式（最大 50MB），AI 将自动分析提取书籍信息'
                : 'Supports PDF, Word, Excel, Markdown, TXT, JSON (max 50MB). AI will analyze and extract book info'}
            </p>
            
            <div 
              className="border-2 border-dashed border-[var(--border)] rounded-xl p-8 text-center cursor-pointer hover:border-[var(--accent)] transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <div className="text-5xl mb-3">📁</div>
              <p className="text-[var(--text-secondary)]">
                {lang === 'zh' ? '点击选择文件或拖拽到此处' : 'Click to select or drag file here'}
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

        {step === 'analyzing' && (
          <div className="text-center py-12">
            <div className="text-5xl mb-4 animate-pulse">🔍</div>
            <p className="text-[var(--text-secondary)]">
              {lang === 'zh' ? 'AI 正在分析文档内容...' : 'AI is analyzing document...'}
            </p>
          </div>
        )}

        {step === 'confirm' && analyzedInfo && (
          <div className="space-y-4">
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
              <label className="block text-sm font-medium mb-2">
                🏷️ {lang === 'zh' ? '标签' : 'Tags'}
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
                        ×
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
                  + {lang === 'zh' ? '添加标签' : 'Add Tag'}
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
              <button onClick={handleConfirm} className="btn-primary flex-1">
                ✓ {lang === 'zh' ? '确认添加' : 'Confirm & Add'}
              </button>
              <button onClick={onClose} className="btn-secondary flex-1">
                {lang === 'zh' ? '取消' : 'Cancel'}
              </button>
            </div>
          </div>
        )}

        {step === 'upload' && (
          <div className="flex justify-end mt-4">
            <button onClick={onClose} className="btn-secondary">
              {lang === 'zh' ? '取消' : 'Cancel'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
