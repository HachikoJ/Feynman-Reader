// 文档解析工具：把常见电子书 / 文档格式转换成可检索的纯文本，并尽量提取书名、作者、封面与章节结构。
'use client'

import { logger } from './logger'
import { MAX_DOCUMENT_FILE_SIZE, MAX_DOCUMENT_PAGES, MAX_DOCUMENT_TEXT_LENGTH } from './dataLimits'
import { extractLegacyWordText, isCompoundFile } from './legacyWord'

export interface ParsedChapter {
  title: string
  content: string
}

export interface ParsedDocument {
  content: string
  fileName: string
  fileType: string
  /** 从文件内嵌元数据中读出的书名 / 作者 / 简介，供用户确认后采用。 */
  title?: string
  author?: string
  description?: string
  /** 内嵌封面，已转换为 data URL；读取失败时为空。 */
  cover?: string
  /** 具备天然章节结构的格式（EPUB / MOBI / FB2 等）会返回章节，便于站内阅读与定位。 */
  chapters?: ParsedChapter[]
}

export { MAX_DOCUMENT_FILE_SIZE, MAX_DOCUMENT_PAGES, MAX_DOCUMENT_TEXT_LENGTH } from './dataLimits'

/** 支持的电子书与文档格式。 */
export const SUPPORTED_FILE_TYPES = [
  '.epub',
  '.mobi',
  '.azw',
  '.azw3',
  '.prc',
  '.fb2',
  '.pdf',
  '.docx',
  '.doc',
  '.html',
  '.htm',
  '.xhtml',
  '.rtf',
  '.txt',
  '.md',
  '.markdown',
  '.json'
]

/** 明确不支持、且短期内无法可靠解析的格式，用于给出可执行的替代建议。 */
export const UNSUPPORTED_BOOK_FORMATS = ['.djvu', '.chm', '.cbz', '.cbr', '.azw4', '.lit', '.pdb']

export const SUPPORTED_FILE_TYPE_HINT = 'EPUB、MOBI / AZW3、FB2、PDF、WORD（DOCX / DOC）、HTML、RTF、TXT、Markdown、JSON'

const UNSUPPORTED_FORMAT_ADVICE: Record<string, { zh: string; en: string }> = {
  '.azw4': {
    zh: '暂不支持 .azw4（Kindle 版式 PDF 容器，多为受保护内容）。请导出为 PDF 或 EPUB 后重试。',
    en: '.azw4 (Kindle print-replica) is not supported. Export it as PDF or EPUB and retry.'
  },
  '.djvu': {
    zh: '暂不支持 .djvu 扫描件格式。请转换为 PDF 后重试。',
    en: '.djvu is not supported. Convert it to PDF and retry.'
  },
  '.chm': {
    zh: '暂不支持 .chm 帮助文档格式。请解包为 HTML 或转换为 EPUB 后重试。',
    en: '.chm is not supported. Unpack it to HTML or convert it to EPUB and retry.'
  },
  '.cbz': {
    zh: '暂不支持 .cbz 漫画压缩包（图片型内容无法提取文字）。',
    en: '.cbz comic archives are not supported (image-only content has no extractable text).'
  },
  '.cbr': {
    zh: '暂不支持 .cbr 漫画压缩包（图片型内容无法提取文字）。',
    en: '.cbr comic archives are not supported (image-only content has no extractable text).'
  },
  '.lit': {
    zh: '暂不支持 .lit（Microsoft Reader）格式。请转换为 EPUB 后重试。',
    en: '.lit (Microsoft Reader) is not supported. Convert it to EPUB and retry.'
  },
  '.pdb': {
    zh: '暂不支持 .pdb 格式。请转换为 EPUB 或 TXT 后重试。',
    en: '.pdb is not supported. Convert it to EPUB or TXT and retry.'
  }
}

export function describeUnsupportedFormat(ext: string, lang: 'zh' | 'en' = 'zh'): string {
  const normalized = ext.startsWith('.') ? ext.toLowerCase() : `.${ext.toLowerCase()}`
  const advice = UNSUPPORTED_FORMAT_ADVICE[normalized]
  if (advice) return advice[lang]
  return lang === 'zh'
    ? `暂不支持 ${normalized} 格式。当前支持：${SUPPORTED_FILE_TYPE_HINT}。`
    : `${normalized} is not supported yet. Supported: ${SUPPORTED_FILE_TYPE_HINT}.`
}

/** 封面转成 data URL 后的大小上限，避免把书架快照撑爆。 */
const MAX_COVER_BYTES = 600 * 1024
const COVER_MIME_BY_EXT: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  svg: 'image/svg+xml'
}

export function getFileExtension(fileName: string): string {
  return fileName.split('.').pop()?.toLowerCase() || ''
}

function assertSafeExtractedText(content: string): void {
  if (content.length > MAX_DOCUMENT_TEXT_LENGTH) {
    throw new Error('文档提取内容过长，请拆分后上传（最多 100 万字符）')
  }
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ldquo: '“',
  rdquo: '”',
  lsquo: '‘',
  rsquo: '’',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  middot: '·'
}

export function decodeHtmlEntities(input: string): string {
  return input.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity: string) => {
    if (entity.startsWith('#')) {
      const isHex = entity[1] === 'x' || entity[1] === 'X'
      const code = Number.parseInt(isHex ? entity.slice(2) : entity.slice(1), isHex ? 16 : 10)
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return match
      try {
        return String.fromCodePoint(code)
      } catch {
        return match
      }
    }
    const named = NAMED_ENTITIES[entity.toLowerCase()]
    return named === undefined ? match : named
  })
}

