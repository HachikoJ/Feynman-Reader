/**
 * 第三方工具集成 (P2 修复)
 *
 * 支持导出到 Notion、Obsidian、Anki 等工具
 */

import { Book, NoteRecord, PracticeRecord } from './store'

// ============================================================================
// 通用导出接口
// ============================================================================

/**
 * 导出格式类型
 */
export type ExportFormat =
  | 'markdown'       // Markdown (.md)
  | 'html'           // HTML (.html)
  | 'json'           // JSON (.json)
  | 'csv'            // CSV (.csv)
  | 'pdf'            // PDF (.pdf) - 打印版 HTML
  | 'notion'         // Notion 格式
  | 'obsidian'       // Obsidian / Markdown
  | 'anki'           // Anki 卡片
  | 'bibtex'         // BibTeX 参考文献
  | 'opml'           // OPML 大纲

/**
 * 导出选项
 */
export interface ExportOptions {
  format: ExportFormat
  includeMetadata?: boolean
  includeTimestamp?: boolean
  groupBy?: 'book' | 'date' | 'type'
  template?: 'default' | 'detailed' | 'minimal'
}

// ============================================================================
// Notion 集成
// ============================================================================

/**
 * 生成 Notion 兼容的 Markdown
 */
export function exportToNotion(books: Book[], options: ExportOptions = { format: 'notion' }): string {
  let markdown = '# 费曼阅读法 - 学习笔记\n\n'
  markdown += `导出时间: ${new Date().toLocaleString()}\n\n`
  markdown += '---\n\n'

  books.forEach((book, index) => {
    markdown += `## ${index + 1}. ${book.name}\n\n`

    if (book.author) {
      markdown += `**作者**: ${book.author}\n\n`
    }

    if (book.description) {
      markdown += `**简介**: ${book.description}\n\n`
    }

    if (book.tags && book.tags.length > 0) {
      markdown += `**标签**: ${book.tags.map(t => `#${t.name}`).join(' ')}\n\n`
    }

    // 书籍状态
    const statusEmoji = {
      unread: '📚',
      reading: '📖',
      finished: '✅'
    }
    markdown += `**状态**: ${statusEmoji[book.status]} ${book.status}\n`
    markdown += `**最佳得分**: ${book.bestScore}/100\n\n`

    // 六阶段学习内容
    if (Object.keys(book.responses).length > 0) {
      markdown += '### 📝 学习阶段\n\n'
      Object.entries(book.responses).forEach(([phase, response]) => {
        markdown += `#### ${phase}\n\n${response}\n\n`
      })
    }

    // 笔记记录
    if (book.noteRecords && book.noteRecords.length > 0) {
      markdown += '### 📖 笔记\n\n'
      book.noteRecords.forEach((note) => {
        const date = new Date(note.createdAt).toLocaleDateString()
        markdown += `**${date}**\n\n${note.content}\n\n`
        if (note.aiReview) {
          markdown += `> 💡 ${note.aiReview}\n\n`
        }
      })
    }

    // 费曼实践
    if (book.practiceRecords && book.practiceRecords.length > 0) {
      markdown += '### 🎓 费曼实践\n\n'
      book.practiceRecords.forEach((practice) => {
        const date = new Date(practice.createdAt).toLocaleDateString()
        const score = practice.scores.overall
        const passed = practice.passed ? '✅ 通过' : '❌ 未通过'

        markdown += `#### ${date} - 得分: ${score}/100 (${passed})\n\n`
        markdown += `**教学内容**:\n\n${practice.content}\n\n`
        markdown += `**AI 评估**:\n\n${practice.aiReview}\n\n`
      })
    }

    markdown += '---\n\n'
  })

  return markdown
}

// ============================================================================
// Obsidian 集成
// ============================================================================

/**
 * 生成 Obsidian 兼容的 Markdown（带 YAML front matter 和 wiki 链接）
 */
