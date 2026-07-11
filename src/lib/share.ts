import { Language } from './i18n'
import { Book } from './store'
import { logger } from './logger'

// ============================================================================
// 协作分享功能 (P2 修复)
// ============================================================================

// 分享类型
export type ShareType = 'note' | 'practice' | 'qa' | 'book' | 'progress'

// 分享内容格式
export type ShareFormat = 'image' | 'markdown' | 'json' | 'html'

// 分享数据接口
export interface ShareData {
  type: ShareType
  format: ShareFormat
  book?: Book
  noteId?: string
  practiceId?: string
  qaRecordId?: string
  customTitle?: string
  customDescription?: string
}

// 分享结果接口
export interface ShareResult {
  success: boolean
  url?: string
  file?: File
  error?: string
}

// ============================================================================
// 笔记分享
// ============================================================================

/**
 * 生成笔记分享链接 (Base64 编码)
 */
export function generateNoteShareLink(book: Book, noteId: string): string {
  const note = book.noteRecords.find(n => n.id === noteId)
  if (!note) return ''

  const shareData = {
    book: book.name,
    author: book.author,
    note: note.content,
    date: new Date(note.createdAt).toLocaleDateString()
  }

  const encoded = btoa(encodeURIComponent(JSON.stringify(shareData)))
  return `${window.location.origin}/share/note/${encoded}`
}

/**
 * 生成笔记分享图片 (使用 Canvas)
 */
export async function generateNoteShareImage(
  book: Book,
  noteId: string,
  lang: Language = 'zh'
): Promise<ShareResult> {
  try {
    const note = book.noteRecords.find(n => n.id === noteId)
    if (!note) {
      return { success: false, error: '笔记不存在' }
    }

    // 创建 canvas
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      return { success: false, error: '无法创建画布' }
    }

    // 设置尺寸
    const width = 800
    const height = 600
    canvas.width = width
    canvas.height = height

    // 绘制背景
    const gradient = ctx.createLinearGradient(0, 0, width, height)
    gradient.addColorStop(0, '#667eea')
    gradient.addColorStop(1, '#764ba2')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, width, height)

    // 绘制内容
    ctx.fillStyle = 'white'
    ctx.font = 'bold 32px Arial'
    ctx.textAlign = 'center'
    ctx.fillText(book.name, width / 2, 80)

    ctx.font = '20px Arial'
    ctx.fillStyle = 'rgba(255,255,255,0.8)'
    ctx.fillText(book.author || '', width / 2, 120)

    // 绘制分割线
    ctx.strokeStyle = 'rgba(255,255,255,0.3)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(100, 150)
    ctx.lineTo(700, 150)
    ctx.stroke()

    // 绘制笔记内容 (简化版，实际需要处理换行)
    ctx.font = '18px Arial'
    ctx.fillStyle = 'white'
    ctx.textAlign = 'left'

    const maxCharsPerLine = 35
    const maxLines = 10
    const lines = wrapText(ctx, note.content, maxCharsPerLine, maxLines)

    lines.forEach((line, index) => {
      ctx.fillText(line, 100, 200 + index * 28)
    })

    // 绘制底部信息
    ctx.font = '14px Arial'
    ctx.fillStyle = 'rgba(255,255,255,0.6)'
    ctx.textAlign = 'center'
    const footer = lang === 'zh'
      ? '📖 来自费曼读书助手'
      : '📖 From Feynman Reader'
    ctx.fillText(footer, width / 2, height - 30)

    // 转换为 Blob
    const blob = await new Promise<Blob>((resolve) => {
      canvas.toBlob((blob) => {
        resolve(blob!)
      }, 'image/png')
    })

    const file = new File([blob], `note-${noteId}.png`, { type: 'image/png' })
    return { success: true, file }
  } catch (e) {
    return { success: false, error: String(e) }
  }
}

// 辅助函数：文字换行
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxChars: number, maxLines: number): string[] {
  const lines: string[] = []
  const chars = Array.from(text) // 支持中文
  let currentLine = ''

  for (const char of chars) {
    if (currentLine.length >= maxChars) {
      lines.push(currentLine)
      currentLine = ''
      if (lines.length >= maxLines) break
    }
    currentLine += char
  }

  if (currentLine && lines.length < maxLines) {
    lines.push(currentLine)
  }

  if (lines.length >= maxLines && currentLine) {
    lines[lines.length - 1] = lines[lines.length - 1].slice(0, -3) + '...'
  }

  return lines
}

/**
 * 生成笔记 Markdown 格式
 */