function normalizeParagraphs(input: string): string {
  return input
    .replace(/\r\n?/g, '\n')
    .replace(/[\t\u00a0\u3000]+/g, ' ')
    .replace(/[ ]{2,}/g, ' ')
    .split('\n')
    .map(line => line.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * 统一使用一小组 Markdown 兼容标记保存文档语义。它仍然是纯文本，因而不改变
 * 现有数据模型、搜索和字符偏移；阅读器可以据此恢复标题、列表、引用、表格和代码块。
 */
function normalizeStructuredText(input: string): string {
  return input
    .replace(/\r\n?/g, '\n')
    .replace(/[\u00a0\u3000]/g, ' ')
    .split('\n')
    .map(line => line.replace(/[ \t]+$/g, ''))
    .join('\n')
    .replace(/\n[ \t]+\n/g, '\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * 清理解析器常见的不可见噪声。该函数只在章节内容已经生成后运行，
 * 因而章节索引会基于清洗后的最终文本建立，不会留下失真的 offset。
 */
export function cleanExtractedText(input: string): string {
  return normalizeStructuredText(input
    .replace(/^\uFEFF/u, '')
    .replace(/[\u200B-\u200D\u2060\u2061\u2062\u2063\u2064\u206A\u206B\u206C\u206D\u206E\u206F]/gu, '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/gu, '')
    .replace(/\u00AD/gu, '')
    .replace(/[\uE000-\uF8FF\u{F0000}-\u{FFFFD}]/gu, '')
    .replace(/\uFFFD/gu, ''))
}

function stripMarkup(input: string): string {
  return decodeHtmlEntities(input.replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeChapterTitle(input: string, fallback: string): string {
  return stripMarkup(input).replace(/[\r\n]+/g, ' ').trim() || fallback
}

function composeChapters(chapters: ParsedChapter[]): string {
  return chapters.map(chapter => `${chapter.title}\n\n${chapter.content}`).join('\n\n')
}

function removeLeadingHeading(content: string, title: string): string {
  const lines = content.split('\n')
  const firstContentLine = lines.findIndex(line => line.trim().length > 0)
  if (firstContentLine < 0) return ''
  const heading = lines[firstContentLine].replace(/^#{1,6}\s+/, '').trim()
  if (heading !== title.trim()) return content
  lines.splice(firstContentLine, 1)
  return normalizeStructuredText(lines.join('\n'))
}

interface PdfTextItemLike {
  str: string
  transform?: number[]
  width?: number
  height?: number
  hasEOL?: boolean
}

interface PdfLayoutLine {
  text: string
  x: number
  endX: number
  y: number
  fontSize: number
  pageIndex: number
  position: 'top' | 'middle' | 'bottom'
  column: number
}

function isCjkCharacter(value: string): boolean {
  return /[\u2e80-\u9fff\uf900-\ufaff]/u.test(value)
}

function joinPdfFragments(previous: string, next: string, gap: number, fontSize: number): string {
  if (!previous || !next) return previous + next
  if (/\s$/u.test(previous) || /^\s/u.test(next)) return previous + next
  const left = previous.slice(-1)
  const right = next.slice(0, 1)
  if (isCjkCharacter(left) || isCjkCharacter(right)) return previous + next
  if (/^[\u3000-\u303f\u3400-\u4dbf\u4e00-\u9fff，。！？；：、）》】」』’”。，！？；：]/u.test(right)) return previous + next
  if (/^[([{"'“‘《【（「『]/u.test(left)) return previous + next
  return gap > Math.max(1.5, fontSize * 0.18) ? `${previous} ${next}` : previous + next
}

function normalizePdfLine(text: string): string {
  return text
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/gu, '')
    .replace(/[ \t]{2,}/gu, ' ')
    .trim()
}

function joinPdfLines(previous: string, next: string): string {
  const left = previous.trimEnd()
  const right = next.trimStart()
  if (!left) return right
  if (!right) return left
  // 英文单词跨行时去掉断词连字符；中文句子直接相连。
  if (/[A-Za-z0-9]-(?:\s*)$/u.test(left) && /^[a-z0-9]/u.test(right)) return `${left.slice(0, -1)}${right}`
  if (isCjkCharacter(left.slice(-1)) || isCjkCharacter(right.slice(0, 1))) return left + right
  return `${left} ${right}`
}

function pdfItemMetrics(item: PdfTextItemLike): { x: number; y: number; fontSize: number; width: number } {
  const transform = Array.isArray(item.transform) ? item.transform : []
  const x = Number.isFinite(transform[4]) ? Number(transform[4]) : 0
  const y = Number.isFinite(transform[5]) ? Number(transform[5]) : 0
  const scale = Math.max(Math.abs(Number(transform[0]) || 0), Math.abs(Number(transform[3]) || 0))
  const fontSize = Math.max(6, Math.abs(Number(item.height) || 0), scale || 12)
  const width = Math.max(0, Number(item.width) || 0)
  return { x, y, fontSize, width }
}

/**
 * 使用 PDF 文本项的坐标重建可读正文。PDF.js 返回的是绘制指令顺序，
 * 直接拼接会破坏中文、分栏、段落和英文断词。
 */
export function reconstructPdfText(pages: PdfTextItemLike[][]): string {
  const pageLines: PdfLayoutLine[][] = pages.map((items, pageIndex) => {
    const usable = items
      .map(item => ({ item, metrics: pdfItemMetrics(item) }))
      .filter(({ item }) => typeof item.str === 'string' && item.str.trim().length > 0)
    const lines: PdfLayoutLine[] = []
    // 双栏 PDF 的绘制顺序通常是按 y 轴交错的。先按 x 轴聚类，再在每栏内按 y 轴阅读，
    // 可避免左栏末尾和右栏开头被拼成同一段。
    const xs = usable.map(({ metrics }) => metrics.x)
    const minX = Math.min(...xs)
    const maxX = Math.max(...xs)
    const splitX = minX + (maxX - minX) / 2
    const leftCount = usable.filter(({ metrics }) => metrics.x <= splitX).length
    const rightCount = usable.length - leftCount
    const twoColumns = maxX - minX > 180 && leftCount >= 3 && rightCount >= 3
    usable.sort((a, b) => {
      if (twoColumns) {
        const columnA = a.metrics.x <= splitX ? 0 : 1
        const columnB = b.metrics.x <= splitX ? 0 : 1
        if (columnA !== columnB) return columnA - columnB
      }
      return b.metrics.y - a.metrics.y || a.metrics.x - b.metrics.x
    })
    usable.forEach(({ item, metrics }) => {
      const text = normalizePdfLine(item.str)
      if (!text) return
      const column = twoColumns && metrics.x > splitX ? 1 : 0
      const previous = lines[lines.length - 1]
      const tolerance = Math.max(2, Math.min(metrics.fontSize, previous?.fontSize ?? metrics.fontSize) * 0.45)
      if (previous && previous.column === column && Math.abs(previous.y - metrics.y) <= tolerance) {
        previous.text = joinPdfFragments(previous.text, text, Math.max(0, metrics.x - previous.endX), metrics.fontSize)
        previous.endX = Math.max(previous.endX, metrics.x + metrics.width)
        previous.fontSize = Math.max(previous.fontSize, metrics.fontSize)
      } else {
        lines.push({ text, x: metrics.x, endX: metrics.x + metrics.width, y: metrics.y, fontSize: metrics.fontSize, pageIndex, position: 'middle', column })
      }
    })
    lines.forEach((line, index) => {
      line.position = index < 2 ? 'top' : index >= lines.length - 2 ? 'bottom' : 'middle'
    })
    return lines
  })

  // 同一位置在多页重复出现的短行通常是页眉或页脚，正文中只保留一次也会造成噪声。
  const edgeCounts = new Map<string, number>()
  const edgeKey = (text: string) => text.replace(/\d+/gu, '#').replace(/\s+/gu, ' ').trim()
  pageLines.forEach(lines => {
    const edgeTexts = [...lines.slice(0, 2), ...lines.slice(-2)]
      .map(line => line.text)
      .filter(text => text.length >= 2 && text.length <= 120)
    new Set(edgeTexts.map(edgeKey)).forEach(key => edgeCounts.set(key, (edgeCounts.get(key) ?? 0) + 1))
  })
  const repeatedEdges = new Set([...edgeCounts.entries()].filter(([, count]) => count >= 2).map(([key]) => key))
  const output: string[] = []
  let previous: PdfLayoutLine | undefined
  pageLines.forEach(lines => {
    const filtered = lines.filter(line => !(repeatedEdges.has(edgeKey(line.text)) && (line.position === 'top' || line.position === 'bottom')))
    filtered.forEach(line => {
      if (!previous || output.length === 0) {
        output.push(line.text)
        previous = line
        return
      }
      const gap = Math.abs(previous.y - line.y)
      const expected = Math.max(previous.fontSize, line.fontSize) * 1.25
      const isList = /^(?:[•●◦▪‣·]|[-–—]|\d+[.)]|[一二三四五六七八九十百]+[、.)])/u.test(line.text)
      const isHeading = line.text.length <= 90 && (line.fontSize >= 16 || /^(?:第.{1,20}[章节篇]|Chapter\s+\d+)/iu.test(line.text))
      const pageBreak = previous.pageIndex !== line.pageIndex
      const pageParagraphBreak = pageBreak && /[。！？.!?]$/u.test(previous.text)
      const paragraphBreak = isList || isHeading || pageParagraphBreak || previous.column !== line.column || (!pageBreak && gap > expected * 1.45)
      if (paragraphBreak) output.push(`\n${line.text}`)
      else output[output.length - 1] = joinPdfLines(output[output.length - 1], line.text)
      previous = line
    })
  })
  return normalizeParagraphs(output.join('\n'))
}

/**
 * 把 HTML / XHTML 片段转换为带轻量语义的纯文本。输出采用 Markdown 兼容标记，
 * 不保留来源 HTML，避免脚本和不可信属性进入阅读器。
 */
export function htmlToPlainText(html: string): string {
  const codeBlocks: string[] = []
  let source = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<\s*(script|style|head|svg|noscript)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, ' ')

  // 先处理包含子元素的块结构，之后再统一移除剩余标签。
  source = source.replace(/<\s*pre\b[^>]*>([\s\S]*?)<\s*\/\s*pre\s*>/gi, (_match, body: string) => {
    const code = decodeHtmlEntities(body.replace(/<\s*\/?\s*code\b[^>]*>/gi, '').replace(/<[^>]*>/g, ''))
      .replace(/^\s*\n|\n\s*$/g, '')
    if (!code) return '\n\n'
    const token = `\uE000CODE${codeBlocks.length}\uE001`
    codeBlocks.push(`\`\`\`\n${code}\n\`\`\``)
    return `\n\n${token}\n\n`
  })
  source = source.replace(/<\s*table\b[^>]*>([\s\S]*?)<\s*\/\s*table\s*>/gi, (_match, tableBody: string) => {
    const rows: string[] = []
    for (const rowMatch of tableBody.matchAll(/<\s*tr\b[^>]*>([\s\S]*?)<\s*\/\s*tr\s*>/gi)) {
      const row = rowMatch[1]
      const cells = [...row.matchAll(/<\s*(td|th)\b[^>]*>([\s\S]*?)<\s*\/\s*\1\s*>/gi)]
      if (cells.length === 0) continue
      rows.push(`| ${cells.map(cell => stripMarkup(cell[2]).replace(/\|/g, '\\|')).join(' | ')} |`)
      // Mammoth 等转换器常把表头也输出为 td；统一把首行作为表头，确保 Markdown 可还原为表格。
      if (rows.length === 1) rows.push(`| ${cells.map(() => '---').join(' | ')} |`)
    }
    return rows.length > 0 ? `\n\n${rows.join('\n')}\n\n` : '\n\n'
  })
  // 脚注标记不能在清洗时消失；保留为可读的 [注: ...]，正文脚注区另行折叠成段落。
  source = source
    .replace(/<\s*(?:sup|a)\b[^>]*(?:epub:type=["']noteref["']|role=["']doc-noteref["']|class=["'][^"']*footnote[^"']*["'])[^>]*>([\s\S]*?)<\s*\/\s*(?:sup|a)\s*>/gi, (_match, body: string) => ` [注: ${stripMarkup(body)}] `)
    .replace(/<\s*sup\b[^>]*>([\s\S]*?)<\s*\/\s*sup\s*>/gi, (_match, body: string) => ` [${stripMarkup(body)}] `)
    .replace(/<\s*(?:aside|section|div)\b[^>]*(?:epub:type|class)=["'][^"']*(?:footnote|footnotes|endnote|endnotes)[^"']*["'][^>]*>([\s\S]*?)<\s*\/\s*(?:aside|section|div)\s*>/gi, (_match, body: string) => {
      const note = stripMarkup(body)
      return note ? `\n\n> 脚注：${note}\n\n` : '\n\n'
    })
  source = source.replace(/<\s*blockquote\b[^>]*>([\s\S]*?)<\s*\/\s*blockquote\s*>/gi, (_match, body: string) => {
    const quote = stripMarkup(body)
    return quote ? `\n\n> ${quote}\n\n` : '\n\n'
  })

  source = source.replace(/<\s*(ol|ul)\b[^>]*>([\s\S]*?)<\s*\/\s*\1\s*>/gi, (_match, kind: string, body: string) => {
    let index = 0
    const items = [...body.matchAll(/<\s*li\b[^>]*>([\s\S]*?)<\s*\/\s*li\s*>/gi)]
      .map(item => {
        index += 1
        const text = stripMarkup(item[1])
        return text ? `${kind.toLowerCase() === 'ol' ? `${index}.` : '-'} ${text}` : ''
      })
      .filter(Boolean)
    return items.length > 0 ? `\n\n${items.join('\n')}\n\n` : '\n\n'
  })

  const withBreaks = source
    .replace(/<\s*h([1-6])\b[^>]*>([\s\S]*?)<\s*\/\s*h\1\s*>/gi, (_match, level: string, body: string) => {
      const heading = stripMarkup(body)
      return heading ? `\n\n${'#'.repeat(Number(level))} ${heading}\n\n` : '\n\n'
    })
    .replace(/<\s*(?:strong|b)\b[^>]*>([\s\S]*?)<\s*\/\s*(?:strong|b)\s*>/gi, '**$1**')
    .replace(/<\s*(?:em|i)\b[^>]*>([\s\S]*?)<\s*\/\s*(?:em|i)\s*>/gi, '*$1*')
    .replace(/<\s*code\b[^>]*>([\s\S]*?)<\s*\/\s*code\s*>/gi, '`$1`')
    .replace(/<\s*img\b[^>]*\balt=(?:"([^"]*)"|'([^']*)')[^>]*>/gi, (_match, doubleAlt: string, singleAlt: string) => {
      const alt = decodeHtmlEntities(doubleAlt || singleAlt || '').trim()
      return alt ? `[图片：${alt}]` : ''
    })
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\s*(hr)\s*\/?\s*>/gi, '\n\n')
    .replace(/<\s*empty-line\s*\/?\s*>/gi, '\n\n')
    .replace(/<\s*\/\s*(p|div|section|article|header|footer|figcaption|figure|details|summary|body|subtitle|poem|stanza|v)\s*>/gi, '\n\n')
    .replace(/<\s*\/\s*(h[1-6]|li|dt|dd)\s*>/gi, '\n\n')
    .replace(/<\s*(li)\b[^>]*>/gi, '\n· ')
    .replace(/<[^>]*>/g, ' ')
  let output = normalizeStructuredText(decodeHtmlEntities(withBreaks).replace(/[ \t]{2,}/g, ' '))
  codeBlocks.forEach((block, index) => {
    output = output.replace(`\uE000CODE${index}\uE001`, block)
  })
  return cleanExtractedText(output)
}

function firstMatch(source: string, pattern: RegExp): string | undefined {
  const match = source.match(pattern)
  const value = match?.[1] ? stripMarkup(match[1]) : ''
  return value || undefined
}

function extToMime(path: string): string {
  const ext = getFileExtension(path)
  return COVER_MIME_BY_EXT[ext] || 'image/jpeg'
}

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof btoa === 'function') {
    let binary = ''
    const chunkSize = 0x8000
    for (let index = 0; index < bytes.length; index += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize))
    }
    return btoa(binary)
  }
  return Buffer.from(bytes).toString('base64')
}

function bytesToDataUrl(bytes: Uint8Array, mime: string): string | undefined {
  if (bytes.length === 0 || bytes.length > MAX_COVER_BYTES) return undefined
  return `data:${mime};base64,${bytesToBase64(bytes)}`
}

async function blobUrlToDataUrl(url: string, fallbackMime: string): Promise<string | undefined> {
  try {
    const response = await fetch(url)
    const blob = await response.blob()
    if (blob.size === 0 || blob.size > MAX_COVER_BYTES) return undefined
    const bytes = new Uint8Array(await blob.arrayBuffer())
    return bytesToDataUrl(bytes, blob.type || fallbackMime)
  } catch (error) {
    logger.debug('封面读取失败:', error)
    return undefined
  }
}

function splitMarkdownChapters(text: string): ParsedChapter[] {
  const lines = normalizeStructuredText(text).split('\n')
  const chapters: ParsedChapter[] = []
  let title = ''
  let buffer: string[] = []
  let inFence = false

  const flush = () => {
    const body = buffer.join('\n').trim()
    if (!title && !body) return
    chapters.push({ title: title || `第 ${chapters.length + 1} 节`, content: body })
    buffer = []
  }

  for (const line of lines) {
    if (/^\s*```/.test(line)) inFence = !inFence
    const heading = inFence ? null : line.match(/^#{1,3}\s+(.+?)\s*#*\s*$/)
    if (heading) {
      flush()
      title = heading[1].replace(/[*_`~]/g, '').trim()
      continue
    }
    buffer.push(line)
  }
  flush()
  return chapters.filter(chapter => chapter.content.length > 0)
}

const TXT_CHAPTER_PATTERN = /^\s*(?:第\s*[0-9一二三四五六七八九十百千万]+\s*[章节回卷篇](?:\s+|[:：、.-])?.*|Chapter\s+(?:\d+|[IVXLC]+)\b.*)$/i

function splitPlainTextChapters(text: string): ParsedChapter[] {
  const lines = text.split('\n')
  const starts: number[] = []
  lines.forEach((line, index) => {
    if (TXT_CHAPTER_PATTERN.test(line) && line.trim().length <= 60) starts.push(index)
  })
  if (starts.length < 2) return [{ title: '正文', content: text.trim() }]

  const chapters: ParsedChapter[] = []
  const preface = lines.slice(0, starts[0]).join('\n').trim()
  if (preface) chapters.push({ title: '序', content: preface })
  starts.forEach((start, index) => {
    const end = index + 1 < starts.length ? starts[index + 1] : lines.length
    const block = lines.slice(start, end)
    const title = block[0].trim()
    const content = block.slice(1).join('\n').trim()
    if (content) chapters.push({ title, content })
  })
  return chapters
}

// ========================================
// 解析：纯文本类
// ========================================

async function parseTextFile(file: File): Promise<{ content: string; chapters?: ParsedChapter[] }> {
  const text = normalizeStructuredText(await file.text())
  return { content: text, chapters: splitPlainTextChapters(text) }
}

async function parseMarkdownFile(file: File): Promise<{ content: string; chapters?: ParsedChapter[] }> {
  const text = normalizeStructuredText(await file.text())
  const chapters = splitMarkdownChapters(text)
  return { content: text, chapters: chapters.length > 0 ? chapters : undefined }
}

async function parseJsonFile(file: File): Promise<{ content: string; chapters?: ParsedChapter[] }> {
  try {
    const value = JSON.parse(await file.text())
    const content = `\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\``
    return { content, chapters: [{ title: '正文', content }] }
  } catch {
    throw new Error('JSON 解析失败：文件不是有效的 JSON。请修正语法后重试。')
  }
}

// ========================================
// 解析：HTML / XHTML
// ========================================

async function parseHtmlFile(file: File): Promise<{
  content: string
  title?: string
  chapters?: ParsedChapter[]
}> {
  const html = await file.text()
  const content = htmlToPlainText(html)
  const title = firstMatch(html, /<title[^>]*>([\s\S]*?)<\/title>/i) ||
    firstMatch(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i)
  const chapters = splitMarkdownChapters(content)
  if (chapters.length === 0) chapters.push({ title: title || '正文', content })
  return { content, title, chapters }
}

// ========================================
// 解析：EPUB
// ========================================

function resolveZipPath(base: string, relative: string): string {
  let clean = relative.split('#')[0].split('?')[0]
  try { clean = decodeURIComponent(clean) } catch { /* 保留原始路径 */ }
  if (!clean) return base
  const stack = base ? base.split('/').filter(Boolean) : []
  for (const part of clean.split('/')) {
    if (!part || part === '.') continue
    if (part === '..') stack.pop()
    else stack.push(part)
  }
  return stack.join('/')
}

function dirname(path: string): string {
  const index = path.lastIndexOf('/')
  return index === -1 ? '' : path.slice(0, index)
}

export async function parseEpub(file: File): Promise<{
  content: string
  title?: string
  author?: string
  description?: string
  cover?: string
  chapters: ParsedChapter[]
}> {
  const JSZip = (await import('jszip')).default
  const zip = await JSZip.loadAsync(await file.arrayBuffer())

  const encryption = zip.file('META-INF/encryption.xml')
  if (encryption) {
    const encryptionXml = await encryption.async('text')
    if (/EncryptedData|encryption/i.test(encryptionXml)) {
      throw new Error('该书带有 DRM 加密（META-INF/encryption.xml），无法解析。请使用无 DRM 的 EPUB 文件。')
    }
  }

  const containerFile = zip.file('META-INF/container.xml')
  if (!containerFile) throw new Error('EPUB 结构不完整：缺少 META-INF/container.xml')
  const containerXml = await containerFile.async('text')
  const rootfile = containerXml.match(/full-path="([^"]+)"/i)?.[1]
  if (!rootfile) throw new Error('EPUB 结构不完整：未找到 OPF 包文件')

  const opfFile = zip.file(rootfile)
  if (!opfFile) throw new Error('EPUB 结构不完整：OPF 文件缺失')
  const opf = await opfFile.async('text')
  const opfDir = dirname(rootfile)

  const title = firstMatch(opf, /<dc:title[^>]*>([\s\S]*?)<\/dc:title>/i) ||
    firstMatch(opf, /<title[^>]*>([\s\S]*?)<\/title>/i)
  const author = firstMatch(opf, /<dc:creator[^>]*>([\s\S]*?)<\/dc:creator>/i)
  const description = firstMatch(opf, /<dc:description[^>]*>([\s\S]*?)<\/dc:description>/i)

  // manifest：id -> { href, mediaType, properties }
  const manifest = new Map<string, { href: string; mediaType: string; properties: string }>()
  for (const item of opf.matchAll(/<item\b([^>]*)\/?>/gi)) {
    const attrs = item[1]
    const id = attrs.match(/\bid="([^"]*)"/i)?.[1]
    const href = attrs.match(/\bhref="([^"]*)"/i)?.[1]
    if (!id || !href) continue
    manifest.set(id, {
      href: decodeURIComponent(href),
      mediaType: attrs.match(/\bmedia-type="([^"]*)"/i)?.[1] || '',
      properties: attrs.match(/\bproperties="([^"]*)"/i)?.[1] || ''
    })
  }

  const spineIds = [...opf.matchAll(/<itemref\b([^>]*)\/?>/gi)].map(item => item[1].match(/\bidref="([^"]*)"/i)?.[1] || '')
  const spine = spineIds.map(id => manifest.get(id)).filter((item): item is NonNullable<typeof item> => Boolean(item))
  if (spine.length === 0) throw new Error('EPUB 内容为空：书脊（spine）没有可读取的章节')

  const tocLabels = new Map<string, string>()
  const registerTocLabel = (href: string, label: string) => {
    const clean = href.split('#')[0]
    tocLabels.set(clean, label)
    tocLabels.set(resolveZipPath(opfDir, clean), label)
  }
  const navItem = [...manifest.values()].find(item => /nav/i.test(item.properties) || /nav/i.test(item.href))
  if (navItem) {
    const navFile = zip.file(resolveZipPath(opfDir, navItem.href))
    if (navFile) {
      const nav = await navFile.async('text')
      for (const match of nav.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
        const label = stripMarkup(match[2])
        if (label) registerTocLabel(match[1], label)
      }
    }
  }
  const ncxItem = [...manifest.values()].find(item => /application\/x-dtbncx\+xml/i.test(item.mediaType) || /\.ncx$/i.test(item.href))
  if (ncxItem) {
    const ncxFile = zip.file(resolveZipPath(opfDir, ncxItem.href))
    if (ncxFile) {
      const ncx = await ncxFile.async('text')
      for (const match of ncx.matchAll(/<navPoint\b[\s\S]*?<text>([\s\S]*?)<\/text>[\s\S]*?<content\b[^>]*src=["']([^"']+)["']/gi)) {
        const label = stripMarkup(match[1])
        if (label) registerTocLabel(match[2], label)
      }
    }
  }

  const chapters: ParsedChapter[] = []
  for (const item of spine) {
    if (!/html|xml/i.test(item.mediaType) && !/\.(x?html?|xml)$/i.test(item.href)) continue
    const entry = zip.file(resolveZipPath(opfDir, item.href))
    if (!entry) continue
    const html = await entry.async('text')
    let content = htmlToPlainText(html)
    if (!content) continue
    const heading = firstMatch(html, /<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/i)
    const chapterTitle = normalizeChapterTitle(tocLabels.get(item.href) || tocLabels.get(resolveZipPath(opfDir, item.href)) || heading || '', `第 ${chapters.length + 1} 节`)
    content = removeLeadingHeading(content, chapterTitle)
    if (content) chapters.push({ title: chapterTitle, content })
  }
  if (chapters.length === 0) throw new Error('EPUB 内容为空或无法提取文本')

  // 封面：优先 properties="cover-image"，退回 <meta name="cover">
  let coverHref = [...manifest.values()].find(item => /\bcover-image\b/i.test(item.properties))?.href
  if (!coverHref) {
    const coverId = opf.match(/<meta[^>]*name="cover"[^>]*content="([^"]*)"/i)?.[1]
    coverHref = coverId ? manifest.get(coverId)?.href : undefined
  }
  if (!coverHref) coverHref = [...manifest.values()].find(item => /image\//i.test(item.mediaType) && /cover|封面/i.test(item.href))?.href
  let cover: string | undefined
  if (coverHref) {
    const entry = zip.file(resolveZipPath(opfDir, coverHref))
    if (entry) {
      const bytes = new Uint8Array(await entry.async('uint8array'))
      const mime = manifest.get([...manifest.keys()].find(id => manifest.get(id)?.href === coverHref) || '')?.mediaType || extToMime(coverHref)
      cover = bytesToDataUrl(bytes, mime)
    }
  }

  const content = chapters.map(chapter => `${chapter.title}\n\n${chapter.content}`).join('\n\n')
  return { content, title, author, description, cover, chapters }
}

