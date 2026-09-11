import { createLocalId } from './localId'

/**
 * 外部阅读平台的划线 / 笔记导入。
 *
 * 只接入平台官方支持的方式：
 * - 官方开放 API（Readwise、Zotero）；
 * - 官方 App 自带的「导出笔记」文本（微信读书、Kindle、Apple Books、得到等）。
 * 不使用任何 cookie、逆向或非官方抓取方案。
 */

export interface ImportedHighlight {
  quote?: string
  note?: string
  /** 划线所属章节标题，能解析到就保留。 */
  chapterTitle?: string
  /** 页码、位置等定位信息。 */
  location?: string
  /** 划线时间（毫秒），平台提供时使用。 */
  highlightedAt?: number
}

export interface ImportedNoteRecord {
  id: string
  type: 'note'
  content: string
  quote?: string
  chapterIndex?: number
  chapterTitle?: string
  source: 'import'
  createdAt: number
}

export interface ImportBookCandidate {
  /** 平台内的书籍 ID，用于二次请求或去重。 */
  externalId: string
  title: string
  author?: string
  highlightCount?: number
  highlights: ImportedHighlight[]
}

export interface MatchableBook {
  id: string
  name: string
  author?: string
}

export const MAX_IMPORT_HIGHLIGHTS = 500