export function generateNoteMarkdown(book: Book, noteId: string): string {
  const note = book.noteRecords.find(n => n.id === noteId)
  if (!note) return ''

  const date = new Date(note.createdAt).toLocaleDateString()

  return `# ${book.name}

**作者**: ${book.author || '未知'}
**日期**: ${date}

---

## 笔记内容

${note.content}

---

*📖 来自费曼读书助手*
`
}

/**
 * 生成笔记 HTML 格式 (用于复制到其他应用)
 */
export function generateNoteHTML(book: Book, noteId: string): string {
  const note = book.noteRecords.find(n => n.id === noteId)
  if (!note) return ''

  const date = new Date(note.createdAt).toLocaleDateString()

  return `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 12px;">
  <div style="background: white; padding: 30px; border-radius: 8px;">
    <h1 style="margin: 0 0 10px 0; color: #333;">${book.name}</h1>
    <p style="margin: 0 0 20px 0; color: #666; font-size: 14px;">${book.author || '未知'} · ${date}</p>
    <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
    <div style="color: #333; line-height: 1.6;">${note.content.replace(/\n/g, '<br>')}</div>
  </div>
  <p style="text-align: center; color: rgba(255,255,255,0.8); font-size: 12px; margin-top: 15px;">📖 来自费曼读书助手</p>
</div>
  `
}

// ============================================================================
// 实践记录分享
// ============================================================================

/**
 * 生成实践分享报告
 */
export function generatePracticeReport(book: Book, practiceId: string, format: ShareFormat = 'markdown'): string {
  const practice = book.practiceRecords.find(p => p.id === practiceId)
  if (!practice) return ''

  const date = new Date(practice.createdAt).toLocaleDateString()

  if (format === 'markdown') {
    return `# ${book.name} - 费曼实践报告

**日期**: ${date}

## 我的教学内容

${practice.content}

## AI 评估

${practice.aiReview}

## 得分详情

- **理解准确度**: ${practice.scores.accuracy}/100
- **内容完整度**: ${practice.scores.completeness}/100
- **表达清晰度**: ${practice.scores.clarity}/100
- **综合评分**: ${practice.scores.overall}/100 ${practice.scores.overall >= 60 ? '✅ 通过' : '❌ 未通过'}

---

*📖 来自费曼读书助手*
`
  }

  if (format === 'json') {
    return JSON.stringify({
      book: book.name,
      author: book.author,
      practice: {
        content: practice.content,
        review: practice.aiReview,
        scores: practice.scores,
        passed: practice.passed
      },
      date
    }, null, 2)
  }

  return ''
}

// ============================================================================
// 阅读进度分享
// ============================================================================

/**
 * 生成阅读进度卡片
 */
export function generateProgressCard(book: Book, lang: Language = 'zh'): ShareResult {
  try {
    const completedPhases = book.currentPhase
    const totalPhases = 6
    const progress = Math.round((completedPhases / totalPhases) * 100)

    const cardData = {
      title: book.name,
      author: book.author || '',
      progress,
      phase: completedPhases,
      totalPhases,
      bestScore: book.bestScore,
      status: lang === 'zh' ?
        (book.status === 'finished' ? '已读完' : book.status === 'reading' ? '阅读中' : '未开始') :
        (book.status === 'finished' ? 'Finished' : book.status === 'reading' ? 'Reading' : 'Unread')
    }

    return {
      success: true,
      file: new File([JSON.stringify(cardData, null, 2)], `progress-${book.id}.json`, { type: 'application/json' })
    }
  } catch (e) {
    return { success: false, error: String(e) }
  }
}

// ============================================================================
// 通用分享功能
// ============================================================================

/**
 * 复制到剪贴板
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
    // 降级方案
    const textArea = document.createElement('textarea')
    textArea.value = text
    textArea.style.position = 'fixed'
    textArea.style.left = '-999999px'
    document.body.appendChild(textArea)
    textArea.select()
    const success = document.execCommand('copy')
    document.body.removeChild(textArea)
    return success
  } catch (e) {
    logger.error('Copy failed:', e)
    return false
  }
}

/**
 * 下载文件
 */