// ========================================
// 解析：MOBI / AZW / AZW3 / PRC
// ========================================

export async function parseMobi(file: File): Promise<{
  content: string
  title?: string
  author?: string
  description?: string
  cover?: string
  chapters: ParsedChapter[]
}> {
  const { initMobiFile, initKf8File } = await import('@lingo-reader/mobi-parser')
  const fileBuffer = new Uint8Array(await file.arrayBuffer())

  let book: Awaited<ReturnType<typeof initMobiFile>> | Awaited<ReturnType<typeof initKf8File>> | undefined
  let lastError: unknown
  for (const init of [initMobiFile, initKf8File]) {
    try {
      book = await init(new Uint8Array(fileBuffer))
      break
    } catch (error) {
      lastError = error
      logger.debug('MOBI 解析器初始化失败，尝试下一种模式:', error)
    }
  }
  if (!book) {
    throw new Error(`MOBI / AZW3 解析失败：${lastError instanceof Error ? lastError.message : '文件可能已加密或损坏'}`)
  }

  try {
    const metadata = book.getMetadata()
    const chapters: ParsedChapter[] = []
    const tocLabels = new Map<string, string>()
    try {
      const toc = book.getToc() as Array<{ label?: string; href?: string; children?: unknown[] }>
      const walk = (items: Array<{ label?: string; href?: string; children?: unknown[] }>) => {
        for (const item of items || []) {
          if (item?.href && item?.label) tocLabels.set(item.href.split('#')[0], item.label)
          if (item?.children) walk(item.children as Array<{ label?: string; href?: string; children?: unknown[] }>)
        }
      }
      walk(toc)
    } catch {
      // 部分 MOBI 没有 NCX 目录，忽略即可。
    }

    for (const item of book.getSpine()) {
      let html = ''
      try {
        html = book.loadChapter(item.id)?.html || ''
      } catch (error) {
        logger.debug('MOBI 章节读取失败:', item.id, error)
      }
      let content = html ? htmlToPlainText(html) : (book as { getSpine(): Array<{ text?: string }> }).getSpine().find(entry => entry === item)?.text || ''
      if (!content) continue
      const heading = html ? firstMatch(html, /<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/i) : undefined
      const chapterTitle = normalizeChapterTitle((item.id && tocLabels.get(item.id)) || heading || '', `第 ${chapters.length + 1} 节`)
      content = removeLeadingHeading(normalizeStructuredText(content), chapterTitle)
      if (!content) continue
      chapters.push({
        title: chapterTitle,
        content
      })
    }
    if (chapters.length === 0) throw new Error('MOBI 内容为空或无法提取文本')

    let cover: string | undefined
    try {
      const coverage = book.getCoverImage()
      if (coverage) cover = await blobUrlToDataUrl(coverage, 'image/jpeg')
    } catch (error) {
      logger.debug('MOBI 封面读取失败:', error)
    }

    const content = chapters.map(chapter => `${chapter.title}\n\n${chapter.content}`).join('\n\n')
    return {
      content,
      title: metadata.title?.trim() || undefined,
      author: metadata.author?.filter(Boolean).join('、') || undefined,
      description: metadata.description?.trim() || undefined,
      cover,
      chapters
    }
  } finally {
    try {
      book.destroy()
    } catch {
      // 释放失败不影响解析结果。
    }
  }
}

