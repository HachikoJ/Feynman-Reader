import {
  DEFAULT_HIGHLIGHT_COLOR,
  HIGHLIGHT_COLORS,
  MAX_SEARCH_TERM_LENGTH,
  buildBookmarkSnippet,
  buildHighlightRanges,
  buildSearchSnippet,
  buildTextSegments,
  findTermRanges,
  isHighlightColor,
  scanDocumentMatches
} from '../readerAnnotations'
import type { NoteRecord } from '../store'

function highlight(id: string, quote: string, extra: Partial<NoteRecord> = {}): NoteRecord {
  return {
    id,
    type: 'note',
    content: quote,
    quote,
    source: 'reading',
    createdAt: 1,
    ...extra
  }
}

describe('highlight colors', () => {
  it('accepts only the supported palette', () => {
    for (const color of HIGHLIGHT_COLORS) expect(isHighlightColor(color)).toBe(true)
    expect(isHighlightColor('purple')).toBe(false)
    expect(isHighlightColor(undefined)).toBe(false)
    expect(DEFAULT_HIGHLIGHT_COLOR).toBe('yellow')
  })
})

describe('buildHighlightRanges', () => {
  const body = '虚构故事让智人得以大规模协作。农业革命是史上最大的骗局。'

  it('aligns saved quotes with the rendered section body', () => {
    const records = [
      highlight('a', '虚构故事让智人'),
      highlight('b', '史上最大的骗局')
    ]
    const ranges = buildHighlightRanges(body, records)

    // 第二段引文实际位于第 21 个字符起（“农业革命是”之后）。
    expect(ranges.map(range => [range.start, range.end])).toEqual([
      [0, 7],
      [20, 27]
    ])
    expect(body.slice(20, 27)).toBe('史上最大的骗局')
    expect(ranges.map(range => range.record.id)).toEqual(['a', 'b'])
  })

  it('skips blank quotes and quotes that are not in this section', () => {
    const ranges = buildHighlightRanges(body, [
      highlight('blank', '   '),
      highlight('missing', '这段原文不在这一节里')
    ])

    expect(ranges).toEqual([])
  })

  it('prefers the stored offset over an earlier identical quote', () => {
    const repeated = 'beta gamma beta'
    const second = 11
    const ranges = buildHighlightRanges(repeated, [
      highlight('second', 'beta', { offset: second })
    ], { bodyStart: 0 })

    expect(ranges).toEqual([{ start: second, end: second + 4, record: expect.objectContaining({ id: 'second' }) }])
  })

  it('falls back to text lookup when the stored offset no longer matches the source', () => {
    const ranges = buildHighlightRanges('beta gamma beta', [
      highlight('stale', 'beta', { offset: 3 })
    ], { bodyStart: 0 })

    expect(ranges.map(range => range.start)).toEqual([0])
  })

  it('drops overlapping highlights and respects the render limit', () => {
    const overlapping = buildHighlightRanges(body, [
      highlight('first', '虚构故事让智人'),
      highlight('second', '让智人得以')
    ])
    expect(overlapping.map(range => range.record.id)).toEqual(['first'])

    const limited = buildHighlightRanges('aaaa', [
      highlight('1', 'a'),
      highlight('2', 'a'),
      highlight('3', 'a')
    ], { maxRanges: 1 })
    expect(limited).toHaveLength(1)
  })
})

describe('findTermRanges', () => {
  it('matches case-insensitively and keeps every occurrence in order', () => {
    expect(findTermRanges('Alpha beta ALPHA', 'alpha').map(range => range.start)).toEqual([0, 11])
    expect(findTermRanges('Alpha beta', '')).toEqual([])
  })

  it('stops at the requested limit', () => {
    expect(findTermRanges('a a a a', 'a', 2)).toHaveLength(2)
  })
})

describe('buildTextSegments', () => {
  it('interleaves plain text, highlights and search hits without overlap', () => {
    const body = 'Alpha beta gamma beta'
    const searchRanges = findTermRanges(body, 'beta')
    const segments = buildTextSegments(body, [
      { start: 6, end: 10, record: highlight('h1', 'beta') }
    ], searchRanges, 100)

    expect(segments).toEqual([
      { text: 'Alpha ', kind: 'plain' },
      { text: 'beta', kind: 'highlight', record: expect.objectContaining({ id: 'h1' }) },
      { text: ' gamma ', kind: 'plain' },
      // 'Alpha beta gamma beta' 中第二处 beta 从第 17 个字符开始。
      { text: 'beta', kind: 'search', offset: 117 }
    ])
    expect(segments.map(segment => segment.text).join('')).toBe(body)
  })

  it('returns the body untouched when nothing is marked', () => {
    expect(buildTextSegments('只有正文', [], [], 0)).toEqual([{ text: '只有正文', kind: 'plain' }])
    expect(buildTextSegments('', [], [], 0)).toEqual([])
  })
})

describe('buildSearchSnippet', () => {
  it('adds ellipses on both sides and collapses whitespace', () => {
    expect(buildSearchSnippet('0123456789', 3, '45', 2)).toBe('…123456…')
    expect(buildSearchSnippet('开头\n\n中间 结果 结尾', 5, '结果', 40)).toBe('开头 中间 结果 结尾')
  })
})

describe('scanDocumentMatches', () => {
  it('scans the whole book and keeps match offsets in order', () => {
    const matches = scanDocumentMatches('aa bb aa', 'AA')
    expect(matches.map(match => match.offset)).toEqual([0, 6])
    expect(matches[0].snippet).toContain('aa')
  })

  it('honours the match limit and ignores blank terms', () => {
    expect(scanDocumentMatches('a a a a', 'a', { maxMatches: 2 })).toHaveLength(2)
    expect(scanDocumentMatches('a a a a', '   ')).toEqual([])
    expect(scanDocumentMatches('', 'a')).toEqual([])
  })

  it('truncates overly long terms instead of returning nothing', () => {
    const content = 'a'.repeat(MAX_SEARCH_TERM_LENGTH) + 'tail'
    expect(scanDocumentMatches(content, 'a'.repeat(MAX_SEARCH_TERM_LENGTH + 20))).toHaveLength(1)
  })
})

describe('buildBookmarkSnippet', () => {
  it('compresses whitespace and cuts on a word boundary', () => {
    expect(buildBookmarkSnippet('  第一段\n\n  第二段  ')).toBe('第一段 第二段')
    expect(buildBookmarkSnippet('hello world next', 12)).toBe('hello world…')
  })

  it('falls back to a plain cut when there is no usable boundary', () => {
    expect(buildBookmarkSnippet('abcdefghijklmnop', 8)).toBe('abcdefgh…')
    expect(buildBookmarkSnippet('   ')).toBe('')
  })
})
