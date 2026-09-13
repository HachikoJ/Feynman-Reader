import type { Book, BookChapter } from './store'
import { inferHeadingLevels, scanMarkdownHeadings } from './markdownSyntax'

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

/**
 * 目录项：按 book.chapters 的层级与正文里的标题还原「卷 / 章 / 节」结构。
 * 续页只影响正文渲染，永远不进目录，一个真实章节在目录里只有一项。
 */
export interface ReaderTocItem {
  /** 对应 book.chapters 下标；章节之前的前置正文等合成节点为 -1。 */
  chapterIndex: number
  title: string
  /** 1 为卷 / 部，2 为章，3 为节，最深 6 级。 */
  level: number
  /** 点击目录后跳转到的节；章节取第一节，正文标题取标题所在的节。 */
  sectionIndex: number
  /** 标题在全书正文中的字符偏移，用于目录点击后精确滚动与当前标题高亮。 */
  offset: number
  children: ReaderTocItem[]
}

/** 扁平化后的目录项，depth 为在目录树里的缩进层级，便于按顺序渲染与定位。 */
export interface FlatReaderTocItem extends ReaderTocItem {
  depth: number
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
    if (previous && start < previous.end) {
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

interface TocSeed {
  title: string
  level: number
  sectionIndex: number
  chapterIndex: number
  offset: number
}

function normalizeLevel(value: number | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return Math.min(6, Math.max(1, Math.round(value)))
}

/** 章节对应的第一个节；定位表被合并等异常情况下退回按偏移定位。 */
function firstSectionOfChapter(
  firstSectionByChapter: Map<number, number>,
  sections: ReaderSection[],
  chapterIndex: number,
  offset: number
): number {
  const matched = firstSectionByChapter.get(chapterIndex)
  return matched !== undefined ? matched : findSectionIndexForOffset(sections, offset)
}

/**
 * 构建阅读目录：
 * - 以 book.chapters 的层级为主干，旧数据没有 level 时按标题文本推断；
 * - 正文里残留的 Markdown 标题（老数据里的 H4-H6、EPUB 嵌套小节等）按偏移补成子标题；
 * - 长章节的性能续页不生成目录项，目录里一个章节只有一项。
 */
export function buildReaderToc(
  book: Pick<Book, 'documentContent' | 'chapters'>,
  sections: ReaderSection[]
): ReaderTocItem[] {
  const content = book.documentContent ?? ''
  if (sections.length === 0 || content.trim().length === 0) return []

  const chapters = book.chapters ?? []
  const inferredLevels = inferHeadingLevels(chapters.map(chapter => chapter.title))
  const chapterEntries = chapters.map((chapter, index) => ({
    index,
    title: chapter.title,
    level: normalizeLevel(chapter.level) ?? normalizeLevel(inferredLevels[index]) ?? 1,
    offset: clampOffset(chapter.start, content.length)
  }))
  const firstSectionByChapter = new Map<number, number>()
  sections.forEach((section, index) => {
    if (section.chapterIndex >= 0 && !firstSectionByChapter.has(section.chapterIndex)) {
      firstSectionByChapter.set(section.chapterIndex, index)
    }
  })

  const seeds: TocSeed[] = chapterEntries.map(entry => ({
    title: entry.title,
    level: entry.level,
    sectionIndex: firstSectionOfChapter(firstSectionByChapter, sections, entry.index, entry.offset),
    chapterIndex: entry.index,
    offset: entry.offset
  }))

  // 章节标题会在正文块里重复出现，扫描时要跳过这一行，但不能连带跳过同名的小节标题。
  // 因此按「标题 + 所属章节起点」建立配额，只有落在该章节开头的同名标题才被过滤。
  const chapterTitleQuotas = new Map<string, number[]>()
  chapterEntries.forEach(entry => {
    const title = entry.title.trim()
    if (!title) return
    const starts = chapterTitleQuotas.get(title)
    if (starts) starts.push(entry.offset)
    else chapterTitleQuotas.set(title, [entry.offset])
  })
  const ownedChapterHeading = (heading: { title: string; start: number; end: number }): boolean => {
    const starts = chapterTitleQuotas.get(heading.title.trim())
    if (!starts || starts.length === 0) return false
    // 标题行可能被 extractSectionBody 去掉，因此允许标题起点略早于章节起点。
    const slack = heading.end - heading.start
    const matchedIndex = starts.findIndex(start => start >= heading.start - slack && start <= heading.end)
    if (matchedIndex < 0) return false
    starts.splice(matchedIndex, 1)
    return true
  }
  const firstChapterOffset = chapterEntries[0]?.offset ?? 0
  const bodyHeadings = scanMarkdownHeadings(content).filter(heading => {
    if (chapterEntries.length > 0 && heading.start < firstChapterOffset) return false
    if (ownedChapterHeading(heading)) return false
    return true
  })
  // 章节按偏移排好序后，用一次线性扫描把每个正文标题归到最近的上级章节，避免逐个回扫。
  const orderedChapters = chapterEntries.slice().sort((a, b) => a.offset - b.offset)
  let ownerPointer = -1
  bodyHeadings.forEach(heading => {
    while (ownerPointer + 1 < orderedChapters.length && orderedChapters[ownerPointer + 1].offset <= heading.start) {
      ownerPointer += 1
    }
    const owner = ownerPointer >= 0 ? orderedChapters[ownerPointer] : undefined
    const floor = owner ? owner.level + 1 : 1
    seeds.push({
      title: heading.title,
      level: Math.min(6, Math.max(floor, normalizeLevel(heading.level) ?? floor)),
      sectionIndex: findSectionIndexForOffset(sections, heading.start),
      chapterIndex: owner ? owner.index : -1,
      offset: heading.start
    })
  })

  seeds.sort((a, b) => a.offset - b.offset || a.level - b.level)

  // 第一章之前或第一个标题之前的正文（版权页、序言等）也要有入口。
  const firstSeedOffset = seeds[0]?.offset ?? content.length
  if (firstSeedOffset > 0 && content.slice(0, firstSeedOffset).trim()) {
    seeds.unshift({
      title: '',
      level: 1,
      sectionIndex: sections.findIndex(section => section.start === 0),
      chapterIndex: -1,
      offset: 0
    })
  }

  if (seeds.length === 0) {
    return [{
      chapterIndex: -1,
      title: '',
      level: 1,
      sectionIndex: 0,
      offset: 0,
      children: []
    }]
  }

  const roots: ReaderTocItem[] = []
  const stack: ReaderTocItem[] = []
  seeds.forEach(seed => {
    const node: ReaderTocItem = {
      chapterIndex: seed.chapterIndex,
      title: seed.title,
      level: seed.level,
      sectionIndex: Math.max(0, seed.sectionIndex),
      offset: clampOffset(seed.offset, content.length),
      children: []
    }
    while (stack.length > 0 && stack[stack.length - 1].level >= node.level) stack.pop()
    if (stack.length > 0) stack[stack.length - 1].children.push(node)
    else roots.push(node)
    stack.push(node)
  })
  return roots
}

/** 按阅读顺序展开目录树，depth 表示缩进层级，用于列表渲染与当前章节高亮。 */
export function flattenReaderToc(items: ReaderTocItem[], depth = 0): FlatReaderTocItem[] {
  const flat: FlatReaderTocItem[] = []
  items.forEach(item => {
    flat.push({ ...item, depth })
    if (item.children.length > 0) flat.push(...flattenReaderToc(item.children, depth + 1))
  })
  return flat
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
  // 节按偏移递增排列：二分找到最后一个起点不晚于目标的节，再判断它是否覆盖目标。
  let low = 0
  let high = sections.length - 1
  let candidate = -1
  while (low <= high) {
    const middle = (low + high) >> 1
    if (sections[middle].start <= target) {
      candidate = middle
      low = middle + 1
    } else {
      high = middle - 1
    }
  }
  // 偏移落在节之间的空白时取前面最近的一节；早于全书开头则回到第一节。
  return Math.max(0, candidate)
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