// ========================================
// 解析：FB2
// ========================================

function extractTopLevelTagContents(source: string, tagName: string): string[] {
  const tag = new RegExp(`<\\/?${tagName}\\b[^>]*>`, 'gi')
  const contents: string[] = []
  let depth = 0
  let contentStart = -1
  let match: RegExpExecArray | null
  while ((match = tag.exec(source))) {
    const closing = /^<\s*\//.test(match[0])
    const selfClosing = /\/\s*>$/.test(match[0])
    if (!closing) {
      if (depth === 0) contentStart = match.index + match[0].length
      if (!selfClosing) depth += 1
    } else if (depth > 0) {
      depth -= 1
      if (depth === 0 && contentStart >= 0) {
        contents.push(source.slice(contentStart, match.index))
        contentStart = -1
      }
    }
  }
  return contents
}

function fb2SectionToStructuredText(sectionXml: string): string {
  return htmlToPlainText(sectionXml
    .replace(/<\s*title\b[^>]*>([\s\S]*?)<\s*\/\s*title\s*>/gi, '<h2>$1</h2>')
    .replace(/<\s*subtitle\b[^>]*>/gi, '<h3>')
    .replace(/<\s*\/\s*subtitle\s*>/gi, '</h3>')
    .replace(/<\s*epigraph\b[^>]*>/gi, '<blockquote>')
    .replace(/<\s*\/\s*epigraph\s*>/gi, '</blockquote>'))
}

