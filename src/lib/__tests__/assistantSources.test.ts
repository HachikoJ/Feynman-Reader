import {
  assistantSourceHref,
  assistantSourceKindLabel,
  assistantSourceTargetFromSearchParams,
  MAX_ASSISTANT_SOURCES,
  normalizeAssistantSource,
  normalizeAssistantSources
} from '../assistantSources'

describe('assistant source normalization', () => {
  it.each([
    [{ kind: 'book', bookId: 'book-1' }, 'book:book-1'],
    [{ kind: 'note', bookId: 'book-1', recordId: 'note-1' }, 'note:book-1:note-1'],
    [{ kind: 'phase', bookId: 'book-1', phaseId: 'overview' }, 'phase:book-1:overview'],
    [{ kind: 'practice', bookId: 'book-1', recordId: 'practice-1' }, 'practice:book-1:practice-1'],
    [{ kind: 'question', bookId: 'book-1', recordId: 'qa-1', questionIndex: 2 }, 'question:book-1:qa-1:2']
  ])('normalizes a supported source target: %j', (input, expectedId) => {
    expect(normalizeAssistantSource({
      ...input,
      label: '  自定义来源  ',
      title: '  来源标题  ',
      excerpt: '  第一行\n第二行  ',
      createdAt: 123
    })).toMatchObject({
      id: expectedId,
      label: '自定义来源',
      title: '来源标题',
      excerpt: '第一行 第二行',
      createdAt: 123
    })
  })

  it.each([
    null,
    {},
    { kind: 'unknown', bookId: 'book-1' },
    { kind: 'book', bookId: '' },
    { kind: 'note', bookId: 'book-1' },
    { kind: 'phase', bookId: 'book-1', phaseId: 'not-a-phase' },
    { kind: 'practice', bookId: 'book-1' },
    { kind: 'question', bookId: 'book-1' },
    { kind: 'question', bookId: 'book-1', recordId: 'qa-1', questionIndex: -1 },
    { kind: 'question', bookId: 'book-1', recordId: 'qa-1', questionIndex: 100 },
    { kind: 'question', bookId: 'book-1', recordId: 'qa-1', questionIndex: 1.5 }
  ])('rejects malformed source input: %j', value => {
    expect(normalizeAssistantSource(value)).toBeNull()
  })

  it('deduplicates sources and keeps at most six entries', () => {
    const sources = normalizeAssistantSources([
      { kind: 'book', bookId: 'book-1', label: '第一次', title: '第一本书' },
      { kind: 'book', bookId: 'book-1', label: '重复', title: '重复书籍' },
      ...Array.from({ length: 7 }, (_, index) => ({
        kind: 'note',
        bookId: 'book-1',
        recordId: `note-${index}`,
        label: '笔记',
        title: `笔记 ${index}`
      }))
    ])

    expect(sources).toHaveLength(MAX_ASSISTANT_SOURCES)
    expect(sources.filter(source => source.bookId === 'book-1')).toHaveLength(MAX_ASSISTANT_SOURCES)
    expect(new Set(sources.map(source => source.id)).size).toBe(MAX_ASSISTANT_SOURCES)
    expect(sources[0].label).toBe('第一次')
  })

  it('bounds labels, titles, excerpts, and identifiers without control characters', () => {
    const source = normalizeAssistantSource({
      kind: 'book',
      bookId: `book${String.fromCharCode(1)}`,
      label: 'a'.repeat(80),
      title: '标'.repeat(180),
      excerpt: '文'.repeat(300)
    })
    const longId = normalizeAssistantSource({
      kind: 'book',
      bookId: 'b'.repeat(250)
    })

    expect(source).toBeNull()
    expect(longId?.bookId).toHaveLength(200)
  })

  it('round-trips an encoded source URL through trusted search parameters', () => {
    const target = {
      kind: 'question' as const,
      bookId: 'book:雪+1',
      recordId: 'qa+记录/一',
      questionIndex: 3
    }
    const parsed = new URL(assistantSourceHref(target), 'https://reader.deline.top')
    const restored = assistantSourceTargetFromSearchParams(parsed.searchParams)

    expect(parsed.searchParams.get('view')).toBe('reading')
    expect(restored).toMatchObject(target)
    expect(assistantSourceKindLabel(target.kind)).toBe('角色问答')
  })

  it('does not accept a source URL with an incomplete target', () => {
    expect(assistantSourceTargetFromSearchParams(new URLSearchParams({
      sourceKind: 'note',
      bookId: 'book-1'
    }))).toBeNull()
    expect(assistantSourceTargetFromSearchParams(new URLSearchParams({
      sourceKind: 'phase',
      bookId: 'book-1',
      sourcePhase: 'legacy-phase'
    }))).toBeNull()
  })
})
