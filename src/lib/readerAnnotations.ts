import type { HighlightColor as StoredHighlightColor, NoteRecord } from './store'
import { MAX_NOTE_TAG_LENGTH, MAX_NOTE_TAGS } from './dataLimits'

/**
 * 阅读器的划线 / 检索辅助函数。
 *
 * 站内阅读器按节渲染原文，划线记录里只保存了引用文本，没有字符偏移，
 * 因此这里用“在当前节正文中查找引用文本”的方式把划线与正文对齐；
 * 找不到的划线仍会保留在划线面板中，只是不在正文里高亮。
 */

/** 划线颜色。颜色只影响阅读器展示，不改变记录内容。 */
export const HIGHLIGHT_COLORS = ['yellow', 'green', 'blue', 'pink'] as const satisfies readonly StoredHighlightColor[]
export type HighlightColor = (typeof HIGHLIGHT_COLORS)[number]
export const DEFAULT_HIGHLIGHT_COLOR: HighlightColor = 'yellow'

/** 阅读器单节最多渲染的划线片段，避免异常数据拖慢 DOM。 */
export const MAX_RANGES_PER_SECTION = 200
/** 全文检索最多返回的命中数。 */
export const MAX_SEARCH_MATCHES = 200
/** 全文检索关键词长度上限。 */
export const MAX_SEARCH_TERM_LENGTH = 80

/**
 * 规整笔记标签：去空白、忽略大小写去重、限制数量与单个长度。
 * 阅读器与备份导入共用同一套规则，避免两边口径不一致。
 */
export function normalizeNoteTags(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const tags: string[] = []
  const seen = new Set<string>()
  for (const raw of value) {
    if (typeof raw !== 'string') continue
    const tag = raw.trim().replace(/\s+/g, ' ').slice(0, MAX_NOTE_TAG_LENGTH)
    if (!tag) continue
    const key = tag.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    tags.push(tag)
    if (tags.length >= MAX_NOTE_TAGS) break
  }
  return tags
}

export interface HighlightRange {
  start: number
  end: number
  record: NoteRecord
}

export interface HighlightRangeOptions {
  maxRanges?: number
  /**
   * 当前节正文在 documentContent 中的起始偏移。
   * 划线记录里保存了偏移时优先按偏移对齐，避免与正文中相同的句子错位。
   */
  bodyStart?: number
}

export interface SearchMatch {
  offset: number
  snippet: string
}

export type TextSegmentKind = 'plain' | 'highlight' | 'search'

export interface TextSegment {
  text: string
  kind: TextSegmentKind
  /** 命中划线时对应记录，用于正文内点击查看与编辑。 */
  record?: NoteRecord
  /** 检索命中的全局字符偏移，用于跳转定位。 */
  offset?: number
}

export function isHighlightColor(value: unknown): value is HighlightColor {
  return typeof value === 'string' && (HIGHLIGHT_COLORS as readonly string[]).includes(value)
}

/**
 * 把当前节的划线与正文对齐。同一段落被多次划线时保留先出现的记录，
 * 重叠部分不会被重复渲染。
 */
export function buildHighlightRanges(
  body: string,
  records: NoteRecord[],
  options: HighlightRangeOptions = {}
): HighlightRange[] {
  const maxRanges = Math.max(0, options.maxRanges ?? MAX_RANGES_PER_SECTION)
  if (!body || maxRanges <= 0) return []
  const bodyStart = Number.isFinite(options.bodyStart) ? Math.max(0, Math.floor(options.bodyStart as number)) : 0
  const ranges: HighlightRange[] = []
  for (const record of records) {
    if (ranges.length >= maxRanges) break
    const quote = (record.quote || '').trim()
    if (!quote) continue
    // 记录里的偏移是相对全书正文的；换算到当前节后还要核对原文，偏移失效时回退到文本查找。
    const relativeOffset = typeof record.offset === 'number' && Number.isFinite(record.offset)
      ? Math.floor(record.offset) - bodyStart
      : -1
    const offsetMatches = relativeOffset >= 0
      && relativeOffset + quote.length <= body.length
      && body.startsWith(quote, relativeOffset)
    const start = offsetMatches ? relativeOffset : body.indexOf(quote)
    if (start < 0) continue
    const end = start + quote.length
    if (ranges.some(range => start < range.end && end > range.start)) continue
    ranges.push({ start, end, record })
  }
  return ranges.sort((a, b) => a.start - b.start)
}