export async function parseFb2(file: File): Promise<{
  content: string
  title?: string
  author?: string
  description?: string
  cover?: string
  chapters: ParsedChapter[]
}> {
  const xml = await file.text()
  if (!/<FictionBook/i.test(xml)) throw new Error('FB2 解析失败：文件不是有效的 FictionBook XML')

  const title = firstMatch(xml, /<book-title[^>]*>([\s\S]*?)<\/book-title>/i)
  const firstNames = [...xml.matchAll(/<first-name[^>]*>([\s\S]*?)<\/first-name>/gi)].map(match => decodeHtmlEntities(match[1]).trim())
  const lastNames = [...xml.matchAll(/<last-name[^>]*>([\s\S]*?)<\/last-name>/gi)].map(match => decodeHtmlEntities(match[1]).trim())
  const author = firstNames.length > 0
    ? firstNames.map((firstName, index) => `${firstName} ${lastNames[index] || ''}`.trim()).filter(Boolean).join('、')
    : undefined
  const description = firstMatch(xml, /<annotation[^>]*>([\s\S]*?)<\/annotation>/i)

  let cover: string | undefined
  const coverId = xml.match(/<coverpage>[\s\S]*?<image\b[^>]*(?:l:)?href=["']#([^"']+)["'][^>]*\/?>(?:[\s\S]*?<\/coverpage>)/i)?.[1]
  if (coverId) {
    const binary = xml.match(new RegExp(`<binary\\b[^>]*id=["']${coverId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["'][^>]*>([\\s\\S]*?)<\\/binary>`, 'i'))
    const encoded = binary?.[1]?.replace(/\s+/gu, '')
    if (encoded) {
      try {
        const bytes = typeof atob === 'function'
          ? Uint8Array.from(atob(encoded), char => char.charCodeAt(0))
          : new Uint8Array(Buffer.from(encoded, 'base64'))
        const mime = binary?.[0].match(/content-type=["']([^"']+)["']/i)?.[1] || 'image/jpeg'
        cover = bytesToDataUrl(bytes, mime)
      } catch (error) {
        logger.debug('FB2 封面读取失败:', error)
      }
    }
  }

  const bodyMatch = xml.match(/<body(?:\s[^>]*)?>([\s\S]*?)<\/body>/i)
  const body = bodyMatch?.[1] || xml
  const sections = extractTopLevelTagContents(body, 'section')
  const chapters: ParsedChapter[] = []
  const collect = (sectionXml: string, index: number) => {
    const sectionTitle = firstMatch(sectionXml, /<title[^>]*>([\s\S]*?)<\/title>/i)
    const chapterTitle = normalizeChapterTitle(sectionTitle || '', `第 ${index + 1} 节`)
    const content = fb2SectionToStructuredText(sectionXml.replace(/<title[^>]*>[\s\S]*?<\/title>/i, ' '))
    if (content) chapters.push({ title: chapterTitle, content })
  }
  if (sections.length > 0) sections.forEach(collect)
  else collect(body, 0)
  if (chapters.length === 0) throw new Error('FB2 内容为空或无法提取文本')
  if (!title && !author && chapters.length === 0) throw new Error('FB2 解析失败：缺少可读内容')

  const content = chapters.map(chapter => `${chapter.title}\n\n${chapter.content}`).join('\n\n')
  return { content, title, author, description, cover, chapters }
}

