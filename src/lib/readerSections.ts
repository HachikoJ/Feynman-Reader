import type { Book, BookChapter } from './store'

/**
 * 站内阅读器把原文切成可独立渲染的“节”：
 * - 有章节结构的书按章节切分，过长的章节再按自然段拆成续页；
 * - 没有章节结构的书按固定字符数分页。
 * 这样 100 万字符的原文也只需要渲染当前一节的 DOM。
 */
export interface ReaderSection {
  /** 全局节序号（从 0 开始），用于阅读进度与定位。 */
  index: number
  title: string
  /** 对应 book.chapters 的下标；没有章节结构时为 -1。 */
  chapterIndex: number
  start: number
  end: number
  /** 该节是同一章节被拆出的续页。 */
  continued: boolean
}

/** 单节最多渲染的字符数，控制长章节的 DOM 体积。 */
export const READER_SECTION_CHARS = 4_000
/** 没有章节结构时的分页大小。 */
export const READER_PAGE_CHARS = 2_600
/** 站内划线保存的原文上限，避免单条记录挤占快照空间。 */
export const MAX_HIGHLIGHT_QUOTE_CHARS = 4_000

interface TextBlock {
  offset: number
  length: number
}

function clampOffset(value: number, max: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(Math.max(0, Math.floor(value)), max)
}

/** 按自然段边界切分文本，尽量不把段落截断在中间。 */
function splitSectionText(text: string, maxChars: number): TextBlock[] {
  const blocks: TextBlock[] = []
  let cursor = 0
  while (cursor < text.length) {
    let end = Math.min(text.length, cursor + maxChars)
    if (end < text.length) {
      const boundary = text.lastIndexOf('\n', end)
      if (boundary > cursor + Math.floor(maxChars / 2)) end = boundary + 1
    }
    blocks.push({ offset: cursor, length: end - cursor })
    cursor = end
  }
  return blocks
}

interface ChapterRange {
  title: string
  start: number
  end: number
  /** 对应 book.chapters 的下标；合成出来的卷首为 -1。 */
  bookChapterIndex: number
}

function normalizeChapterRanges(chapters: BookChapter[] | undefined, contentLength: number): ChapterRange[] {
  if (!chapters || chapters.length === 0) return []
  const ranges: ChapterRange[] = []
  chapters.forEach((chapter, chapterIndex) => {
    const start = clampOffset(chapter.start, contentLength)
    const end = clampOffset(chapter.start + chapter.length, contentLength)
    if (end <= start) return
    const previous = ranges[ranges.length - 1]
    if (previous && start <= previous.end) {
      // 异常重叠的定位表只合并范围，不复制正文，保证正文不丢失也不重复渲染。
      previous.end = Math.max(previous.end, end)
      return
    }
    if (!previous && start > 0) ranges.push({ title: '', start: 0, end: start, bookChapterIndex: -1 })
    ranges.push({ title: chapter.title, start, end, bookChapterIndex: chapterIndex })
  })
  return ranges
}

export function buildReaderSections(book: Pick<Book, 'documentContent' | 'chapters'>): ReaderSection[] {
  const content = book.documentContent ?? ''
  if (content.trim().length === 0) return []

  const ranges = normalizeChapterRanges(book.chapters, content.length)
  const sections: ReaderSection[] = []

  if (ranges.length > 0) {
    ranges.forEach(range => {
      const text = content.slice(range.start, range.end)
      const blocks = splitSectionText(text, READER_SECTION_CHARS)
      blocks.forEach((block, blockIndex) => {
        sections.push({
          index: sections.length,
          title: range.title,
          chapterIndex: range.bookChapterIndex,
          start: range.start + block.offset,
          end: range.start + block.offset + block.length,
          continued: blockIndex > 0
        })
      })
    })
    return sections
  }

  return splitSectionText(content, READER_PAGE_CHARS).map((block, index) => ({
    index,
    title: '',
    chapterIndex: -1,
    start: block.offset,
    end: block.offset + block.length,
    continued: false
  }))
}

/** 阅读进度百分比，用于书架与阅读器保持一致的口径。 */
export function getReaderProgressPercentage(sectionIndex: number, totalSections: number): number {
  if (totalSections <= 0) return 0
  const current = Math.min(Math.max(0, sectionIndex), totalSections - 1)
  return Math.round(((current + 1) / totalSections) * 100)
}

/**
 * 按全书字符偏移定位到对应的节。
 * 书签与检索结果保存的是偏移量而不是节序号，这样即使章节结构变化也能落到正确位置。
 */
export function findSectionIndexForOffset(sections: ReaderSection[], offset: number): number {
  if (sections.length === 0) return 0
  const target = Number.isFinite(offset) ? Math.max(0, Math.floor(offset)) : 0
  const containing = sections.findIndex(section => target >= section.start && target < section.end)
  if (containing >= 0) return containing
  // 偏移落在节与节之间的空白时，取前面最近的一节；早于全书开头则回到第一节。
  for (let index = sections.length - 1; index >= 0; index -= 1) {
    if (sections[index].end <= target) return index
  }
  return 0
}

/**
 * 去掉章节块开头重复的标题行，返回可直接渲染的正文。
 * 解析器写入的章节块形如 `标题\n\n正文`。
 */
export function extractSectionBody(content: string, section: ReaderSection): string {
  const raw = content.slice(section.start, section.end)
  if (!section.title) return raw
  const newlineIndex = raw.indexOf('\n')
  if (newlineIndex < 0) return raw
  const firstLine = raw.slice(0, newlineIndex).trim()
  if (firstLine !== section.title.trim()) return raw
  return raw.slice(newlineIndex + 1).replace(/^\n+/, '')
}

/**
 * 节正文在全书 documentContent 中的起始偏移。
 * 正文是节区块的后缀（去掉重复的标题行），因此可以用结尾位置反推。
 */
export function getSectionBodyStart(content: string, section: ReaderSection): number {
  const body = extractSectionBody(content, section)
  return Math.max(section.start, section.end - body.length)
}