export function downloadFile(file: File, filename?: string): void {
  const url = URL.createObjectURL(file)
  const link = document.createElement('a')
  link.href = url
  link.download = filename || file.name
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/**
 * 分享到社交媒体
 */
export async function shareToSocialMedia(
  platform: 'twitter' | 'facebook' | 'linkedin' | 'weibo' | 'wechat',
  data: { title: string; description: string; url?: string }
): Promise<boolean> {
  const { title, description, url } = data
  const shareUrl = url || window.location.href
  const encodedTitle = encodeURIComponent(title)
  const encodedDesc = encodeURIComponent(description)
  const encodedUrl = encodeURIComponent(shareUrl)

  let shareLink = ''

  switch (platform) {
    case 'twitter':
      shareLink = `https://twitter.com/intent/tweet?text=${encodedTitle}&url=${encodedUrl}`
      break
    case 'facebook':
      shareLink = `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`
      break
    case 'linkedin':
      shareLink = `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`
      break
    case 'weibo':
      shareLink = `https://service.weibo.com/share/share.php?title=${encodedTitle}${encodedDesc}&url=${encodedUrl}`
      break
    case 'wechat':
      // 微信分享需要特殊处理，这里返回 false
      return false
  }

  if (shareLink) {
    window.open(shareLink, '_blank', 'width=600,height=400')
    return true
  }

  return false
}

/**
 * 检查是否支持原生分享
 */
export function supportsNativeShare(): boolean {
  return typeof navigator !== 'undefined' && 'share' in navigator
}

/**
 * 使用原生分享 API
 */
export async function nativeShare(data: {
  title: string
  text: string
  url?: string
}): Promise<boolean> {
  if (!supportsNativeShare()) {
    return false
  }

  try {
    await navigator.share(data)
    return true
  } catch (e) {
    if ((e as Error).name !== 'AbortError') {
      logger.error('Native share failed:', e)
    }
    return false
  }
}

// ============================================================================
// 导出功能
// ============================================================================

/**
 * 导出笔记为 Markdown 文件
 */
export function exportNoteAsMarkdown(book: Book, noteId: string): void {
  const markdown = generateNoteMarkdown(book, noteId)
  const blob = new Blob([markdown], { type: 'text/markdown' })
  const file = new File([blob], `note-${noteId}.md`, { type: 'text/markdown' })
  downloadFile(file)
}

/**
 * 导出实践记录为 PDF (简化版：导出为 HTML 可打印格式)
 */
export function exportPracticeAsPDF(book: Book, practiceId: string): void {
  const practice = book.practiceRecords.find(p => p.id === practiceId)
  if (!practice) return

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${book.name} - 费曼实践报告</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 800px; margin: 0 auto; padding: 40px 20px; }
    h1 { color: #333; border-bottom: 2px solid #667eea; padding-bottom: 10px; }
    .meta { color: #666; margin-bottom: 30px; }
    .section { margin: 30px 0; }
    .section h2 { color: #667eea; font-size: 18px; }
    .scores { display: flex; gap: 20px; flex-wrap: wrap; }
    .score-item { background: #f5f5f5; padding: 15px; border-radius: 8px; flex: 1; min-width: 120px; }
    .score-value { font-size: 24px; font-weight: bold; color: #667eea; }
    .score-label { font-size: 12px; color: #666; }
    .passed { color: #4caf50; }
    .failed { color: #f44336; }
  </style>
</head>
<body>
  <h1>${book.name}</h1>
  <div class="meta">
    <p>费曼实践报告</p>
    <p>${new Date(practice.createdAt).toLocaleDateString()}</p>
  </div>

  <div class="section">
    <h2>我的教学内容</h2>
    <p>${practice.content.replace(/\n/g, '<br>')}</p>
  </div>

  <div class="section">
    <h2>AI 评估</h2>
    <p>${practice.aiReview.replace(/\n/g, '<br>')}</p>
  </div>

  <div class="section">
    <h2>得分详情</h2>
    <div class="scores">
      <div class="score-item">
        <div class="score-value">${practice.scores.accuracy}</div>
        <div class="score-label">理解准确度</div>
      </div>
      <div class="score-item">
        <div class="score-value">${practice.scores.completeness}</div>
        <div class="score-label">内容完整度</div>
      </div>
      <div class="score-item">
        <div class="score-value">${practice.scores.clarity}</div>
        <div class="score-label">表达清晰度</div>
      </div>
      <div class="score-item">
        <div class="score-value">${practice.scores.overall}</div>
        <div class="score-label">综合评分</div>
      </div>
    </div>
    <p style="margin-top: 20px; font-size: 18px;">
      结果: <span class="${practice.passed ? 'passed' : 'failed'}">${practice.passed ? '✅ 通过' : '❌ 未通过'}</span>
    </p>
  </div>

  <footer style="margin-top: 60px; text-align: center; color: #999; font-size: 12px;">
    <p>📖 来自费曼读书助手</p>
  </footer>
</body>
</html>`

  const blob = new Blob([html], { type: 'text/html' })
  const file = new File([blob], `practice-${practiceId}.html`, { type: 'text/html' })
  downloadFile(file)
}