// ========================================
// 解析：RTF
// ========================================

const RTF_CODEPAGES: Record<number, string> = {
  936: 'gb18030',
  950: 'big5',
  65001: 'utf-8',
  1252: 'windows-1252'
}

function decodeRtfBytes(bytes: number[], encoding: string): string {
  try {
    return new TextDecoder(encoding).decode(new Uint8Array(bytes))
  } catch {
    return new TextDecoder('utf-8').decode(new Uint8Array(bytes))
  }
}

/** 轻量 RTF → 语义文本：忽略格式表/图片等目标域，保留 Unicode、段落、列表与表格边界。 */
export function rtfToPlainText(rtf: string): string {
  const codepage = Number(rtf.match(/\\ansicpg(\d+)/)?.[1] || 1252)
  const encoding = RTF_CODEPAGES[codepage] || 'windows-1252'
  const ignoredDestinations = new Set(['fonttbl', 'colortbl', 'stylesheet', 'info', 'pict', 'object', 'themedata', 'datastore', 'latentstyles', 'listtable', 'listoverridetable', 'rsidtbl', 'generator', 'xmlnstbl'])

  let output = ''
  let index = 0
  let groupDepth = 0
  let skippedDepth = -1
  const bytes: number[] = []

  const flushBytes = () => {
    if (bytes.length === 0) return
    output += decodeRtfBytes(bytes, encoding)
    bytes.length = 0
  }

  while (index < rtf.length) {
    const char = rtf[index]
    if (char === '{') {
      groupDepth += 1
      index += 1
      continue
    }
    if (char === '}') {
      if (skippedDepth === groupDepth) skippedDepth = -1
      groupDepth -= 1
      index += 1
      continue
    }
    if (char !== '\\') {
      if (skippedDepth === -1) {
        flushBytes()
        // RTF 源文件里的物理换行只是排版，真正的正文换行由 \par / \line 表示。
        if (char !== '\n' && char !== '\r') output += char
      }
      index += 1
      continue
    }

    // 控制字符
    const next = rtf[index + 1]
    if (next === '*') {
      flushBytes()
      if (skippedDepth === -1) skippedDepth = groupDepth
      index += 2
      continue
    }
    if (next === '\\' || next === '{' || next === '}') {
      if (skippedDepth === -1) {
        flushBytes()
        output += next
      }
      index += 2
      continue
    }
    if (next === "'") {
      const hex = rtf.slice(index + 2, index + 4)
      const value = Number.parseInt(hex, 16)
      if (Number.isFinite(value)) {
        if (skippedDepth === -1) bytes.push(value)
        index += 4
        continue
      }
    }

    const wordMatch = rtf.slice(index).match(/^\\([a-zA-Z]+)(-?\d+)?[ ]?/)
    if (wordMatch) {
      const word = wordMatch[1]
      const param = wordMatch[2]
      if (word === 'u' && param !== undefined) {
        if (skippedDepth === -1) {
          flushBytes()
          const code = Number.parseInt(param, 10)
          output += code < 0 ? String.fromCodePoint(code + 65536) : String.fromCodePoint(code)
          // \uN 后面通常跟一个可忽略的回退字符
          const fallback = rtf.slice(index + wordMatch[0].length)
          const fallbackMatch = fallback.match(/^(\\'[0-9a-fA-F]{2}|\?)/)
          index += wordMatch[0].length + (fallbackMatch?.[0].length || 0)
          continue
        }
      } else if (word === 'par' || word === 'page' || word === 'sect') {
        if (skippedDepth === -1) {
          flushBytes()
          output += '\n\n'
        }
      } else if (word === 'line') {
        if (skippedDepth === -1) {
          flushBytes()
          output += '\n'
        }
      } else if (word === 'tab') {
        if (skippedDepth === -1) {
          flushBytes()
          output += ' '
        }
      } else if (word === 'cell') {
        if (skippedDepth === -1) {
          flushBytes()
          output += ' | '
        }
      } else if (word === 'trowd') {
        if (skippedDepth === -1) {
          flushBytes()
          if (output.trimEnd().length > 0) output += '\n'
          output += '| '
        }
      } else if (word === 'row') {
        if (skippedDepth === -1) {
          flushBytes()
          output += '\n\n'
        }
      } else if (word === 'bullet') {
        if (skippedDepth === -1) {
          flushBytes()
          output += '- '
        }
      } else if (word === 'emdash' || word === 'endash') {
        if (skippedDepth === -1) {
          flushBytes()
          output += word === 'emdash' ? '—' : '–'
        }
      } else if (word === 'lquote' || word === 'rquote' || word === 'ldblquote' || word === 'rdblquote') {
        if (skippedDepth === -1) {
          flushBytes()
          output += word === 'lquote' ? '‘' : word === 'rquote' ? '’' : word === 'ldblquote' ? '“' : '”'
        }
      } else if (word === 'outlinelevel' && param !== undefined) {
        if (skippedDepth === -1) {
          flushBytes()
          const level = Math.min(6, Math.max(1, Number.parseInt(param, 10) + 1))
          if (output.trimEnd().length > 0) output += '\n\n'
          output += `${'#'.repeat(level)} `
        }
      } else if (ignoredDestinations.has(word)) {
        if (skippedDepth === -1) skippedDepth = groupDepth
      }
      index += wordMatch[0].length
      continue
    }

    index += 1
  }

  flushBytes()
  return normalizeStructuredText(output).replace(/^(?:[•●◦▪‣·])\s*/gm, '- ')
}

async function parseRtfFile(file: File): Promise<{ content: string; chapters?: ParsedChapter[] }> {
  const rtf = await file.text()
  const content = rtfToPlainText(rtf)
  const markdownChapters = splitMarkdownChapters(content)
  return { content, chapters: markdownChapters.length > 1 || /^#{1,3}\s/m.test(content) ? markdownChapters : splitPlainTextChapters(content) }
}

// ========================================
// 解析：PDF / DOCX
// ========================================

async function parsePDF(file: File): Promise<{ content: string; title?: string; cover?: string; chapters?: ParsedChapter[] }> {
  try {
    const pdfjsLib = await import('pdfjs-dist')

    pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'

    const arrayBuffer = await file.arrayBuffer()
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer, isEvalSupported: false })
    const pdf = await loadingTask.promise

    const pageItems: PdfTextItemLike[][] = []
    const numPages = pdf.numPages

    if (numPages > MAX_DOCUMENT_PAGES) {
      throw new Error(`PDF 页数不能超过 ${MAX_DOCUMENT_PAGES} 页`)
    }

    logger.debug(`PDF 共 ${numPages} 页`)

    let firstPage: Awaited<ReturnType<typeof pdf.getPage>> | undefined
    for (let i = 1; i <= numPages; i++) {
      const page = await pdf.getPage(i)
      if (i === 1) firstPage = page
      const textContent = await page.getTextContent()
      pageItems.push(textContent.items.filter(item => 'str' in item).map(item => ({
        str: item.str || '',
        transform: item.transform,
        width: item.width,
        height: item.height,
        hasEOL: item.hasEOL
      })))
    }

    const content = reconstructPdfText(pageItems)
    const replacementCount = (content.match(/\uFFFD/gu) || []).length
    const privateUseCount = (content.match(/[\u{e000}-\u{f8ff}\u{f0000}-\u{ffffd}]/gu) || []).length
    const readableCount = (content.match(/[\p{L}\p{N}\p{P}\p{S}]/gu) || []).length
    if (!content || readableCount < 2) {
      throw new Error('这个 PDF 没有可提取的文字层，可能是扫描件。请先使用 OCR 生成可搜索 PDF 后重试。')
    }
    if (replacementCount > 0 && replacementCount / Math.max(1, content.length) > 0.02) {
      throw new Error('这个 PDF 的字体编码无法可靠还原文字，已停止导入以避免乱码。请换用带文字层的 PDF 或先导出为 EPUB / DOCX。')
    }
    if (privateUseCount > 0 && privateUseCount / Math.max(1, content.length) > 0.2) {
      throw new Error('这个 PDF 使用了无法映射到 Unicode 的私有字体编码，已停止导入以避免乱码。请换用带文字层的 PDF 或先导出为 EPUB / DOCX。')
    }
    const metadata = await pdf.getMetadata().catch(() => undefined)
    const info = (metadata?.info || {}) as Record<string, unknown>
    const title = typeof info.Title === 'string' && info.Title.trim() ? info.Title.trim() : undefined

    // PDF 没有统一的封面字段，优先把第一页按原比例渲染成小图，失败时保持无封面但不影响正文。
    let cover: string | undefined
    try {
      if (firstPage && typeof document !== 'undefined') {
        const viewport = firstPage.getViewport({ scale: 0.45 })
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.round(viewport.width))
        canvas.height = Math.max(1, Math.round(viewport.height))
        const context = canvas.getContext('2d')
        if (context) {
          await firstPage.render({ canvasContext: context, viewport }).promise
          const renderedCover = canvas.toDataURL('image/jpeg', 0.78)
          // data URL 约四分之一是编码开销，按原始封面上限估算，避免把书架快照撑大。
          if (renderedCover.length <= Math.ceil(MAX_COVER_BYTES * 1.4)) cover = renderedCover
        }
      }
    } catch (error) {
      logger.debug('PDF 封面渲染失败:', error)
    }

    const outline = await pdf.getOutline().catch(() => null)
    const outlineTitles: string[] = []
    const walkOutline = (items: unknown) => {
      if (!Array.isArray(items)) return
      items.forEach(item => {
        const value = item as { title?: unknown; items?: unknown }
        if (typeof value.title === 'string' && value.title.trim()) outlineTitles.push(value.title.trim())
        walkOutline(value.items)
      })
    }
    walkOutline(outline)
    const chapters: ParsedChapter[] = []
    let cursor = 0
    outlineTitles.forEach((heading, index) => {
      const start = content.indexOf(heading, cursor)
      if (start < 0) return
      if (start > cursor && !chapters.length) chapters.push({ title: '序', content: content.slice(cursor, start).trim() })
      const nextHeading = outlineTitles.slice(index + 1).map(item => content.indexOf(item, start + heading.length)).find(value => value >= 0)
      const end = nextHeading ?? content.length
      const body = content.slice(start + heading.length, end).trim()
      if (body) chapters.push({ title: heading, content: body })
      cursor = end
    })
    if (chapters.length === 0) chapters.push({ title: title || '正文', content })
    return { content, title, cover, chapters }
  } catch (error) {
    logger.error('PDF 解析错误:', error)
    throw new Error(`PDF 解析失败: ${error instanceof Error ? error.message : '请确保文件未加密且格式正确'}`)
  }
}

