import {
  READER_PAGE_CHARS,
  READER_SECTION_CHARS,
  buildReaderSections,
  extractSectionBody,
  findSectionIndexForOffset,
  getSectionBodyStart,
  getReaderProgressPercentage,
} from '../readerSections'

describe('buildReaderSections', () => {
  it('returns no sections for books without source text', () => {
    expect(buildReaderSections({ documentContent: '', chapters: [] })).toEqual([])
    expect(buildReaderSections({ documentContent: '   \n  ' })).toEqual([])
  })

  it('splits a chaptered book by chapter and keeps offsets aligned with the source', () => {
    const chapterOne = '第一章 认知革命\n\n虚构故事让智人得以大规模协作。'
    const chapterTwo = '第二章 农业革命\n\n农业革命是史上最大的骗局。'
    const content = `${chapterOne}\n\n${chapterTwo}`
    const sections = buildReaderSections({
      documentContent: content,
      chapters: [
        { title: '第一章 认知革命', start: 0, length: chapterOne.length },
        { title: '第二章 农业革命', start: chapterOne.length + 2, length: chapterTwo.length },
      ],
    })

    expect(sections.map(section => section.title)).toEqual(['第一章 认知革命', '第二章 农业革命'])
    expect(sections.map(section => section.chapterIndex)).toEqual([0, 1])
    expect(sections.every(section => section.continued === false)).toBe(true)
    for (const section of sections) {
      expect(content.slice(section.start, section.end)).toBe(
        section.chapterIndex === 0 ? chapterOne : chapterTwo
      )
    }
    expect(sections.map(section => section.index)).toEqual([0, 1])
  })

  it('keeps content that appears before the first chapter', () => {
    const content = '版权页信息\n\n第一章 正文'
    const sections = buildReaderSections({
      documentContent: content,
      chapters: [{ title: '第一章 正文', start: 7, length: 6 }],
    })
    expect(sections).toHaveLength(2)
    expect(sections[0]).toEqual(expect.objectContaining({ title: '', chapterIndex: -1, start: 0, end: 7 }))
    expect(sections[1]).toEqual(expect.objectContaining({ title: '第一章 正文', chapterIndex: 0, start: 7 }))
  })

  it('splits oversized chapters into continued sections and prefers paragraph boundaries', () => {
    const paragraph = `${'长'.repeat(99)}\n`
    const longChapter = paragraph.repeat(120)
    const sections = buildReaderSections({
      documentContent: longChapter,
      chapters: [{ title: '长章节', start: 0, length: longChapter.length }],
    })

    expect(sections.length).toBeGreaterThan(1)
    expect(sections[0].continued).toBe(false)
    expect(sections.slice(1).every(section => section.continued)).toBe(true)
    expect(sections.every(section => section.title === '长章节')).toBe(true)
    expect(sections.every(section => section.end - section.start <= READER_SECTION_CHARS)).toBe(true)
    expect(sections[0].end).toBeLessThanOrEqual(READER_SECTION_CHARS)
    // 分节必须首尾相接，保证正文不丢字也不重复。
    for (let index = 1; index < sections.length; index += 1) {
      expect(sections[index].start).toBe(sections[index - 1].end)
    }
    expect(sections[sections.length - 1].end).toBe(longChapter.length)
  })

  it('merges overlapping chapter ranges instead of rendering text twice', () => {
    const content = 'A'.repeat(100)
    const sections = buildReaderSections({
      documentContent: content,
      chapters: [
        { title: '第一章', start: 0, length: 60 },
        { title: '第二章', start: 50, length: 50 },
      ],
    })
    expect(sections).toHaveLength(1)
    expect(sections[0]).toEqual(expect.objectContaining({ title: '第一章', chapterIndex: 0, start: 0, end: 100 }))
  })

  it('paginates books without a chapter index', () => {
    const content = `${'字'.repeat(READER_PAGE_CHARS)}\n${'词'.repeat(READER_PAGE_CHARS)}`
    const sections = buildReaderSections({ documentContent: content })
    expect(sections).toHaveLength(2)
    expect(sections.every(section => section.chapterIndex === -1 && section.title === '')).toBe(true)
    expect(sections.map(section => section.end)).toEqual([READER_PAGE_CHARS + 1, content.length])
  })
})

describe('getReaderProgressPercentage', () => {
  it('tracks section position and stays in range', () => {
    expect(getReaderProgressPercentage(0, 4)).toBe(25)
    expect(getReaderProgressPercentage(3, 4)).toBe(100)
    expect(getReaderProgressPercentage(9, 4)).toBe(100)
    expect(getReaderProgressPercentage(-3, 4)).toBe(25)
    expect(getReaderProgressPercentage(0, 0)).toBe(0)
  })
})

describe('extractSectionBody', () => {
  const section = { index: 0, title: '第一章 认知革命', chapterIndex: 0, start: 0, end: 30, continued: false }

  it('removes the duplicated chapter heading line', () => {
    const content = '第一章 认知革命\n\n虚构故事让智人得以大规模协作。'
    expect(extractSectionBody(content, { ...section, end: content.length })).toBe('虚构故事让智人得以大规模协作。')
  })

  it('keeps the body untouched when the heading is not repeated', () => {
    const content = '虚构故事让智人得以大规模协作。'
    expect(extractSectionBody(content, { ...section, end: content.length })).toBe(content)
  })

  it('returns raw text for sections without a chapter title', () => {
    const content = '正文内容'
    expect(extractSectionBody(content, { ...section, title: '', end: content.length })).toBe(content)
  })
})

describe('getSectionBodyStart', () => {
  it('points at the first body character after a repeated heading', () => {
    const content = '第一章 认知革命\n\n虚构故事让智人得以大规模协作。'
    const readerSection = { index: 0, title: '第一章 认知革命', chapterIndex: 0, start: 0, end: content.length, continued: false }
    const bodyStart = getSectionBodyStart(content, readerSection)
    expect(content.slice(bodyStart, readerSection.end)).toBe('虚构故事让智人得以大规模协作。')
  })

  it('falls back to the section start when the heading is not repeated', () => {
    const content = '虚构故事让智人得以大规模协作。'
    const readerSection = { index: 0, title: '第一章 认知革命', chapterIndex: 0, start: 0, end: content.length, continued: false }
    expect(getSectionBodyStart(content, readerSection)).toBe(0)
  })
})

describe('findSectionIndexForOffset', () => {
  const sections = [
    { index: 0, title: '第一章', chapterIndex: 0, start: 0, end: 10, continued: false },
    { index: 1, title: '第二章', chapterIndex: 1, start: 14, end: 24, continued: false },
  ]

  it('locates the section that contains the offset', () => {
    expect(findSectionIndexForOffset(sections, 0)).toBe(0)
    expect(findSectionIndexForOffset(sections, 9)).toBe(0)
    expect(findSectionIndexForOffset(sections, 14)).toBe(1)
    expect(findSectionIndexForOffset(sections, 23)).toBe(1)
  })

  it('maps offsets in the gap and past the end to the nearest earlier section', () => {
    expect(findSectionIndexForOffset(sections, 12)).toBe(0)
    expect(findSectionIndexForOffset(sections, 99)).toBe(1)
  })

  it('handles offsets before the text, invalid input and empty books', () => {
    expect(findSectionIndexForOffset(sections, -5)).toBe(0)
    expect(findSectionIndexForOffset(sections, Number.NaN)).toBe(0)
    expect(findSectionIndexForOffset([], 10)).toBe(0)
  })
})
