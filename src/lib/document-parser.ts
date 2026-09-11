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

/** 把 HTML / XHTML 片段转换为段落化纯文本（不依赖 DOM，可在 Node 测试环境运行）。 */
export function htmlToPlainText(html: string): string {
  const withoutHidden = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<\s*(script|style|head|svg|noscript)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, ' ')
  const withBreaks = withoutHidden
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\s*(hr)\s*\/?\s*>/gi, '\n\n')
    .replace(/<\s*\/\s*(p|div|section|article|header|footer|blockquote|figcaption|tr|ul|ol|table|body)\s*>/gi, '\n\n')
    .replace(/<\s*\/\s*(h[1-6]|li|dt|dd)\s*>/gi, '\n\n')
    .replace(/<\s*(li)\b[^>]*>/gi, '\n· ')
    .replace(/<[^>]*>/g, ' ')
  return normalizeParagraphs(decodeHtmlEntities(withBreaks))
}

function firstMatch(source: string, pattern: RegExp): string | undefined {
  const match = source.match(pattern)
  const value = match?.[1] ? decodeHtmlEntities(match[1]).replace(/\s+/g, ' ').trim() : ''
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
  const lines = text.split('\n')
  const chapters: ParsedChapter[] = []
  let title = ''
  let buffer: string[] = []

  const flush = () => {
    const body = buffer.join('\n').trim()
    if (!title && !body) return
    chapters.push({ title: title || `第 ${chapters.length + 1} 节`, content: body })
    buffer = []
  }

  for (const line of lines) {
    const heading = line.match(/^#{1,3}\s+(.*)$/)
    if (heading) {
      flush()
      title = heading[1].trim()
      continue
    }
    buffer.push(line)
  }
  flush()
  return chapters.filter(chapter => chapter.content.length > 0)
}

const TXT_CHAPTER_PATTERN = /^\s*(第\s*[0-9一二三四五六七八九十百千万]+\s*[章节回卷篇]|Chapter\s+\d+|CHAPTER\s+[IVXLC\d]+)\b.*$/

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
  const text = await file.text()
  return { content: text, chapters: [{ title: '正文', content: text.trim() }] }
}

async function parseMarkdownFile(file: File): Promise<{ content: string; chapters?: ParsedChapter[] }> {
  const text = await file.text()
  const chapters = splitMarkdownChapters(text)
  return { content: text, chapters: chapters.length > 0 ? chapters : undefined }
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
  return { content, title, chapters: [{ title: title || '正文', content }] }
}

// ========================================
// 解析：EPUB
// ========================================