/** Normalizes book metadata without collapsing distinct subtitles or editions. */
export function normalizeBookIdentity(value: string | undefined): string {
  return (value || '')
    .normalize('NFKC')
    .trim()
    .replace(/\.(?:pdf|epub|mobi|azw3?|docx?|txt)$/i, '')
    .replace(/^[《〈「『“\"']+|[》〉」』”\"']+$/g, '')
    .replace(/[\s\u00a0]+/g, '')
    .toLocaleLowerCase()
}

export function findMatchingBook<T extends MatchableBook>(
  books: T[],
  title: string | undefined,
  author?: string
): T | undefined {
  const normalizedTitle = normalizeBookIdentity(title)
  if (!normalizedTitle) return undefined
  const titleMatches = books.filter(book => normalizeBookIdentity(book.name) === normalizedTitle)
  if (titleMatches.length === 0) return undefined

  const normalizedAuthor = normalizeBookIdentity(author)
  if (normalizedAuthor) {
    const authorMatches = titleMatches.filter(book => normalizeBookIdentity(book.author) === normalizedAuthor)
    if (authorMatches.length > 0) return authorMatches[0]
    if (titleMatches.length === 1 && !normalizeBookIdentity(titleMatches[0].author)) return titleMatches[0]
    return undefined
  }
  return titleMatches.length === 1 ? titleMatches[0] : undefined
}

export class ImportAdapterError extends Error {
  status?: number
  constructor(message: string, status?: number) {
    super(message)
    this.name = 'ImportAdapterError'
    this.status = status
  }
}

function toError(error: unknown, fallback: string): Error {
  if (error instanceof ImportAdapterError) return error
  if (error instanceof Error) return error
  return new Error(fallback)
}

function readErrorMessage(status: number, platform: string): string {
  if (status === 401 || status === 403) return `${platform} 的访问令牌无效或已过期，请重新生成后重试。`
  if (status === 404) return `${platform} 未找到对应数据，请检查账号 ID 或权限范围。`
  if (status === 429) return `${platform} 请求过于频繁，请稍后重试。`
  if (status >= 500) return `${platform} 服务暂时不可用，请稍后重试。`
  return `${platform} 返回了异常状态（${status}）。`
}

function parseTimestamp(value: unknown): number | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

// ========================================
// Readwise（官方 API，个人令牌即可接入）
// ========================================

export const READWISE_API_BASE = 'https://readwise.io/api/v2'

export interface ReadwiseHighlight {
  id?: number
  text?: string
  note?: string
  location?: number
  location_type?: string
  highlighted_at?: string
}

export interface ReadwiseBook {
  id?: number
  title?: string
  author?: string
  num_highlights?: number
  highlights?: ReadwiseHighlight[]
}

export interface FetchReadwiseBooksOptions {
  /** Readwise 个人访问令牌（readwise.io/access_token）。 */
  token: string
  /** 按书名过滤，减少返回结果。 */
  query?: string
  page?: number
  pageSize?: number
  signal?: AbortSignal
}

export function buildReadwiseBooksUrl(options: Pick<FetchReadwiseBooksOptions, 'query' | 'page' | 'pageSize'>): string {
  const params = new URLSearchParams()
  params.set('page_size', String(Math.min(1000, Math.max(1, options.pageSize ?? 50))))
  if (options.page && options.page > 1) params.set('page', String(Math.floor(options.page)))
  if (options.query?.trim()) params.set('title', options.query.trim())
  return `${READWISE_API_BASE}/books/?${params.toString()}`
}

export function readwiseBookToCandidate(book: ReadwiseBook): ImportBookCandidate | null {
  const title = (book.title || '').trim()
  if (!title) return null
  const highlights = (book.highlights || []).flatMap(item => {
    const quote = (item.text || '').trim()
    const note = (item.note || '').trim()
    if (!quote && !note) return []
    return [{
      ...(quote ? { quote } : {}),
      ...(note ? { note } : {}),
      ...(typeof item.location === 'number'
        ? { location: `${item.location_type || 'location'} ${item.location}` }
        : {}),
      ...(parseTimestamp(item.highlighted_at) ? { highlightedAt: parseTimestamp(item.highlighted_at) } : {})
    } satisfies ImportedHighlight]
  })
  return {
    externalId: book.id !== undefined ? String(book.id) : title,
    title,
    ...(book.author?.trim() ? { author: book.author.trim() } : {}),
    highlightCount: typeof book.num_highlights === 'number' ? book.num_highlights : highlights.length,
    highlights
  }
}

export async function fetchReadwiseBooks(options: FetchReadwiseBooksOptions): Promise<ImportBookCandidate[]> {
  if (!options.token.trim()) throw new ImportAdapterError('请先填写 Readwise 访问令牌。')
  let response: Response
  try {
    response = await fetch(buildReadwiseBooksUrl(options), {
      headers: {
        Authorization: `Token ${options.token.trim()}`,
        Accept: 'application/json'
      },
      signal: options.signal
    })
  } catch (error) {
    throw toError(error, '无法连接 Readwise，请检查网络后重试。')
  }
  if (!response.ok) throw new ImportAdapterError(readErrorMessage(response.status, 'Readwise'), response.status)
  const payload = await response.json() as { results?: ReadwiseBook[] }
  return (payload.results || [])
    .map(readwiseBookToCandidate)
    .filter((book): book is ImportBookCandidate => Boolean(book))
}

// ========================================
// Zotero（官方 Web API v3，个人 API Key）
// ========================================

export const ZOTERO_API_BASE = 'https://api.zotero.org'

export interface ZoteroAnnotationItem {
  key?: string
  data?: {
    key?: string
    parentItem?: string
    annotationText?: string
    annotationComment?: string
    annotationPageLabel?: string
    dateAdded?: string
    dateModified?: string
  }
}

export interface ZoteroParentItem {
  key?: string
  data?: {
    key?: string
    title?: string
    filename?: string
    parentItem?: string
    creators?: { firstName?: string; lastName?: string; name?: string }[]
  }
}

interface ZoteroBookMetadata {
  title: string
  author?: string
}

export interface FetchZoteroAnnotationsOptions {
  apiKey: string
  /** 个人数字 ID（zotero.org/settings/keys 显示）。 */
  userId: string
  library?: 'user' | 'group'
  groupId?: string
  limit?: number
  /** 只取该时间戳之后更新的条目。 */
  since?: number
  signal?: AbortSignal
}

export function buildZoteroLibraryBase(options: Pick<FetchZoteroAnnotationsOptions, 'userId' | 'library' | 'groupId'>): string {
  const userId = options.userId.trim()
  if (options.library === 'group') {
    const groupId = (options.groupId || '').trim()
    if (!groupId) throw new ImportAdapterError('请填写 Zotero 群组 ID。')
    return `${ZOTERO_API_BASE}/groups/${encodeURIComponent(groupId)}`
  }
  if (!userId) throw new ImportAdapterError('请填写 Zotero 用户 ID。')
  return `${ZOTERO_API_BASE}/users/${encodeURIComponent(userId)}`
}

export function buildZoteroAnnotationsUrl(options: FetchZoteroAnnotationsOptions): string {
  const params = new URLSearchParams({
    format: 'json',
    itemType: 'annotation',
    limit: String(Math.min(100, Math.max(1, options.limit ?? 100))),
    sort: 'dateModified',
    direction: 'desc'
  })
  if (options.since && Number.isFinite(options.since)) params.set('since', String(Math.floor(options.since / 1000)))
  return `${buildZoteroLibraryBase(options)}/items?${params.toString()}`
}

export function zoteroAnnotationsToHighlights(
  annotations: ZoteroAnnotationItem[],
  parentTitles: Map<string, string> = new Map()
): ImportedHighlight[] {
  return annotations.flatMap(item => {
    const data = item.data || {}
    const quote = (data.annotationText || '').trim()
    const note = (data.annotationComment || '').trim()
    if (!quote && !note) return []
    const parentKey = data.parentItem || ''
    return [{
      ...(quote ? { quote } : {}),
      ...(note ? { note } : {}),
      ...(parentKey && parentTitles.get(parentKey) ? { chapterTitle: parentTitles.get(parentKey) } : {}),
      ...(data.annotationPageLabel ? { location: `p.${data.annotationPageLabel}` } : {}),
      ...(parseTimestamp(data.dateAdded) ? { highlightedAt: parseTimestamp(data.dateAdded) } : {})
    } satisfies ImportedHighlight]
  })
}

type ZoteroCreator = NonNullable<NonNullable<ZoteroParentItem['data']>['creators']>[number]

function zoteroCreatorName(creator: ZoteroCreator): string {
  return (creator.name || [creator.firstName, creator.lastName].filter(Boolean).join(' ')).trim()
}

export function zoteroAnnotationsToBookCandidates(
  annotations: ZoteroAnnotationItem[],
  parentMetadata: Map<string, ZoteroBookMetadata> = new Map()
): ImportBookCandidate[] {
  const grouped = new Map<string, ImportBookCandidate>()
  for (const item of annotations) {
    const data = item.data || {}
    const quote = (data.annotationText || '').trim()
    const note = (data.annotationComment || '').trim()
    if (!quote && !note) continue
    const parentKey = data.parentItem || ''
    const metadata = parentMetadata.get(parentKey)
    const groupKey = parentKey || 'unmatched'
    const existing = grouped.get(groupKey) || {
      externalId: groupKey,
      title: metadata?.title || '',
      ...(metadata?.author ? { author: metadata.author } : {}),
      highlights: []
    }
    existing.highlights.push({
      ...(quote ? { quote } : {}),
      ...(note ? { note } : {}),
      ...(data.annotationPageLabel ? { location: `p.${data.annotationPageLabel}` } : {}),
      ...(parseTimestamp(data.dateAdded) ? { highlightedAt: parseTimestamp(data.dateAdded) } : {})
    })
    grouped.set(groupKey, existing)
  }
  return Array.from(grouped.values()).map(candidate => ({
    ...candidate,
    highlightCount: candidate.highlights.length,
    highlights: dedupeImportedHighlights(candidate.highlights).slice(0, MAX_IMPORT_HIGHLIGHTS)
  }))
}

async function fetchZoteroItems(
  base: string,
  keys: string[],
  headers: Record<string, string>,
  signal?: AbortSignal
): Promise<ZoteroParentItem[]> {
  if (keys.length === 0 || signal?.aborted) return []
  const items: ZoteroParentItem[] = []
  for (let index = 0; index < keys.length && !signal?.aborted; index += 50) {
    const batch = keys.slice(index, index + 50)
    const params = new URLSearchParams({ format: 'json', itemKey: batch.join(','), limit: String(batch.length) })
    const response = await fetch(`${base}/items?${params.toString()}`, { headers, signal })
    if (!response.ok) continue
    const payload = await response.json() as ZoteroParentItem[]
    if (Array.isArray(payload)) items.push(...payload)
  }
  return items
}

async function fetchZoteroAnnotationsWithMetadata(options: FetchZoteroAnnotationsOptions): Promise<{
  annotations: ZoteroAnnotationItem[]
  parentMetadata: Map<string, ZoteroBookMetadata>
}> {
  if (!options.apiKey.trim()) throw new ImportAdapterError('请先填写 Zotero API Key。')
  const headers = {
    Accept: 'application/json',
    'Zotero-API-Version': '3',
    'Zotero-API-Key': options.apiKey.trim()
  }
  let response: Response
  try {
    response = await fetch(buildZoteroAnnotationsUrl(options), { headers, signal: options.signal })
  } catch (error) {
    throw toError(error, '无法连接 Zotero，请检查网络后重试。')
  }
  if (!response.ok) throw new ImportAdapterError(readErrorMessage(response.status, 'Zotero'), response.status)
  const annotations = await response.json() as ZoteroAnnotationItem[]
  if (!Array.isArray(annotations) || annotations.length === 0) {
    return { annotations: [], parentMetadata: new Map() }
  }

  const base = buildZoteroLibraryBase(options)
  const parentKeys = Array.from(new Set(annotations.map(item => item.data?.parentItem).filter((key): key is string => Boolean(key))))
  const immediateParents = await fetchZoteroItems(base, parentKeys, headers, options.signal).catch(() => [])
  const bibliographicKeys = Array.from(new Set(immediateParents.map(item => item.data?.parentItem).filter((key): key is string => Boolean(key))))
  const bibliographicItems = await fetchZoteroItems(base, bibliographicKeys, headers, options.signal).catch(() => [])
  const bibliographicByKey = new Map(bibliographicItems.flatMap(item => {
    const key = item.key || item.data?.key
    return key ? [[key, item] as const] : []
  }))
  const parentMetadata = new Map<string, ZoteroBookMetadata>()
  for (const parent of immediateParents) {
    const key = parent.key || parent.data?.key
    if (!key) continue
    const source = parent.data?.parentItem ? bibliographicByKey.get(parent.data.parentItem) || parent : parent
    const title = (source.data?.title || source.data?.filename || parent.data?.title || parent.data?.filename || '').trim()
    if (!title) continue
    const author = (source.data?.creators || []).map(zoteroCreatorName).filter(Boolean).join('、')
    parentMetadata.set(key, { title, ...(author ? { author } : {}) })
  }
  return { annotations, parentMetadata }
}

export async function fetchZoteroBookCandidates(options: FetchZoteroAnnotationsOptions): Promise<ImportBookCandidate[]> {
  const result = await fetchZoteroAnnotationsWithMetadata(options)
  return zoteroAnnotationsToBookCandidates(result.annotations, result.parentMetadata)
}

export async function fetchZoteroAnnotations(options: FetchZoteroAnnotationsOptions): Promise<ImportedHighlight[]> {
  const result = await fetchZoteroAnnotationsWithMetadata(options)
  const parentTitles = new Map(Array.from(result.parentMetadata, ([key, value]) => [key, value.title]))
  return zoteroAnnotationsToHighlights(result.annotations, parentTitles)
}

// ========================================
// 官方导出文本解析（微信读书 / Kindle / Apple Books / 通用 Markdown）
// ========================================

export type HighlightExportFormat = 'wechat' | 'kindle' | 'appleBooks' | 'markdown' | 'csv' | 'plain'

export function detectHighlightExportFormat(text: string): HighlightExportFormat {
  if (/^[^\n]*,[^\n]*\n/.test(text) && /quote/i.test(text.split('\n')[0] || '')) return 'csv'
  if (/={5,}/.test(text) && /(location|位置|标注|highlight)/i.test(text)) return 'kindle'
  if (/^\s*[“"「『].+["”」』]\s*$/m.test(text) && /(^|\n)\s*(note|notes|笔记|批注)[:：]/i.test(text)) return 'appleBooks'
  if (/^◆/m.test(text) || /\[想法\]/.test(text) || /^作者[:：]/m.test(text)) return 'wechat'
  if (/^[>#-]/m.test(text)) return 'markdown'
  return 'plain'
}

/**
 * 导出文本里「划线」和「想法」经常被空行拆成前后两块。
 * 这里把紧跟划线之后的纯批注块并回上一条，避免一条划线变成两条记录。
 */
function mergeOrphanNotes(highlights: ImportedHighlight[]): ImportedHighlight[] {
  const merged: ImportedHighlight[] = []
  for (const highlight of highlights) {
    const previous = merged[merged.length - 1]
    const noteOnly = !highlight.quote && Boolean(highlight.note)
    const canAttach = Boolean(previous) && Boolean(previous.quote) && !previous.note && noteOnly
    if (canAttach && previous) {
      const sameChapter = !previous.chapterTitle || !highlight.chapterTitle ||
        previous.chapterTitle === highlight.chapterTitle
      if (sameChapter) {
        previous.note = highlight.note
        if (!previous.location && highlight.location) previous.location = highlight.location
        continue
      }
    }
    merged.push({ ...highlight })
  }
  return merged
}

/** 明确的章节标记，出现在任意位置都按章节处理。 */
const STRONG_CHAPTER_PATTERN = /^(?:第\s*[0-9一二三四五六七八九十百千]+\s*[章节卷部篇]|chapter\s+\d+|part\s+\d+|卷[0-9一二三四五六七八九十]+)/i

function pushHighlight(target: ImportedHighlight[], draft: ImportedHighlight, chapterTitle?: string): void {
  const quote = (draft.quote || '').trim()
  const note = (draft.note || '').trim()
  if (!quote && !note) return
  target.push({
    ...(quote ? { quote } : {}),
    ...(note ? { note } : {}),
    ...(draft.chapterTitle || chapterTitle ? { chapterTitle: draft.chapterTitle || chapterTitle } : {}),
    ...(draft.location ? { location: draft.location } : {}),
    ...(draft.highlightedAt ? { highlightedAt: draft.highlightedAt } : {})
  })
}

/** 微信读书「我的笔记 → 导出笔记」文本解析（容忍不同版本的标题符号）。 */
export function parseWechatReadingExport(text: string): ImportedHighlight[] {
  const highlights: ImportedHighlight[] = []
  let chapter: string | undefined
  let draft: ImportedHighlight = {}
  let noteMode = false

  const flush = () => {
    pushHighlight(highlights, draft, chapter)
    draft = {}
    noteMode = false
  }

  for (const rawLine of text.replace(/\r\n?/g, '\n').split('\n')) {
    const line = rawLine.trim()
    if (!line) {
      flush()
      continue
    }
    if (/^《.+》$/.test(line) || /^(作者|出版社|出版时间|ISBN)[:：]/.test(line) || /^总时长/.test(line)) continue

    const chapterMatch = /^(?:◆|##+)\s*(.+)$/.exec(line) || /^【(.+)】$/.exec(line)
    if (chapterMatch) {
      flush()
      chapter = chapterMatch[1].trim() || undefined
      continue
    }

    const noteMatch = /^(?:\[想法\]|想法|笔记|点评)[:：]?\s*(.*)$/.exec(line)
    if (noteMatch) {
      if (!draft.quote && !draft.note) draft.chapterTitle = chapter
      noteMode = true
      if (noteMatch[1].trim()) draft.note = `${draft.note ? `${draft.note}\n` : ''}${noteMatch[1].trim()}`
      continue
    }

    const quoteMatch = /^(?:>|原文[:：]|\[划线\])[:：]?\s*(.+)$/.exec(line)
    if (quoteMatch) {
      if (draft.quote || draft.note) flush()
      draft.chapterTitle = chapter
      draft.quote = `${draft.quote ? `${draft.quote}\n` : ''}${quoteMatch[1].trim()}`
      noteMode = false
      continue
    }

    if (!draft.quote && !draft.note) draft.chapterTitle = chapter
    if (noteMode) draft.note = `${draft.note ? `${draft.note}\n` : ''}${line}`
    else draft.quote = `${draft.quote ? `${draft.quote}\n` : ''}${line}`
  }
  flush()
  return mergeOrphanNotes(highlights)
}

/** Kindle「My Clippings.txt」解析，兼容英文与中文界面导出的标注 / 笔记。 */
export function parseKindleClippings(text: string): ImportedHighlight[] {
  const highlights: ImportedHighlight[] = []
  const blocks = text.replace(/\r\n?/g, '\n').split(/^={5,}\s*$/m)
  for (const block of blocks) {
    const lines = block.split('\n').map(line => line.trim()).filter(Boolean)
    if (lines.length < 2) continue
    const metaIndex = lines.findIndex(line => /^-\s*(your|您|你的)/i.test(line))
    if (metaIndex < 0) continue
    const meta = lines[metaIndex]
    const body = lines.slice(metaIndex + 1).join('\n').trim()
    if (!body) continue
    const isNote = /(note|笔记)/i.test(meta)
    const locationMatch = /(?:location|位置)\s*#?\s*([0-9]+(?:-[0-9]+)?)/i.exec(meta)
    const pageMatch = /(?:page|第)\s*([0-9]+)\s*(?:页)?/i.exec(meta)
    const locationParts = [
      pageMatch ? `第 ${pageMatch[1]} 页` : '',
      locationMatch ? `位置 ${locationMatch[1]}` : ''
    ].filter(Boolean)
    const location = locationParts.length > 0 ? locationParts.join(' · ') : undefined
    pushHighlight(highlights, {
      ...(isNote ? { note: body } : { quote: body }),
      chapterTitle: lines[0],
      ...(location ? { location } : {})
    })
  }
  return highlights
}

/** Apple Books / 通用分享文本：引号内是原文，Note/笔记开头是批注。 */
export function parseQuotedExport(text: string): ImportedHighlight[] {
  const highlights: ImportedHighlight[] = []
  let chapter: string | undefined
  let draft: ImportedHighlight = {}
  const flush = () => {
    pushHighlight(highlights, draft, chapter)
    draft = {}
  }
  for (const rawLine of text.replace(/\r\n?/g, '\n').split('\n')) {
    const line = rawLine.trim()
    if (!line) continue
    const quoted = /^[“"「『](.+)["”」』]$/.exec(line)
    if (quoted) {
      if (draft.quote || draft.note) flush()
      draft = { quote: quoted[1].trim(), chapterTitle: chapter, ...(draft.chapterTitle && !chapter ? { chapterTitle: draft.chapterTitle } : {}) }
      continue
    }
    const noteMatch = /^(?:[-*]\s*)?(?:note|笔记|批注)[:：]?\s*(.*)$/i.exec(line)
    if (noteMatch) {
      if (!draft.quote && !draft.note) flush()
      draft.chapterTitle = chapter
      if (noteMatch[1].trim()) draft.note = `${draft.note ? `${draft.note}\n` : ''}${noteMatch[1].trim()}`
      continue
    }
    const pageMatch = /(?:page|第)\s*([0-9]+)\s*(?:页)?/i.exec(line)
    if (pageMatch && !draft.quote && !draft.note) {
      draft.location = `p.${pageMatch[1]}`
      continue
    }
    // 明确的章节标题即使出现在批注之后也要识别，否则会被并进上一条笔记。
    if (STRONG_CHAPTER_PATTERN.test(line)) {
      flush()
      chapter = line
      continue
    }
    if (line.length <= 60 && !draft.quote && !draft.note) {
      flush()
      chapter = line
      continue
    }
    if (draft.quote || draft.note) {
      if (draft.note) draft.note = `${draft.note}\n${line}`
      else draft.quote = `${draft.quote}\n${line}`
    }
  }
  flush()
  return mergeOrphanNotes(highlights)
}

/** Markdown / 纯文本导出：`> 原文` 是划线，`- 笔记` 是批注，`## 章节` 是章节。 */
export function parseMarkdownHighlights(text: string): ImportedHighlight[] {
  const highlights: ImportedHighlight[] = []
  let chapter: string | undefined
  let draft: ImportedHighlight = {}
  const flush = () => {
    pushHighlight(highlights, draft, chapter)
    draft = {}
  }
  for (const rawLine of text.replace(/\r\n?/g, '\n').split('\n')) {
    const line = rawLine.trim()
    if (!line) {
      flush()
      continue
    }
    const heading = /^#{1,6}\s+(.+)$/.exec(line)
    if (heading) {
      flush()
      chapter = heading[1].trim()
      continue
    }
    const quote = /^>\s?(.*)$/.exec(line)
    if (quote) {
      if (draft.note && !draft.quote) flush()
      draft.chapterTitle = chapter
      draft.quote = `${draft.quote ? `${draft.quote}\n` : ''}${quote[1].trim()}`
      continue
    }
    const bullet = /^[-*]\s+(.+)$/.exec(line)
    if (bullet) {
      if (draft.quote && !draft.note) {
        draft.note = bullet[1].trim()
      } else {
        if (draft.note) flush()
        draft.chapterTitle = chapter
        draft.note = `${draft.note ? `${draft.note}\n` : ''}${bullet[1].trim()}`
      }
      continue
    }
    if (!draft.quote && !draft.note) {
      draft.chapterTitle = chapter
      draft.quote = line
    } else if (draft.note) {
      draft.note = `${draft.note}\n${line}`
    } else {
      draft.quote = `${draft.quote}\n${line}`
    }
  }
  flush()
  return mergeOrphanNotes(highlights)
}

/** 纯文本：空行分段的段落都视为一条划线。 */
export function parsePlainTextHighlights(text: string): ImportedHighlight[] {
  return text
    .replace(/\r\n?/g, '\n')
    .split(/\n{2,}/)
    .map(block => block.trim())
    .filter(Boolean)
    .slice(0, MAX_IMPORT_HIGHLIGHTS)
    .map(block => ({ quote: block }))
}

function parseCsvRows(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  const source = text.replace(/\r\n?/g, '\n')
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]
    if (quoted) {
      if (char === '"' && source[index + 1] === '"') {
        field += '"'
        index += 1
      } else if (char === '"') {
        quoted = false
      } else {
        field += char
      }
      continue
    }
    if (char === '"') {
      quoted = true
    } else if (char === ',') {
      row.push(field)
      field = ''
    } else if (char === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else {
      field += char
    }
  }
  if (field || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

/** CSV 表头包含 quote / note / chapter 时的通用导入。 */
export function parseCsvHighlights(text: string): ImportedHighlight[] {
  const rows = parseCsvRows(text).filter(row => row.some(cell => cell.trim()))
  if (rows.length < 2) return []
  const header = rows[0].map(cell => cell.trim().toLowerCase())
  const quoteIndex = header.findIndex(cell => cell === 'quote' || cell === 'text' || cell === '原文' || cell === '划线')
  const noteIndex = header.findIndex(cell => cell === 'note' || cell === 'comment' || cell === '笔记' || cell === '想法')
  const chapterIndex = header.findIndex(cell => cell === 'chapter' || cell === 'section' || cell === '章节')
  if (quoteIndex < 0 && noteIndex < 0) return []
  return rows.slice(1, MAX_IMPORT_HIGHLIGHTS + 1).flatMap(row => {
    const quote = quoteIndex >= 0 ? (row[quoteIndex] || '').trim() : ''
    const note = noteIndex >= 0 ? (row[noteIndex] || '').trim() : ''
    const chapterTitle = chapterIndex >= 0 ? (row[chapterIndex] || '').trim() : ''
    if (!quote && !note) return []
    return [{
      ...(quote ? { quote } : {}),
      ...(note ? { note } : {}),
      ...(chapterTitle ? { chapterTitle } : {})
    } satisfies ImportedHighlight]
  })
}

/**
 * 解析官方导出的划线文本。未指定格式时按内容自动识别。
 */
export function parseHighlightExport(text: string, format?: HighlightExportFormat): ImportedHighlight[] {
  const source = text.replace(/^\uFEFF/, '')
  if (!source.trim()) return []
  const resolved = format || detectHighlightExportFormat(source)
  const highlights = resolved === 'kindle'
    ? parseKindleClippings(source)
    : resolved === 'wechat'
      ? parseWechatReadingExport(source)
      : resolved === 'appleBooks'
        ? parseQuotedExport(source)
        : resolved === 'csv'
          ? parseCsvHighlights(source)
          : resolved === 'markdown'
            ? parseMarkdownHighlights(source)
            : parsePlainTextHighlights(source)
  return dedupeImportedHighlights(highlights).slice(0, MAX_IMPORT_HIGHLIGHTS)
}

function splitKindleTitleAndAuthor(value: string): { title: string; author?: string } {
  const match = /^(.*?)\s*\(([^()]*)\)\s*$/.exec(value.trim())
  if (!match || !match[1].trim()) return { title: value.trim() }
  return { title: match[1].trim(), ...(match[2].trim() ? { author: match[2].trim() } : {}) }
}

function parseKindleBookCandidates(text: string): ImportBookCandidate[] {
  const grouped = new Map<string, ImportBookCandidate>()
  const blocks = text.replace(/\r\n?/g, '\n').split(/^={5,}\s*$/m)
  for (const block of blocks) {
    const lines = block.split('\n').map(line => line.trim()).filter(Boolean)
    const metaIndex = lines.findIndex(line => /^-\s*(your|您|你的)/i.test(line))
    if (metaIndex < 1) continue
    const metadata = splitKindleTitleAndAuthor(lines[0])
    const parsed = parseKindleClippings(`${block}\n==========`).map(highlight => {
      if (highlight.chapterTitle !== lines[0]) return highlight
      const { chapterTitle: _bookTitle, ...withoutBookTitle } = highlight
      return withoutBookTitle
    })
    if (parsed.length === 0) continue
    const key = `${normalizeBookIdentity(metadata.title)}\u0000${normalizeBookIdentity(metadata.author)}`
    const existing = grouped.get(key) || {
      externalId: key,
      title: metadata.title,
      ...(metadata.author ? { author: metadata.author } : {}),
      highlights: []
    }
    existing.highlights.push(...parsed)
    grouped.set(key, existing)
  }
  return Array.from(grouped.values()).map(candidate => ({
    ...candidate,
    highlightCount: candidate.highlights.length,
    highlights: dedupeImportedHighlights(candidate.highlights).slice(0, MAX_IMPORT_HIGHLIGHTS)
  }))
}

function parseCsvBookCandidates(text: string): ImportBookCandidate[] {
  const rows = parseCsvRows(text).filter(row => row.some(cell => cell.trim()))
  if (rows.length < 2) return []
  const header = rows[0].map(cell => cell.trim().toLowerCase())
  const titleIndex = header.findIndex(cell => ['book', 'book title', 'title', '书名', '书籍'].includes(cell))
  if (titleIndex < 0) return []
  const authorIndex = header.findIndex(cell => ['author', '作者'].includes(cell))
  const groups = new Map<string, string[][]>()
  for (const row of rows.slice(1)) {
    const title = (row[titleIndex] || '').trim()
    if (!title) continue
    const author = authorIndex >= 0 ? (row[authorIndex] || '').trim() : ''
    const key = `${normalizeBookIdentity(title)}\u0000${normalizeBookIdentity(author)}`
    const current = groups.get(key) || [rows[0]]
    current.push(row)
    groups.set(key, current)
  }
  return Array.from(groups, ([key, rowsForBook]) => {
    const first = rowsForBook[1]
    const title = (first[titleIndex] || '').trim()
    const author = authorIndex >= 0 ? (first[authorIndex] || '').trim() : ''
    const highlights = parseCsvHighlights(rowsForBook.map(row => row.map(value => {
      const escaped = value.replace(/"/g, '""')
      return /[",\n]/.test(value) ? `"${escaped}"` : escaped
    }).join(',')).join('\n'))
    return {
      externalId: key,
      title,
      ...(author ? { author } : {}),
      highlightCount: highlights.length,
      highlights
    }
  })
}

/** Parses one export into book-scoped batches so notes cannot be assigned across books. */
export function parseHighlightExportCandidates(text: string, format?: HighlightExportFormat): ImportBookCandidate[] {
  const source = text.replace(/^\uFEFF/, '')
  if (!source.trim()) return []
  const resolved = format || detectHighlightExportFormat(source)
  if (resolved === 'kindle') return parseKindleBookCandidates(source)
  if (resolved === 'csv') {
    const candidates = parseCsvBookCandidates(source)
    if (candidates.length > 0) return candidates
  }

  const highlights = parseHighlightExport(source, resolved)
  if (highlights.length === 0) return []
  let title = ''
  let author = ''
  if (resolved === 'wechat') {
    title = (/^\s*《(.+?)》\s*$/m.exec(source)?.[1] || '').trim()
    author = (/^\s*作者[:：]\s*(.+?)\s*$/m.exec(source)?.[1] || '').trim()
  } else if (resolved === 'appleBooks') {
    const lines = source.replace(/\r\n?/g, '\n').split('\n').map(line => line.trim()).filter(Boolean)
    const titleLine = lines.find(line =>
      !/^[“\"「『]/.test(line) &&
      !/^(?:note|notes|笔记|批注|author|作者)[:：]/i.test(line) &&
      !STRONG_CHAPTER_PATTERN.test(line)
    )
    title = titleLine || ''
    author = (/^\s*(?:author|作者)[:：]\s*(.+?)\s*$/im.exec(source)?.[1] || '').trim()
  }
  return [{
    externalId: `${resolved}:${normalizeBookIdentity(title) || 'unknown'}`,
    title,
    ...(author ? { author } : {}),
    highlightCount: highlights.length,
    highlights
  }]
}

function highlightKey(highlight: ImportedHighlight): string {
  return `${(highlight.quote || '').trim().replace(/\s+/g, ' ')}\u0000${(highlight.note || '').trim().replace(/\s+/g, ' ')}`
}

export function dedupeImportedHighlights(highlights: ImportedHighlight[]): ImportedHighlight[] {
  const seen = new Set<string>()
  const result: ImportedHighlight[] = []
  for (const highlight of highlights) {
    const key = highlightKey(highlight)
    if (key === '\u0000') continue
    if (seen.has(key)) continue
    seen.add(key)
    result.push(highlight)
  }
  return result
}

export interface ToNoteRecordOptions {
  /** 导入书籍的章节定位表，用于把划线挂到原文位置。 */
  chapters?: { title: string }[]
  /** 导入时间戳，保持同一批导入顺序稳定。 */
  now?: number
  maxRecords?: number
  idFactory?: () => string
}

function matchChapterIndex(chapterTitle: string | undefined, chapters: { title?: string }[]): number | undefined {
  if (!chapterTitle) return undefined
  const normalized = chapterTitle.replace(/\s+/g, '').toLowerCase()
  const index = chapters.findIndex(chapter => {
    const candidate = (chapter.title || '').replace(/\s+/g, '').toLowerCase()
    if (!candidate) return false
    return candidate === normalized || candidate.includes(normalized) || normalized.includes(candidate)
  })
  return index >= 0 ? index : undefined
}

/** 把导入的划线转换为可写入书籍的笔记记录（source 固定为 import）。 */
export function toImportedNoteRecords(
  highlights: ImportedHighlight[],
  options: ToNoteRecordOptions = {}
): ImportedNoteRecord[] {
  const chapters = options.chapters || []
  const baseTime = options.now ?? Date.now()
  const idFactory = options.idFactory || createLocalId
  const maxRecords = options.maxRecords ?? MAX_IMPORT_HIGHLIGHTS
  return dedupeImportedHighlights(highlights).slice(0, maxRecords).map((highlight, index) => {
    const quote = (highlight.quote || '').trim()
    const note = (highlight.note || '').trim()
    const chapterIndex = matchChapterIndex(highlight.chapterTitle, chapters)
    return {
      id: idFactory(),
      type: 'note',
      content: note || quote,
      ...(quote ? { quote } : {}),
      ...(highlight.chapterTitle ? { chapterTitle: highlight.chapterTitle.slice(0, 200) } : {}),
      ...(chapterIndex !== undefined ? { chapterIndex } : {}),
      source: 'import',
      createdAt: baseTime + index
    } satisfies ImportedNoteRecord
  })
}

// ========================================
// 平台能力登记表（调研结论，直接用于界面说明）
// ========================================

export type ImportAdapterKind = 'api' | 'export' | 'unsupported'

export interface PlatformCapability {
  id: string
  name: string
  kind: ImportAdapterKind
  detailZh: string
  detailEn: string
  /** 可接入时需要用户准备的凭据或条件。 */
  requirementZh?: string
  requirementEn?: string
  /** 官方导出步骤；导出类平台按步骤导出后再导入。 */
  guideZh?: string
  guideEn?: string
  /** 官方导出说明或授权入口链接，没有官方页面时留空。 */
  officialUrl?: string
  officialUrlLabelZh?: string
  officialUrlLabelEn?: string
}

export const PLATFORM_CAPABILITIES: PlatformCapability[] = [
  {
    id: 'readwise',
    name: 'Readwise',
    kind: 'api',
    detailZh: '官方 API，个人访问令牌即可读取全部划线、笔记与书名。',
    detailEn: 'Official API. A personal access token reads all highlights, notes, and titles.',
    requirementZh: '在 readwise.io/access_token 获取个人令牌',
    requirementEn: 'Get a token at readwise.io/access_token',
    guideZh: '打开 readwise.io/access_token 复制令牌 → 回到「官方 API」粘贴令牌 → 点「读取我的 Readwise 书籍」→ 选中书籍导入。',
    guideEn: 'Copy the token at readwise.io/access_token, paste it in “Official API”, load your books, then pick one to import.',
    officialUrl: 'https://readwise.io/access_token',
    officialUrlLabelZh: '获取 Readwise 个人令牌',
    officialUrlLabelEn: 'Get a Readwise token'
  },
  {
    id: 'zotero',
    name: 'Zotero',
    kind: 'api',
    detailZh: '官方 Web API v3，用个人 API Key 读取条目批注与笔记。',
    detailEn: 'Official Web API v3. A personal API key reads item annotations and notes.',
    requirementZh: '在 zotero.org/settings/keys 创建密钥',
    requirementEn: 'Create a key at zotero.org/settings/keys',
    guideZh: '在 zotero.org/settings/keys 创建密钥（勾选读取权限）→ 回到「官方 API」填入密钥与数字用户 ID → 点「读取我的 Zotero 批注」。',
    guideEn: 'Create a read-access key at zotero.org/settings/keys, paste the key and your numeric user ID in “Official API”, then load your annotations.',
    officialUrl: 'https://www.zotero.org/settings/keys',
    officialUrlLabelZh: '创建 Zotero API Key',
    officialUrlLabelEn: 'Create a Zotero API key'
  },
  {
    id: 'wechat-reading',
    name: '微信读书',
    kind: 'export',
    detailZh: '没有对第三方开放的接口；用官方「导出笔记」把笔记导出为文本后导入。',
    detailEn: 'No public API. Use the official “Export notes” to get the text, then import it.',
    requirementZh: '官方导出笔记（TXT）',
    requirementEn: 'Official notes export (TXT)',
    guideZh: '在微信读书打开「我 → 笔记 → 右上角导出笔记」，选择「导出为 TXT / 复制全文」；回到「导入文本」把内容粘贴或上传即可。',
    guideEn: 'In WeChat Reading open “Me → Notes → Export notes” and copy or save the TXT, then paste or upload it in “Import text”.',
    officialUrl: 'https://weread.qq.com/',
    officialUrlLabelZh: '打开微信读书（网页版可查看笔记）',
    officialUrlLabelEn: 'Open WeChat Reading'
  },
  {
    id: 'kindle',
    name: 'Kindle',
    kind: 'export',
    detailZh: '没有批注 API；用官方 Notebook 导出，或导入设备里的 My Clippings.txt。',
    detailEn: 'No annotation API. Export from the official Notebook page, or import My Clippings.txt.',
    requirementZh: 'Notebook 导出或 My Clippings.txt',
    requirementEn: 'Notebook export or My Clippings.txt',
    guideZh: '在 read.amazon.com/notebook 打开「笔记本」，选中一本书后导出笔记；也可以直接从 Kindle 设备复制 My Clippings.txt，然后在「导入文本」里上传。',
    guideEn: 'Open read.amazon.com/notebook, select a book and export its notes; alternatively upload My Clippings.txt from your Kindle device in “Import text”.',
    officialUrl: 'https://read.amazon.com/notebook',
    officialUrlLabelZh: '打开 Kindle Notebook',
    officialUrlLabelEn: 'Open Kindle Notebook'
  },
  {
    id: 'apple-books',
    name: 'Apple Books',
    kind: 'export',
    detailZh: '没有公开 API；在 App 内选择笔记后分享为文本，再粘贴导入。',
    detailEn: 'No public API. Share selected notes as text in the app, then paste them here.',
    requirementZh: '应用内分享笔记文本',
    requirementEn: 'Share notes as text in the app',
    guideZh: '在 iPhone / iPad / Mac 的「图书」里打开这本书 → 打开「笔记」→ 选择要导出的笔记 → 分享或拷贝文本，粘贴到「导入文本」解析。',
    guideEn: 'Open the book in Books on iPhone, iPad, or Mac, open Notes, select the entries, then share or copy the text into “Import text”.'
  },
  {
    id: 'dedao',
    name: '得到',
    kind: 'export',
    detailZh: '没有官方 API；请使用应用内的笔记导出或复制划线后粘贴导入。',
    detailEn: 'No official API. Export or copy highlights in the app, then paste them here.',
    guideZh: '在得到 App 打开电子书 → 进入「笔记 / 划线」→ 使用分享、导出或复制全文，粘贴到「导入文本」解析。',
    guideEn: 'Open the book in the Dedao app, go to notes/highlights, then share, export, or copy the text into “Import text”.'
  },
  {
    id: 'google-play-books',
    name: 'Google Play Books',
    kind: 'export',
    detailZh: '没有批注 API；可通过 Google Takeout 导出笔记后粘贴导入。',
    detailEn: 'No annotation API. Export notes with Google Takeout, then paste them here.',
    guideZh: '在 Google Takeout 勾选「Google Play 图书」导出并下载压缩包，解压后在「导入文本」上传其中的笔记文件。',
    guideEn: 'Export “Google Play Books” with Google Takeout, unzip the archive, then upload the notes file in “Import text”.',
    officialUrl: 'https://takeout.google.com/',
    officialUrlLabelZh: '打开 Google Takeout',
    officialUrlLabelEn: 'Open Google Takeout'
  },
  {
    id: 'koreader',
    name: 'KOReader',
    kind: 'export',
    detailZh: '可用官方「导出标注」生成 Markdown/文本后导入；自建同步服务器属于进阶方案。',
    detailEn: 'Use the official “Export highlights” Markdown/text output. A self-hosted sync server is an advanced option.',
    guideZh: '在 KOReader 打开菜单 → 「标注 / Highlights」→ 「导出标注」，选择 Markdown 或纯文本，再上传导出的文件。',
    guideEn: 'In KOReader open the menu → Highlights → “Export highlights”, choose Markdown or plain text, then upload the exported file.',
    officialUrl: 'https://koreader.rocks/user_guide/',
    officialUrlLabelZh: 'KOReader 官方使用说明',
    officialUrlLabelEn: 'KOReader user guide'
  },
  {
    id: 'others',
    name: '其他平台',
    kind: 'unsupported',
    detailZh: 'Get笔记、有道云笔记、掌阅、京东读书、番茄、QQ 阅读等：Get笔记的 OpenAPI 需要付费会员并走 OAuth 授权，有道云笔记是 OAuth 1.0a 且需要开发者审核，其余平台没有面向个人开发者开放的接口，也没有通用导出格式，因此暂不接入。',
    detailEn: 'Get Notes, Youdao Note, iReader, JD Read, Fanqie, QQ Reader, and similar apps: Get Notes needs a paid membership plus OAuth, Youdao Note uses OAuth 1.0a with developer review, and the rest publish no API for individual developers and no common export format, so they are not integrated.',
    requirementZh: '不使用 cookie 抓取、模拟登录或逆向方案',
    requirementEn: 'No cookie scraping, scripted logins, or reverse engineering'
  }
]

/** 平台支持说明里的分组顺序：官方 API → 官方导出 → 暂不接入。 */
export const PLATFORM_CAPABILITY_GROUP_ORDER: ImportAdapterKind[] = ['api', 'export', 'unsupported']

export function getPlatformCapability(id: string): PlatformCapability | undefined {
  return PLATFORM_CAPABILITIES.find(platform => platform.id === id)
}