export function exportToObsidian(books: Book[]): Map<string, string> {
  const files = new Map<string, string>()

  // 创建索引文件
  let indexContent = '# 费曼阅读法 - 书籍索引\n\n'
  indexContent += `## 📚 书籍列表 (${books.length})\n\n`

  books.forEach((book) => {
    const bookFileName = `${sanitizeFileName(book.name)}.md`

    // 添加到索引
    indexContent += `- [[${bookFileName}]]`
    if (book.author) indexContent += ` - ${book.author}`
    if (book.bestScore > 0) indexContent += ` ⭐ ${book.bestScore}`
    indexContent += '\n'

    // 创建书籍文件
    let content = `---\n`
    content += `title: ${book.name}\n`
    content += `created: ${new Date(book.createdAt).toISOString().split('T')[0]}\n`
    content += `updated: ${new Date(book.updatedAt).toISOString().split('T')[0]}\n`
    content += `status: ${book.status}\n`
    content += `bestScore: ${book.bestScore}\n`
    if (book.author) content += `author: ${book.author}\n`
    if (book.tags) {
      content += `tags: [${book.tags.map(t => t.name).join(', ')}]\n`
    }
    content += `---\n\n`

    content += `# ${book.name}\n\n`

    if (book.description) {
      content += `${book.description}\n\n`
    }

    // 笔记
    if (book.noteRecords && book.noteRecords.length > 0) {
      content += `## 📝 笔记\n\n`
      book.noteRecords.forEach((note, i) => {
        const date = new Date(note.createdAt).toLocaleDateString()
        content += `### ${date}\n\n${note.content}\n\n`
      })
    }

    // 实践
    if (book.practiceRecords && book.practiceRecords.length > 0) {
      content += `## 🎓 费曼实践\n\n`
      book.practiceRecords.forEach((practice, i) => {
        const date = new Date(practice.createdAt).toLocaleDateString()
        content += `### ${date} - ${practice.scores.overall}分\n\n`
        content += `${practice.content}\n\n`
      })
    }

    files.set(bookFileName, content)
  })

  // 添加索引文件
  files.set('_索引.md', indexContent)

  // 创建模板文件
  const template = `---\ntitle: {{title}}\ntags: [书籍]\nstatus: 未读\n---\n\n# {{title}}\n\n## 作者\n\n\n## 内容简介\n\n\n## 📝 笔记\n\n\n## 🎓 费曼实践\n\n`
  files.set('_模板.md', template)

  return files
}

/**
 * 清理文件名
 */
function sanitizeFileName(name: string): string {
  return name
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/\s+/g, '_')
    .substring(0, 50)
}

// ============================================================================
// Anki 集成
// ============================================================================

interface AnkiCard {
  front: string
  back: string
  tags: string[]
}

/**
 * 生成 Anki 导入文件（CSV 格式）
 */
export function exportToAnki(books: Book[]): string {
  const cards: AnkiCard[] = []
  const tagsBase = '费曼阅读法'

  books.forEach(book => {
    // 为每本书添加基本信息卡片
    cards.push({
      front: `《${book.name}》的作者是谁？`,
      back: book.author || '未记录',
      tags: [tagsBase, '基本信息', sanitizeFileName(book.name)]
    })

    // 为笔记创建问答卡
    book.noteRecords?.forEach(note => {
      const lines = note.content.split('\n').filter(l => l.trim())

      // 第一行作为问题，其余作为答案
      if (lines.length > 0) {
        cards.push({
          front: `《${book.name}》: ${lines[0]}`,
          back: lines.slice(1).join('\n') || '无详细内容',
          tags: [tagsBase, '笔记', sanitizeFileName(book.name)]
        })
      }
    })

    // 为费曼实践创建卡片
    book.practiceRecords?.forEach(practice => {
      cards.push({
        front: `《${book.name}》费曼实践: 请简单讲解`,
        back: practice.content,
        tags: [tagsBase, '费曼实践', sanitizeFileName(book.name)]
      })

      // AI 评估作为提示卡
      if (practice.aiReview) {
        cards.push({
          front: `《${book.name}》实践评估: 如何改进？`,
          back: practice.aiReview,
          tags: [tagsBase, '评估', sanitizeFileName(book.name)]
        })
      }
    })
  })

  // 转换为 Anki CSV 格式
  const header = '#separator:comma\n#html:true\n#tags:true\n'
  const csvContent = cards.map(card => {
    const front = `"${card.front.replace(/"/g, '""')}"`
    const back = `"${card.back.replace(/"/g, '""')}"`
    const tags = `"${card.tags.join(' ')}"`
    return `${front},${back},${tags}`
  }).join('\n')

  return header + csvContent
}

// ============================================================================
// BibTeX 参考文献
// ============================================================================

/**
 * 生成 BibTeX 参考文献
 */
export function exportToBibtex(books: Book[]): string {
  let bibtex = ''

  books.forEach((book, index) => {
    const citeKey = generateCiteKey(book.name, book.author, index)

    bibtex += `@book{${citeKey},\n`
    bibtex += `  title = {${book.name}},\n`
    if (book.author) {
      bibtex += `  author = {${book.author}},\n`
    }
    bibtex += `  year = {${new Date(book.createdAt).getFullYear()}},\n`
    bibtex += `  note = {费曼阅读法学习笔记, 得分: ${book.bestScore}/100},\n`
    bibtex += `}\n\n`
  })

  return bibtex
}