async function parseWord(file: File): Promise<{ content: string; chapters?: ParsedChapter[] }> {
  try {
    const mammoth = await import('mammoth')
    const arrayBuffer = await file.arrayBuffer()
    const options = {
      styleMap: [
        "p[style-name='Title'] => h1:fresh",
        "p[style-name='Subtitle'] => h2:fresh",
        "p[style-name='Quote'] => blockquote:fresh",
        "p[style-name='Intense Quote'] => blockquote:fresh",
        "p[style-name='Code'] => pre:fresh"
      ]
    }
    let result: Awaited<ReturnType<typeof mammoth.convertToHtml>>
    try {
      result = await mammoth.convertToHtml({ arrayBuffer }, options)
    } catch (browserInputError) {
      // mammoth 的浏览器构建接收 ArrayBuffer，Node/Jest 构建接收 Buffer。
      if (typeof Buffer === 'undefined') throw browserInputError
      result = await mammoth.convertToHtml({ buffer: Buffer.from(arrayBuffer) }, options)
    }
    const content = htmlToPlainText(result.value)
    const markdownChapters = splitMarkdownChapters(content)
    return { content, chapters: markdownChapters.length > 1 || /^#{1,3}\s/m.test(content) ? markdownChapters : splitPlainTextChapters(content) }
  } catch (error) {
    logger.error('Word 解析错误:', error)
    throw new Error('Word 文档解析失败，仅支持 .docx 格式')
  }
}

/** 旧版 .doc：先按 OLE 复合文档解析二进制 Word，再兼容实际是 RTF / HTML 的同名文件。 */
async function parseLegacyWordFile(file: File): Promise<{ content: string; chapters?: ParsedChapter[] }> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  if (isCompoundFile(bytes)) {
    const content = normalizeStructuredText(extractLegacyWordText(bytes))
    return { content, chapters: splitPlainTextChapters(content) }
  }

  const text = await file.text()
  const head = text.slice(0, 4096).trimStart().toLowerCase()
  if (head.startsWith('{\\rtf')) {
    const content = rtfToPlainText(text)
    const markdownChapters = splitMarkdownChapters(content)
    return { content, chapters: markdownChapters.length > 1 || /^#{1,3}\s/m.test(content) ? markdownChapters : splitPlainTextChapters(content) }
  }
  if (head.startsWith('<!doctype html') || head.startsWith('<html')) {
    const content = htmlToPlainText(text)
    const markdownChapters = splitMarkdownChapters(content)
    return { content, chapters: markdownChapters.length > 1 || /^#{1,3}\s/m.test(content) ? markdownChapters : splitPlainTextChapters(content) }
  }

  throw new Error('无法识别这个 .doc 文件的内容结构。请用 Word / WPS 打开后另存为 .docx，或导出为 PDF 后重试。')
}

// ========================================
// 主解析函数
// ========================================

export async function parseDocument(file: File): Promise<ParsedDocument> {
  const ext = getFileExtension(file.name)
  const normalizedExt = `.${ext}`

  if (UNSUPPORTED_BOOK_FORMATS.includes(normalizedExt)) {
    throw new Error(describeUnsupportedFormat(ext, 'zh'))
  }
  if (!SUPPORTED_FILE_TYPES.includes(normalizedExt)) {
    throw new Error(describeUnsupportedFormat(ext, 'zh'))
  }

  if (file.size > MAX_DOCUMENT_FILE_SIZE) {
    throw new Error('文件大小不能超过 20MB')
  }

  logger.debug(`开始解析文件: ${file.name}, 类型: ${ext}, 大小: ${file.size} bytes`)

  let parsed: {
    content: string
    title?: string
    author?: string
    description?: string
    cover?: string
    chapters?: ParsedChapter[]
  }

  try {
    switch (ext) {
      case 'epub':
        parsed = await parseEpub(file)
        break
      case 'mobi':
      case 'azw':
      case 'azw3':
      case 'prc':
        parsed = await parseMobi(file)
        break
      case 'fb2':
        parsed = await parseFb2(file)
        break
      case 'html':
      case 'htm':
      case 'xhtml':
        parsed = await parseHtmlFile(file)
        break
      case 'rtf':
        parsed = await parseRtfFile(file)
        break
      case 'pdf':
        parsed = await parsePDF(file)
        break
      case 'docx':
        parsed = await parseWord(file)
        break
      case 'doc':
        parsed = await parseLegacyWordFile(file)
        break
      case 'md':
      case 'markdown':
        parsed = await parseMarkdownFile(file)
        break
      case 'txt':
        parsed = await parseTextFile(file)
        break
      case 'json':
        parsed = await parseJsonFile(file)
        break
      default:
        throw new Error(describeUnsupportedFormat(ext, 'zh'))
    }
  } catch (error) {
    logger.error('文档解析失败:', error)
    throw new Error(error instanceof Error && error.message ? error.message : `无法解析文件: ${file.name}`)
  }

  const chapters = parsed.chapters
    ?.map((chapter, index) => ({
      title: normalizeChapterTitle(chapter.title, `第 ${index + 1} 节`),
      content: cleanExtractedText(chapter.content)
    }))
    .filter(chapter => chapter.content.length > 0)
  // DocumentUpload 的章节定位按 `标题\n\n正文` 建索引；这里统一由章节反向合成全文，
  // 防止不同格式返回的 content 与 chapters 偏移不一致，造成跳章、划线和引用错位。
  const content = chapters && chapters.length > 0
    ? composeChapters(chapters)
    : cleanExtractedText(parsed.content)
  logger.debug(`文件解析成功，内容长度: ${content.length} 字符`)

  if (!content) {
    throw new Error('文件内容为空或无法提取文本')
  }
  assertSafeExtractedText(content)

  return {
    content,
    fileName: file.name,
    fileType: ext,
    title: parsed.title,
    author: parsed.author,
    description: parsed.description,
    cover: parsed.cover,
    chapters: chapters && chapters.length > 0 ? chapters : undefined
  }
}