/** 当前节中所有检索命中（大小写不敏感，用于正文内标记关键词）。 */
export function findTermRanges(body: string, term: string, maxRanges = MAX_RANGES_PER_SECTION): Array<{ start: number; end: number }> {
  const keyword = term.trim()
  if (!body || !keyword || maxRanges <= 0) return []
  const haystack = body.toLocaleLowerCase()
  const needle = keyword.toLocaleLowerCase()
  const ranges: Array<{ start: number; end: number }> = []
  let cursor = 0
  while (ranges.length < maxRanges) {
    const found = haystack.indexOf(needle, cursor)
    if (found < 0) break
    ranges.push({ start: found, end: found + needle.length })
    cursor = found + Math.max(1, needle.length)
  }
  return ranges
}

/**
 * 将正文切成可直接渲染的片段：划线优先，检索命中不覆盖划线。
 */
export function buildTextSegments(
  body: string,
  ranges: HighlightRange[],
  searchRanges: Array<{ start: number; end: number }> = [],
  offsetBase = 0
): TextSegment[] {
  if (!body) return []
  const spans: Array<{ start: number; end: number; kind: TextSegmentKind; record?: NoteRecord; offset?: number }> = []
  const sorted = ranges.slice().sort((a, b) => a.start - b.start)
  for (const range of sorted) {
    const start = Math.max(0, Math.min(range.start, body.length))
    const end = Math.max(start, Math.min(range.end, body.length))
    if (end <= start) continue
    if (spans.some(span => start < span.end && end > span.start)) continue
    spans.push({ start, end, kind: 'highlight', record: range.record })
  }
  for (const range of searchRanges) {
    const start = Math.max(0, Math.min(range.start, body.length))
    const end = Math.max(start, Math.min(range.end, body.length))
    if (end <= start) continue
    if (spans.some(span => start < span.end && end > span.start)) continue
    spans.push({ start, end, kind: 'search', offset: offsetBase + start })
  }
  spans.sort((a, b) => a.start - b.start || a.end - b.end)

  const segments: TextSegment[] = []
  let cursor = 0
  for (const span of spans) {
    if (span.start > cursor) segments.push({ text: body.slice(cursor, span.start), kind: 'plain' })
    segments.push({
      text: body.slice(span.start, span.end),
      kind: span.kind,
      ...(span.record ? { record: span.record } : {}),
      ...(span.offset !== undefined ? { offset: span.offset } : {})
    })
    cursor = span.end
  }
  if (cursor < body.length) segments.push({ text: body.slice(cursor), kind: 'plain' })
  return segments
}

/** 截取命中位置前后的上下文，用于检索结果列表。 */
export function buildSearchSnippet(content: string, offset: number, term: string, contextChars = 40): string {
  const keyword = term.trim()
  const start = Math.max(0, offset - contextChars)
  const end = Math.min(content.length, offset + keyword.length + contextChars)
  const prefix = start > 0 ? '…' : ''
  const suffix = end < content.length ? '…' : ''
  const snippet = content.slice(start, end).replace(/\s+/g, ' ').trim()
  return `${prefix}${snippet}${suffix}`
}

/**
 * 在全书正文中检索关键词。命中数达到上限即停止，避免超长书籍阻塞界面。
 */
export function scanDocumentMatches(
  content: string,
  term: string,
  options: { maxMatches?: number; contextChars?: number } = {}
): SearchMatch[] {
  const keyword = term.trim().slice(0, MAX_SEARCH_TERM_LENGTH)
  if (!content || !keyword) return []
  const maxMatches = Math.max(1, options.maxMatches ?? MAX_SEARCH_MATCHES)
  const haystack = content.toLocaleLowerCase()
  const needle = keyword.toLocaleLowerCase()
  const matches: SearchMatch[] = []
  let cursor = 0
  while (matches.length < maxMatches) {
    const found = haystack.indexOf(needle, cursor)
    if (found < 0) break
    matches.push({ offset: found, snippet: buildSearchSnippet(content, found, keyword, options.contextChars) })
    cursor = found + Math.max(1, needle.length)
  }
  return matches
}

/** 书签摘要：取当前位置起的纯文本，压缩空白后截断。 */
export function buildBookmarkSnippet(text: string, maxLength = 80): string {
  const flattened = text.replace(/\s+/g, ' ').trim()
  if (flattened.length <= maxLength) return flattened
  const clipped = flattened.slice(0, maxLength)
  const boundary = clipped.lastIndexOf(' ')
  const head = boundary > maxLength * 0.6 ? clipped.slice(0, boundary) : clipped
  return `${head.trimEnd()}…`
}