/**
 * 生成 BibTeX 引用键
 */
function generateCiteKey(title: string, author: string | undefined, index: number): string {
  const authorPart = author
    ? author.split(' ').pop() || 'anon'
    : 'anon'

  const titlePart = title
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)[0]
    .toLowerCase()
    .substring(0, 20)

  const datePart = new Date().getFullYear()

  return `${authorPart}${datePart}${titlePart}${index}`
}

// ============================================================================
// OPML 大纲导出
// ============================================================================

/**
 * 生成 OPML 大纲文件
 */
export function exportToOPML(books: Book[]): string {
  const date = new Date().toISOString()

  let opml = `<?xml version="1.0" encoding="UTF-8"?>\n`
  opml += `<opml version="2.0">\n`
  opml += `  <head>\n`
  opml += `    <title>费曼阅读法 - 书籍大纲</title>\n`
  opml += `    <dateCreated>${date}</dateCreated>\n`
  opml += `    <ownerName>费曼阅读法</ownerName>\n`
  opml += `  </head>\n`
  opml += `  <body>\n`

  books.forEach(book => {
    opml += `    <outline text="${escapeXML(book.name)}"`

    if (book.author) {
      opml += ` author="${escapeXML(book.author)}"`
    }

    if (book.description) {
      opml += ` description="${escapeXML(book.description)}"`
    }

    opml += ` status="${book.status}"`
    opml += ` score="${book.bestScore}"`
    opml += `>\n`

    // 添加笔记子项
    book.noteRecords?.forEach(note => {
      opml += `      <outline text="${escapeXML(note.content.substring(0, 50))}..."`
      opml += ` type="note"`
      opml += ` created="${new Date(note.createdAt).toISOString()}"`
      opml += `/>\n`
    })

    opml += `    </outline>\n`
  })

  opml += `  </body>\n`
  opml += `</opml>\n`

  return opml
}

/**
 * 转义 XML 特殊字符
 */
function escapeXML(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

// ============================================================================
// CSV 导出
// ============================================================================

/**
 * 生成 CSV 格式的学习统计
 */
export function exportToCSV(books: Book[]): string {
  const headers = [
    '书名',
    '作者',
    '状态',
    '当前阶段',
    '最佳得分',
    '笔记数量',
    '实践次数',
    '创建日期',
    '更新日期'
  ]

  const rows = books.map(book => [
    book.name,
    book.author || '',
    book.status,
    book.currentPhase,
    book.bestScore,
    book.noteRecords?.length || 0,
    book.practiceRecords?.length || 0,
    new Date(book.createdAt).toLocaleDateString(),
    new Date(book.updatedAt).toLocaleDateString()
  ])

  // 转换为 CSV
  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell =>
      `"${String(cell).replace(/"/g, '""')}"`
    ).join(','))
  ].join('\n')

  return csvContent
}

// ============================================================================
// 通用导出函数
// ============================================================================

/**
 * 根据格式导出数据
 */
export function exportData(
  books: Book[],
  format: ExportFormat
): { content: string; filename: string; mimeType?: string } {
  const date = new Date().toISOString().split('T')[0]

  switch (format) {
    case 'notion':
      return {
        content: exportToNotion(books),
        filename: `feynman-export-${date}.md`,
        mimeType: 'text/markdown'
      }

    case 'obsidian':
      // Obsidian 返回多个文件，这里返回索引
      return {
        content: exportToObsidian(books).get('_索引.md') || '',
        filename: '_索引.md',
        mimeType: 'text/markdown'
      }

    case 'anki':
      return {
        content: exportToAnki(books),
        filename: `feynman-anki-${date}.csv`,
        mimeType: 'text/csv'
      }

    case 'bibtex':
      return {
        content: exportToBibtex(books),
        filename: `feynman-references-${date}.bib`,
        mimeType: 'application/x-bibtex'
      }

    case 'opml':
      return {
        content: exportToOPML(books),
        filename: `feynman-outline-${date}.opml`,
        mimeType: 'text/xml'
      }

    case 'csv':
      return {
        content: exportToCSV(books),
        filename: `feynman-stats-${date}.csv`,
        mimeType: 'text/csv'
      }

    case 'json':
      return {
        content: JSON.stringify(books, null, 2),
        filename: `feynman-data-${date}.json`,
        mimeType: 'application/json'
      }

    case 'html':
      return {
        content: generateHTMLExport(books),
        filename: `feynman-export-${date}.html`,
        mimeType: 'text/html'
      }

    default:
      return {
        content: exportToNotion(books),
        filename: `feynman-export-${date}.md`,
        mimeType: 'text/markdown'
      }
  }
}

