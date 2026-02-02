'use client'

import { useState } from 'react'
import { Language } from '@/lib/i18n'
import { Book } from '@/lib/store'
import {
  generateNoteMarkdown,
  generateNoteHTML,
  generatePracticeReport,
  generateProgressCard,
  copyToClipboard,
  downloadFile,
  exportNoteAsMarkdown,
  exportPracticeAsPDF,
  supportsNativeShare,
  nativeShare,
  shareToSocialMedia,
  generateNoteShareImage
} from '@/lib/share'

interface ShareDialogProps {
  lang: Language
  book: Book
  onClose: () => void
  noteId?: string
  practiceId?: string
}

type ShareTab = 'link' | 'image' | 'markdown' | 'export'

export default function ShareDialog({ lang, book, onClose, noteId, practiceId }: ShareDialogProps) {
  const [tab, setTab] = useState<ShareTab>('link')
  const [copied, setCopied] = useState(false)
  const [loading, setLoading] = useState(false)

  const t = {
    zh: {
      title: '分享',
      close: '关闭',
      copy: '复制',
      copied: '已复制',
      download: '下载',
      share: '分享',
      tabs: {
        link: '分享链接',
        image: '生成图片',
        markdown: 'Markdown',
        export: '导出文件'
      },
      link: {
        title: '分享链接',
        desc: '生成一个分享链接，发送给他人查看'
      },
      image: {
        title: '分享图片',
        desc: '生成一张精美的分享图片',
        generate: '生成图片',
        preview: '预览'
      },
      markdown: {
        title: 'Markdown 格式',
        desc: '复制 Markdown 格式，用于笔记软件'
      },
      social: {
        title: '分享到社交媒体',
        twitter: 'Twitter',
        facebook: 'Facebook',
        weibo: '微博',
        native: '更多'
      },
      export: {
        title: '导出文件',
        desc: '下载为本地文件',
        markdown: '导出 Markdown',
        pdf: '导出 PDF (HTML)',
        json: '导出 JSON'
      }
    },
    en: {
      title: 'Share',
      close: 'Close',
      copy: 'Copy',
      copied: 'Copied',
      download: 'Download',
      share: 'Share',
      tabs: {
        link: 'Share Link',
        image: 'Image',
        markdown: 'Markdown',
        export: 'Export'
      },
      link: {
        title: 'Share Link',
        desc: 'Generate a share link to send to others'
      },
      image: {
        title: 'Share Image',
        desc: 'Generate a beautiful share image',
        generate: 'Generate',
        preview: 'Preview'
      },
      markdown: {
        title: 'Markdown Format',
        desc: 'Copy Markdown format for note apps'
      },
      social: {
        title: 'Share to Social Media',
        twitter: 'Twitter',
        facebook: 'Facebook',
        weibo: 'Weibo',
        native: 'More'
      },
      export: {
        title: 'Export File',
        desc: 'Download as local file',
        markdown: 'Export Markdown',
        pdf: 'Export PDF (HTML)',
        json: 'Export JSON'
      }
    }
  }

  const text = t[lang]

  const handleCopy = async (content: string) => {
    const success = await copyToClipboard(content)
    if (success) {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleGenerateImage = async () => {
    if (!noteId) return
    setLoading(true)
    try {
      const result = await generateNoteShareImage(book, noteId, lang)
      if (result.success && result.file) {
        downloadFile(result.file)
      }
    } finally {
      setLoading(false)
    }
  }

  const handleSocialShare = async (platform: 'twitter' | 'facebook' | 'weibo') => {
    const shareData = {
      title: `${book.name} - 费曼阅读法`,
      description: `我正在使用费曼阅读法深度阅读《${book.name}》`,
      url: window.location.href
    }
    await shareToSocialMedia(platform, shareData)
  }

  const handleNativeShare = async () => {
    const success = await nativeShare({
      title: `${book.name} - 费曼阅读法`,
      text: `我正在使用费曼阅读法深度阅读《${book.name}》`,
      url: window.location.href
    })
    if (success) {
      onClose()
    }
  }

  // 根据分享类型生成内容
  const getShareContent = () => {
    if (noteId) {
      return {
        markdown: generateNoteMarkdown(book, noteId),
        html: generateNoteHTML(book, noteId)
      }
    }
    if (practiceId) {
      return {
        markdown: generatePracticeReport(book, practiceId, 'markdown'),
        json: generatePracticeReport(book, practiceId, 'json')
      }
    }
    return { markdown: '', html: '' }
  }

  const content = getShareContent()

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-[var(--bg-primary)] rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-[var(--border)]">
          <h2 className="text-xl font-bold text-[var(--text-primary)]">{text.title}</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-[var(--bg-secondary)] rounded-lg transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[var(--border)]">
          <button
            onClick={() => setTab('link')}
            className={`px-6 py-3 font-medium transition-colors ${
              tab === 'link'
                ? 'text-[var(--accent)] border-b-2 border-[var(--accent)]'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            {text.tabs.link}
          </button>
          {noteId && (
            <button
              onClick={() => setTab('image')}
              className={`px-6 py-3 font-medium transition-colors ${
                tab === 'image'
                  ? 'text-[var(--accent)] border-b-2 border-[var(--accent)]'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              {text.tabs.image}
            </button>
          )}
          <button
            onClick={() => setTab('markdown')}
            className={`px-6 py-3 font-medium transition-colors ${
              tab === 'markdown'
                ? 'text-[var(--accent)] border-b-2 border-[var(--accent)]'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            {text.tabs.markdown}
          </button>
          <button
            onClick={() => setTab('export')}
            className={`px-6 py-3 font-medium transition-colors ${
              tab === 'export'
                ? 'text-[var(--accent)] border-b-2 border-[var(--accent)]'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            {text.tabs.export}
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[60vh]">
          {tab === 'link' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-medium text-[var(--text-primary)] mb-2">{text.link.title}</h3>
                <p className="text-sm text-[var(--text-secondary)] mb-4">{text.link.desc}</p>
              </div>

              {/* 社交媒体分享 */}
              <div>
                <h4 className="text-sm font-medium text-[var(--text-secondary)] mb-3">{text.social.title}</h4>
                <div className="flex gap-3">
                  <button
                    onClick={() => handleSocialShare('twitter')}
                    className="flex-1 py-3 px-4 bg-[#1DA1F2] text-white rounded-lg hover:opacity-90 transition-opacity"
                  >
                    𝕏 Twitter
                  </button>
                  <button
                    onClick={() => handleSocialShare('facebook')}
                    className="flex-1 py-3 px-4 bg-[#4267B2] text-white rounded-lg hover:opacity-90 transition-opacity"
                  >
                    f Facebook
                  </button>
                  <button
                    onClick={() => handleSocialShare('weibo')}
                    className="flex-1 py-3 px-4 bg-[#E6162D] text-white rounded-lg hover:opacity-90 transition-opacity"
                  >
                    微博
                  </button>
                  {supportsNativeShare() && (
                    <button
                      onClick={handleNativeShare}
                      className="flex-1 py-3 px-4 bg-[var(--accent)] text-white rounded-lg hover:opacity-90 transition-opacity"
                    >
                      {text.social.native}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {tab === 'image' && noteId && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-medium text-[var(--text-primary)] mb-2">{text.image.title}</h3>
                <p className="text-sm text-[var(--text-secondary)] mb-4">{text.image.desc}</p>
              </div>

              <div className="text-center">
                <div className="bg-gradient-to-br from-purple-500 to-indigo-600 rounded-xl p-8 mb-6">
                  <p className="text-white text-xl font-bold mb-2">{book.name}</p>
                  <p className="text-white/80 text-sm mb-4">{book.author || ''}</p>
                  <div className="bg-white/20 rounded-lg p-4 text-white text-sm max-h-32 overflow-hidden">
                    {book.noteRecords.find(n => n.id === noteId)?.content.slice(0, 100)}...
                  </div>
                </div>

                <button
                  onClick={handleGenerateImage}
                  disabled={loading}
                  className="py-3 px-8 bg-[var(--accent)] text-white rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {loading ? '...' : text.image.generate}
                </button>
              </div>
            </div>
          )}

          {tab === 'markdown' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-medium text-[var(--text-primary)] mb-2">{text.markdown.title}</h3>
                <p className="text-sm text-[var(--text-secondary)] mb-4">{text.markdown.desc}</p>
              </div>

              <div className="bg-[var(--bg-secondary)] rounded-lg p-4">
                <pre className="text-sm text-[var(--text-primary)] whitespace-pre-wrap overflow-x-auto max-h-64">
                  {content.markdown}
                </pre>
              </div>

              <button
                onClick={() => handleCopy(content.markdown)}
                className="w-full py-3 px-4 bg-[var(--accent)] text-white rounded-lg hover:opacity-90 transition-opacity"
              >
                {copied ? text.copied : text.copy}
              </button>
            </div>
          )}

          {tab === 'export' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-medium text-[var(--text-primary)] mb-2">{text.export.title}</h3>
                <p className="text-sm text-[var(--text-secondary)] mb-4">{text.export.desc}</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {noteId && (
                  <button
                    onClick={() => exportNoteAsMarkdown(book, noteId)}
                    className="p-4 bg-[var(--bg-secondary)] rounded-lg hover:bg-[var(--border)] transition-colors text-left"
                  >
                    <div className="font-medium text-[var(--text-primary)]">📄 Markdown</div>
                    <div className="text-sm text-[var(--text-secondary)]">{text.export.markdown}</div>
                  </button>
                )}

                {practiceId && (
                  <button
                    onClick={() => exportPracticeAsPDF(book, practiceId)}
                    className="p-4 bg-[var(--bg-secondary)] rounded-lg hover:bg-[var(--border)] transition-colors text-left"
                  >
                    <div className="font-medium text-[var(--text-primary)]">📋 PDF / HTML</div>
                    <div className="text-sm text-[var(--text-secondary)]">{text.export.pdf}</div>
                  </button>
                )}

                <button
                  onClick={() => {
                    const progress = generateProgressCard(book, lang)
                    if (progress.success && progress.file) {
                      downloadFile(progress.file)
                    }
                  }}
                  className="p-4 bg-[var(--bg-secondary)] rounded-lg hover:bg-[var(--border)] transition-colors text-left"
                >
                  <div className="font-medium text-[var(--text-primary)]">📊 进度卡片</div>
                  <div className="text-sm text-[var(--text-secondary)]">导出阅读进度数据</div>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
