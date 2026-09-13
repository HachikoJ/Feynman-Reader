import { readFileSync } from 'fs'
import path from 'path'
import { parseDocument } from '../document-parser'
import { buildReaderSections, buildReaderToc, findSectionIndexForOffset, flattenReaderToc } from '../readerSections'
import type { BookChapter } from '../store'

/**
 * 真实 Markdown 样例的端到端回归：解析 → 章节定位表 → 分节 → 目录。
 * 样例覆盖卷 / 章 / 节 / 子标题层级、长章节续页、代码块伪标题与 Setext 标题，
 * 与浏览器里手工验收用的同一份文件（fixtures/reader-toc-demo.md）。
 */
const markdown = readFileSync(path.join(__dirname, 'fixtures', 'reader-toc-demo.md'), 'utf8')

function makeFile(): File {
  const bytes = new TextEncoder().encode(markdown)
  return {
    name: 'reader-toc-demo.md',
    size: bytes.length,
    text: async () => markdown,
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
  } as File
}

/** 与 DocumentUpload 的章节定位表保持一致：只保存偏移量，不重复存正文。 */
function buildChapterIndex(chapters: { title: string; content: string; level?: number }[]): BookChapter[] {
  const index: BookChapter[] = []
  let cursor = 0
  chapters.forEach(chapter => {
    const block = `${chapter.title}\n\n${chapter.content}`
    index.push({
      title: chapter.title,
      start: cursor,
      length: block.length,
      ...(chapter.level ? { level: chapter.level } : {})
    })
    cursor += block.length + 2
  })
  return index
}

async function buildDemoBook() {
  const parsed = await parseDocument(makeFile())
  const book = { documentContent: parsed.content, chapters: buildChapterIndex(parsed.chapters ?? []) }
  const sections = buildReaderSections(book)
  return { book, sections, toc: flattenReaderToc(buildReaderToc(book, sections)) }
}

describe('readertoc demo fixture', () => {
  it('builds a 卷 / 章 / 节 / 子标题 tree without any 续页 entry', async () => {
    const { sections, toc } = await buildDemoBook()

    expect(toc.map(item => [item.title, item.depth])).toEqual([
      ['费曼阅读器目录与排版验收', 0],
      ['第一卷 基础篇', 1],
      ['第一章 从问题开始', 2],
      ['1.1 问题比答案重要', 3],
      ['更深一层的问题', 4],
      ['最深层的小节', 5],
      ['第二章 跨页编号', 2],
      ['第二卷 实践篇', 1],
      ['第一章 长章节分页', 2],
      ['1.1 跨页后的子标题', 3],
      ['第二章 展示尾随井号', 2],
      ['这是一个带尾随井号的标题', 1],
      ['Setext 一级标题', 0],
      ['Setext 二级标题', 1]
    ])
    // 长章节确实被拆出了续页，但续页只影响正文分节，目录里一个章节仍然只有一项。
    expect(sections.length).toBeGreaterThan(toc.length)
    expect(sections.filter(section => section.continued).length).toBeGreaterThan(0)
    expect(toc.some(item => item.title.includes('续'))).toBe(false)
    const longChapter = toc.filter(item => item.title === '第一章 长章节分页')
    expect(longChapter).toHaveLength(1)
    const longChapterSections = sections.filter(section => section.chapterIndex === longChapter[0].chapterIndex)
    expect(longChapterSections.length).toBeGreaterThan(1)
    expect(longChapterSections[1].continued).toBe(true)
    expect(longChapter[0].sectionIndex).toBe(longChapterSections[0].index)
    // 跨页之后的子标题排在这一章之后，仍然只出现一次。
    const crossPageHeading = toc.filter(item => item.title === '1.1 跨页后的子标题')
    expect(crossPageHeading).toHaveLength(1)
    expect(crossPageHeading[0].sectionIndex).toBeGreaterThan(longChapter[0].sectionIndex)
  })

  it('keeps fenced code and over-long hash runs out of the contents', async () => {
    const { toc } = await buildDemoBook()
    const titles = toc.map(item => item.title)

    expect(titles).not.toContain('代码块里的标题不应进入目录')
    expect(titles).not.toContain('也不应影响正文渲染')
    expect(titles).not.toContain('####### 七个井号不是 Markdown 标题')
  })

  it('keeps every entry sorted, anchored to a real section and scrollable to its heading', async () => {
    const { sections, toc } = await buildDemoBook()

    expect(toc[0].offset).toBe(0)
    expect(toc.map(item => item.offset)).toEqual([...toc.map(item => item.offset)].sort((a, b) => a - b))
    toc.forEach(item => {
      expect(item.sectionIndex).toBeGreaterThanOrEqual(0)
      expect(item.sectionIndex).toBeLessThan(sections.length)
      // 章节取所属第一节，正文标题取标题所在的节，两者都应落在覆盖该偏移的节上。
      expect(item.sectionIndex).toBe(findSectionIndexForOffset(sections, item.offset))
    })
  })
})