/**
 * 生成 HTML 导出
 */
function generateHTMLExport(books: Book[]): string {
  let html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>费曼阅读法 - 学习笔记</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; line-height: 1.6; }
    h1 { color: #333; border-bottom: 2px solid #667eea; padding-bottom: 10px; }
    h2 { color: #667eea; margin-top: 40px; }
    .book { border: 1px solid #e0e0e0; border-radius: 8px; padding: 20px; margin-bottom: 30px; }
    .book-header { display: flex; justify-content: space-between; align-items: center; }
    .book-title { font-size: 1.5em; font-weight: bold; }
    .book-meta { color: #666; font-size: 0.9em; }
    .badge { display: inline-block; padding: 4px 8px; border-radius: 4px; font-size: 0.8em; }
    .badge-finished { background: #4caf50; color: white; }
    .badge-reading { background: #2196f3; color: white; }
    .badge-unread { background: #9e9e9e; color: white; }
    .section { margin: 20px 0; }
    .note, .practice { background: #f5f5f5; padding: 15px; border-radius: 8px; margin: 10px 0; }
    .score { font-weight: bold; }
    .score-high { color: #4caf50; }
    .score-low { color: #f44336; }
  </style>
</head>
<body>
  <h1>📚 费曼阅读法 - 学习笔记</h1>
  <p>导出时间: ${new Date().toLocaleString()}</p>
`

  books.forEach(book => {
    const statusClass = `badge-${book.status}`
    const statusText = { unread: '未读', reading: '阅读中', finished: '已读' }[book.status]
    const scoreClass = book.bestScore >= 60 ? 'score-high' : 'score-low'

    html += `
  <div class="book">
    <div class="book-header">
      <span class="book-title">${book.name}</span>
      <span class="badge ${statusClass}">${statusText}</span>
    </div>
    <div class="book-meta">
      ${book.author ? `<span>作者: ${book.author}</span> | ` : ''}
      <span>最佳得分: <span class="score ${scoreClass}">${book.bestScore}/100</span></span>
    </div>
`

    if (book.noteRecords && book.noteRecords.length > 0) {
      html += `
    <div class="section">
      <h3>📝 笔记 (${book.noteRecords.length})</h3>`
      book.noteRecords.forEach(note => {
        const date = new Date(note.createdAt).toLocaleDateString()
        html += `
      <div class="note">
        <small>${date}</small>
        <p>${note.content.replace(/\n/g, '<br>')}</p>
      </div>`
      })
      html += `</div>`
    }

    if (book.practiceRecords && book.practiceRecords.length > 0) {
      html += `
    <div class="section">
      <h3>🎓 费曼实践 (${book.practiceRecords.length})</h3>`
      book.practiceRecords.forEach(practice => {
        const date = new Date(practice.createdAt).toLocaleDateString()
        const practiceScoreClass = practice.scores.overall >= 60 ? 'score-high' : 'score-low'
        html += `
      <div class="practice">
        <small>${date} - 得分: <span class="score ${practiceScoreClass}">${practice.scores.overall}/100</span></small>
        <p><strong>教学内容:</strong><br>${practice.content.replace(/\n/g, '<br>')}</p>
        <p><strong>AI 评估:</strong><br>${practice.aiReview.replace(/\n/g, '<br>')}</p>
      </div>`
      })
      html += `</div>`
    }

    html += `  </div>`
  })

  html += `
  <footer style="margin-top: 60px; text-align: center; color: #999; font-size: 0.9em;">
    <p>📖 由费曼阅读法生成</p>
  </footer>
</body>
</html>`

  return html
}

// ============================================================================
// 下载辅助函数
// ============================================================================

/**
 * 触发文件下载
 */
export function downloadFile(content: string, filename: string, mimeType?: string): void {
  const blob = new Blob([content], { type: mimeType || 'text/plain' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/**
 * 批量下载 Obsidian 文件
 */
export async function downloadObsidianFiles(files: Map<string, string>): Promise<void> {
  // 使用 JSZip 打包（如果可用）
  // 否则分别下载每个文件
  const entries = Array.from(files.entries())
  for (const [filename, content] of entries) {
    downloadFile(content, filename, 'text/markdown')
    // 添加延迟避免浏览器阻止多次下载
    await new Promise(resolve => setTimeout(resolve, 200))
  }
}