function resolveZipPath(base: string, relative: string): string {
  const clean = decodeURIComponent(relative.split('#')[0].split('?')[0])
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

function baseName(path: string): string {
  const index = path.lastIndexOf('/')
  return index === -1 ? path : path.slice(index + 1)
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

  const chapters: ParsedChapter[] = []
  for (const item of spine) {
    if (!/html|xml/i.test(item.mediaType) && !/\.(x?html?|xml)$/i.test(item.href)) continue
    const entry = zip.file(resolveZipPath(opfDir, item.href))
    if (!entry) continue
    const html = await entry.async('text')
    const content = htmlToPlainText(html)
    if (!content) continue
    const heading = firstMatch(html, /<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/i)
    chapters.push({ title: heading || `第 ${chapters.length + 1} 节`, content })
  }
  if (chapters.length === 0) throw new Error('EPUB 内容为空或无法提取文本')

  // 封面：优先 properties="cover-image"，退回 <meta name="cover">
  let coverHref = [...manifest.values()].find(item => /\bcover-image\b/i.test(item.properties))?.href
  if (!coverHref) {
    const coverId = opf.match(/<meta[^>]*name="cover"[^>]*content="([^"]*)"/i)?.[1]
    coverHref = coverId ? manifest.get(coverId)?.href : undefined
  }
  let cover: string | undefined
  if (coverHref) {
    const entry = zip.file(resolveZipPath(opfDir, coverHref))
    if (entry) {
      const bytes = new Uint8Array(await entry.async('uint8array'))
      cover = bytesToDataUrl(bytes, extToMime(coverHref))
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
      const content = html ? htmlToPlainText(html) : (book as { getSpine(): Array<{ text?: string }> }).getSpine().find(entry => entry === item)?.text || ''
      if (!content) continue
      const heading = html ? firstMatch(html, /<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/i) : undefined
      chapters.push({
        title: (item.id && tocLabels.get(item.id)) || heading || `第 ${chapters.length + 1} 节`,
        content: normalizeParagraphs(content)
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

export async function parseFb2(file: File): Promise<{
  content: string
  title?: string
  author?: string
  description?: string
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

  const bodyMatch = xml.match(/<body[^>]*>([\s\S]*)<\/body>/i)
  const body = bodyMatch?.[1] || xml
  const sections = [...body.matchAll(/<section[^>]*>([\s\S]*?)<\/section>/gi)].map(match => match[1])
  const chapters: ParsedChapter[] = []
  const collect = (sectionXml: string, index: number) => {
    const sectionTitle = firstMatch(sectionXml, /<title[^>]*>([\s\S]*?)<\/title>/i)
    const content = htmlToPlainText(sectionXml.replace(/<title[^>]*>[\s\S]*?<\/title>/i, ' '))
    if (content) chapters.push({ title: sectionTitle || `第 ${index + 1} 节`, content })
  }
  if (sections.length > 0) sections.forEach(collect)
  else collect(body, 0)
  if (chapters.length === 0) throw new Error('FB2 内容为空或无法提取文本')
  if (!title && !author && chapters.length === 0) throw new Error('FB2 解析失败：缺少可读内容')

  const content = chapters.map(chapter => `${chapter.title}\n\n${chapter.content}`).join('\n\n')
  return { content, title, author, description, chapters }
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

/** 轻量 RTF → 纯文本：忽略格式表/图片等目标域，保留 \uN、\'hh 与段落。 */
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
        output += char === '\n' || char === '\r' ? '\n' : char
      }
      index += 1
      continue
    }

    // 控制字符
    const next = rtf[index + 1]
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
      } else if (word === 'par' || word === 'line' || word === 'page' || word === 'sect') {
        if (skippedDepth === -1) {
          flushBytes()
          output += '\n'
        }
      } else if (word === 'tab') {
        if (skippedDepth === -1) {
          flushBytes()
          output += ' '
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
  return normalizeParagraphs(output)
}

async function parseRtfFile(file: File): Promise<{ content: string; chapters?: ParsedChapter[] }> {
  const rtf = await file.text()
  const content = rtfToPlainText(rtf)
  return { content, chapters: [{ title: '正文', content }] }
}

// ========================================
// 解析：PDF / DOCX
// ========================================

async function parsePDF(file: File): Promise<{ content: string; chapters?: ParsedChapter[] }> {
  try {
    const pdfjsLib = await import('pdfjs-dist')

    pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'

    const arrayBuffer = await file.arrayBuffer()
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer, isEvalSupported: false })
    const pdf = await loadingTask.promise

    let fullText = ''
    const numPages = pdf.numPages

    if (numPages > MAX_DOCUMENT_PAGES) {
      throw new Error(`PDF 页数不能超过 ${MAX_DOCUMENT_PAGES} 页`)
    }

    logger.debug(`PDF 共 ${numPages} 页`)

    for (let i = 1; i <= numPages; i++) {
      const page = await pdf.getPage(i)
      const textContent = await page.getTextContent()
      const pageText = textContent.items
        .map(item => ('str' in item ? item.str || '' : ''))
        .join(' ')
      fullText += pageText + '\n'
    }

    const content = normalizeParagraphs(fullText)
    return { content, chapters: [{ title: '正文', content }] }
  } catch (error) {
    logger.error('PDF 解析错误:', error)
    throw new Error(`PDF 解析失败: ${error instanceof Error ? error.message : '请确保文件未加密且格式正确'}`)
  }
}

async function parseWord(file: File): Promise<{ content: string; chapters?: ParsedChapter[] }> {
  try {
    const mammoth = await import('mammoth')
    const arrayBuffer = await file.arrayBuffer()
    const result = await mammoth.extractRawText({ arrayBuffer })
    const content = normalizeParagraphs(result.value)
    return { content, chapters: [{ title: '正文', content }] }
  } catch (error) {
    logger.error('Word 解析错误:', error)
    throw new Error('Word 文档解析失败，仅支持 .docx 格式')
  }
}

/** 旧版 .doc：先按 OLE 复合文档解析二进制 Word，再兼容实际是 RTF / HTML 的同名文件。 */
async function parseLegacyWordFile(file: File): Promise<{ content: string; chapters?: ParsedChapter[] }> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  if (isCompoundFile(bytes)) {
    const content = normalizeParagraphs(extractLegacyWordText(bytes))
    return { content, chapters: [{ title: '正文', content }] }
  }

  const text = await file.text()
  const head = text.slice(0, 4096).trimStart().toLowerCase()
  if (head.startsWith('{\\rtf')) {
    const content = normalizeParagraphs(rtfToPlainText(text))
    return { content, chapters: [{ title: '正文', content }] }
  }
  if (head.startsWith('<!doctype html') || head.startsWith('<html')) {
    const content = normalizeParagraphs(htmlToPlainText(text))
    return { content, chapters: [{ title: '正文', content }] }
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
      case 'json':
        parsed = await parseTextFile(file)
        break
      default:
        throw new Error(describeUnsupportedFormat(ext, 'zh'))
    }
  } catch (error) {
    logger.error('文档解析失败:', error)
    throw new Error(error instanceof Error && error.message ? error.message : `无法解析文件: ${file.name}`)
  }

  const content = parsed.content.trim()
  logger.debug(`文件解析成功，内容长度: ${content.length} 字符`)

  if (!content) {
    throw new Error('文件内容为空或无法提取文本')
  }
  assertSafeExtractedText(content)

  const chapters = parsed.chapters
    ?.map(chapter => ({ title: chapter.title, content: chapter.content.trim() }))
    .filter(chapter => chapter.content.length > 0)

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
