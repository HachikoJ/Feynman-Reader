import { inferHeadingLevels, parseMarkdownHeading, scanMarkdownHeadings } from '../markdownSyntax'

describe('parseMarkdownHeading', () => {
  it('parses ATX headings from level 1 to 6', () => {
    for (let level = 1; level <= 6; level += 1) {
      const markdown = `${'#'.repeat(level)} 第 ${level} 级标题`
      expect(parseMarkdownHeading(markdown)).toEqual({
        level,
        title: `第 ${level} 级标题`,
        lineCount: 1
      })
    }
  })

  it('accepts closing hashes, up to three leading spaces and spaceless headings', () => {
    expect(parseMarkdownHeading('### 小节 ###')).toEqual({ level: 3, title: '小节', lineCount: 1 })
    expect(parseMarkdownHeading('   #### 缩进标题')).toEqual({ level: 4, title: '缩进标题', lineCount: 1 })
    expect(parseMarkdownHeading('####无空格标题')).toEqual({ level: 4, title: '无空格标题', lineCount: 1 })
    expect(parseMarkdownHeading('#####无空格标题#####')).toEqual({ level: 5, title: '无空格标题', lineCount: 1 })
  })

  it('keeps code directives, shebangs, colour values and long hash runs as plain text', () => {
    expect(parseMarkdownHeading('#include <stdio.h>')).toBeNull()
    expect(parseMarkdownHeading('#!/bin/sh')).toBeNull()
    expect(parseMarkdownHeading('#include')).toBeNull()
    expect(parseMarkdownHeading('####### 七级不是标题')).toBeNull()
    expect(parseMarkdownHeading('#####')).toBeNull()
    expect(parseMarkdownHeading('    #### 四个空格是代码块')).toBeNull()
  })

  it('parses Setext headings from paragraph lines only', () => {
    expect(parseMarkdownHeading('标题一', '=====')).toEqual({ level: 1, title: '标题一', lineCount: 2 })
    expect(parseMarkdownHeading('标题二', '---')).toEqual({ level: 2, title: '标题二', lineCount: 2 })
    expect(parseMarkdownHeading('> 引用不是段落', '---')).toBeNull()
    expect(parseMarkdownHeading('- 列表项', '---')).toBeNull()
    // ATX 标题后面的 `---` 是分隔线，不能把标题行再吞成 Setext 标题。
    expect(parseMarkdownHeading('# 标题', '---')).toEqual({ level: 1, title: '标题', lineCount: 1 })
    expect(parseMarkdownHeading('没有下划线', '正文')).toBeNull()
  })
})

describe('scanMarkdownHeadings', () => {
  it('records levels and offsets for every heading in the body', () => {
    const text = '书名\n\n# 第一章\n\n正文\n\n## 第一节\n\n更多正文'
    const headings = scanMarkdownHeadings(text)

    expect(headings.map(heading => heading.title)).toEqual(['第一章', '第一节'])
    expect(headings.map(heading => heading.level)).toEqual([1, 2])
    expect(headings[0].start).toBe(text.indexOf('# 第一章'))
    expect(headings[1].start).toBe(text.indexOf('## 第一节'))
    expect(headings[0].end).toBe(text.indexOf('# 第一章') + '# 第一章'.length)
  })

  it('skips pseudo headings inside fenced code and consumes both Setext lines', () => {
    const text = '```md\n# 代码里的井号\n```\n\n第一章\n===\n\n正文'
    const headings = scanMarkdownHeadings(text)

    expect(headings.map(heading => heading.title)).toEqual(['第一章'])
    expect(headings[0]).toEqual(expect.objectContaining({ level: 1, lineCount: 2 }))
    expect(text.slice(headings[0].end)).toBe('\n\n正文')
  })
})

describe('inferHeadingLevels', () => {
  it('treats a single structure cue as one flat level', () => {
    expect(inferHeadingLevels(['序', '第一章 甲', '第二章 乙'])).toEqual([1, 1, 1])
    expect(inferHeadingLevels(['第 1 节', '第 2 节'])).toEqual([1, 1])
  })

  it('restores parts, chapters and numbered sections when several cues appear', () => {
    expect(inferHeadingLevels(['第一部 认知', '第一章 甲', '1.1 小节', '第二章 乙'])).toEqual([1, 2, 4, 2])
  })

  it('lets unnumbered titles follow the level of the next structural title', () => {
    expect(inferHeadingLevels(['第一卷', '第一章', '没有编号的小节', '第二章'])).toEqual([1, 2, 2, 2])
  })

  it('returns an empty list for an empty book', () => {
    expect(inferHeadingLevels([])).toEqual([])
  })
})
