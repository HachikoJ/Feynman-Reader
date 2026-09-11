import {
  ImportAdapterError,
  MAX_IMPORT_HIGHLIGHTS,
  PLATFORM_CAPABILITIES,
  PLATFORM_CAPABILITY_GROUP_ORDER,
  buildReadwiseBooksUrl,
  buildZoteroAnnotationsUrl,
  dedupeImportedHighlights,
  findMatchingBook,
  fetchReadwiseBooks,
  getPlatformCapability,
  parseCsvHighlights,
  parseHighlightExport,
  parseHighlightExportCandidates,
  parseKindleClippings,
  parseMarkdownHighlights,
  parsePlainTextHighlights,
  parseQuotedExport,
  parseWechatReadingExport,
  readwiseBookToCandidate,
  toImportedNoteRecords,
  zoteroAnnotationsToHighlights,
  zoteroAnnotationsToBookCandidates,
} from '../importAdapters'

const WECHAT_EXPORT = `《人类简史》
作者：尤瓦尔·赫拉利
出版社：中信出版社
出版时间：2017-02-01
ISBN：9787508660752

◆ 第一章 认知革命

认知革命发生于大约七万年前，虚构故事让智人得以大规模协作。

[想法]
这条解释了「想象的共同体」的源头。

◆ 第二章 农业革命

农业革命是史上最大的骗局。

`

const KINDLE_CLIPPINGS = `Sapiens (Yuval Noah Harari)
- 您在第 12 页（位置 #123-125）的标注 | 添加于 2020年1月1日

虚构故事让智人得以大规模协作。

==========
Sapiens (Yuval Noah Harari)
- 您在第 13 页（位置 #140-141）的标注 | 添加于 2020年1月1日

农业革命是史上最大的骗局。

==========
Sapiens (Yuval Noah Harari)
- Your Note on page 14 | Location 150 | Added on Monday, January 6, 2020

作者在这里的结论过于绝对。

==========
`

const APPLE_BOOKS_EXPORT = `Sapiens

第一章 认知革命

“虚构故事让智人得以大规模协作。”
Note: 与《自私的基因》可以对照阅读。

第二章 农业革命

“农业革命是史上最大的骗局。”

`

const MARKDOWN_EXPORT = `# 认知革命

> 虚构故事让智人得以大规模协作。

- 与《自私的基因》可以对照阅读。

## 农业革命

> 农业革命是史上最大的骗局。
`

const CSV_EXPORT = `quote,note,chapter
"虚构故事让智人得以大规模协作。","与《自私的基因》对照","认知革命"
"农业革命是史上最大的骗局。","","农业革命"
`

describe('parseHighlightExport', () => {
  it('extracts book metadata from WeChat Reading exports', () => {
    expect(parseHighlightExportCandidates(WECHAT_EXPORT, 'wechat')).toEqual([
      expect.objectContaining({
        title: '人类简史',
        author: '尤瓦尔·赫拉利',
        highlightCount: 2,
        highlights: expect.any(Array),
      })
    ])
  })

  it('splits Kindle exports by book before import', () => {
    const candidates = parseHighlightExportCandidates(`${KINDLE_CLIPPINGS}\n另一部书 (另一位作者)\n- Your Highlight on page 2 | Location 20 | Added on Monday, January 6, 2020\n\n另一条划线\n\n==========`, 'kindle')
    expect(candidates).toHaveLength(2)
    expect(candidates[0]).toEqual(expect.objectContaining({
      title: 'Sapiens',
      author: 'Yuval Noah Harari',
      highlightCount: 3,
    }))
    expect(candidates[1]).toEqual(expect.objectContaining({
      title: '另一部书',
      author: '另一位作者',
      highlights: [{ quote: '另一条划线', location: '第 2 页 · 位置 20' }],
    }))
  })

  it('parses the official WeChat Reading notes export', () => {
    const highlights = parseWechatReadingExport(WECHAT_EXPORT)
    expect(highlights).toHaveLength(2)
    expect(highlights[0]).toEqual(expect.objectContaining({
      quote: '认知革命发生于大约七万年前，虚构故事让智人得以大规模协作。',
      note: '这条解释了「想象的共同体」的源头。',
      chapterTitle: '第一章 认知革命',
    }))
    expect(highlights[1]).toEqual(expect.objectContaining({
      quote: '农业革命是史上最大的骗局。',
      chapterTitle: '第二章 农业革命',
    }))
  })

  it('parses My Clippings.txt with highlight, note, and location metadata', () => {
    const highlights = parseKindleClippings(KINDLE_CLIPPINGS)
    expect(highlights).toHaveLength(3)
    expect(highlights[0]).toEqual(expect.objectContaining({
      quote: '虚构故事让智人得以大规模协作。',
      location: '第 12 页 · 位置 123-125',
      chapterTitle: 'Sapiens (Yuval Noah Harari)',
    }))
    expect(highlights[2]).toEqual(expect.objectContaining({
      note: '作者在这里的结论过于绝对。',
      location: '第 14 页 · 位置 150',
    }))
  })

  it('parses quoted share text from Apple Books', () => {
    const highlights = parseQuotedExport(APPLE_BOOKS_EXPORT)
    expect(highlights).toHaveLength(2)
    expect(highlights[0]).toEqual(expect.objectContaining({
      quote: '虚构故事让智人得以大规模协作。',
      note: '与《自私的基因》可以对照阅读。',
      chapterTitle: '第一章 认知革命',
    }))
    expect(highlights[1]).toEqual(expect.objectContaining({
      quote: '农业革命是史上最大的骗局。',
      chapterTitle: '第二章 农业革命',
    }))
  })

  it('parses markdown, csv, and plain text exports', () => {
    expect(parseMarkdownHighlights(MARKDOWN_EXPORT)).toEqual([
      { quote: '虚构故事让智人得以大规模协作。', note: '与《自私的基因》可以对照阅读。', chapterTitle: '认知革命' },
      { quote: '农业革命是史上最大的骗局。', chapterTitle: '农业革命' },
    ])
    expect(parseCsvHighlights(CSV_EXPORT)).toEqual([
      { quote: '虚构故事让智人得以大规模协作。', note: '与《自私的基因》对照', chapterTitle: '认知革命' },
      { quote: '农业革命是史上最大的骗局。', chapterTitle: '农业革命' },
    ])
    expect(parsePlainTextHighlights('第一段\n仍然属于第一段\n\n第二段')).toEqual([
      { quote: '第一段\n仍然属于第一段' },
      { quote: '第二段' }
    ])
  })

  it('auto-detects the export format and removes duplicates', () => {
    expect(parseHighlightExport(KINDLE_CLIPPINGS)).toHaveLength(3)
    expect(parseHighlightExport(WECHAT_EXPORT)).toHaveLength(2)
    expect(parseHighlightExport(`> 同一句\n\n> 同一句`)).toEqual([{ quote: '同一句' }])
    expect(parseHighlightExport('   ')).toEqual([])
  })

  it('caps very large exports so a single import cannot flood the notes', () => {
    const blocks = Array.from({ length: MAX_IMPORT_HIGHLIGHTS + 40 }, (_, index) => `第 ${index} 段`)
    expect(parseHighlightExport(blocks.join('\n\n'), 'plain')).toHaveLength(MAX_IMPORT_HIGHLIGHTS)
  })
})

describe('dedupeImportedHighlights', () => {
  it('keeps the first highlight and ignores whitespace-only entries', () => {
    expect(dedupeImportedHighlights([
      { quote: 'A  B' },
      { quote: 'A B' },
      { note: '批注' },
      { },
    ])).toEqual([{ quote: 'A  B' }, { note: '批注' }])
  })
})

describe('book association', () => {
  it('matches normalized titles and uses authors to disambiguate duplicates', () => {
    const books = [
      { id: 'a', name: '《人类简史》', author: '尤瓦尔·赫拉利' },
      { id: 'b', name: '同名书', author: '作者甲' },
      { id: 'c', name: '同名书', author: '作者乙' },
    ]
    expect(findMatchingBook(books, ' 《人类简史》.pdf ', '尤瓦尔·赫拉利')?.id).toBe('a')
    expect(findMatchingBook(books, '同名书', '作者乙')?.id).toBe('c')
    expect(findMatchingBook(books, '同名书')).toBeUndefined()
  })
})

describe('toImportedNoteRecords', () => {
  it('maps highlights to note records that point back at the source chapter', () => {
    let sequence = 0
    const records = toImportedNoteRecords([
      { quote: '虚构故事让智人得以大规模协作。', note: '与《自私的基因》对照', chapterTitle: '第一章 认知革命' },
      { quote: '农业革命是史上最大的骗局。', chapterTitle: '第二章 农业革命' },
    ], {
      chapters: [{ title: '第一章 认知革命' }, { title: '第二章 农业革命' }],
      now: 1_700_000_000_000,
      idFactory: () => `id-${sequence += 1}`,
    })

    expect(records).toEqual([
      {
        id: 'id-1',
        type: 'note',
        content: '与《自私的基因》对照',
        quote: '虚构故事让智人得以大规模协作。',
        chapterTitle: '第一章 认知革命',
        chapterIndex: 0,
        source: 'import',
        createdAt: 1_700_000_000_000,
      },
      {
        id: 'id-2',
        type: 'note',
        content: '农业革命是史上最大的骗局。',
        quote: '农业革命是史上最大的骗局。',
        chapterTitle: '第二章 农业革命',
        chapterIndex: 1,
        source: 'import',
        createdAt: 1_700_000_000_001,
      }
    ])
  })

  it('keeps records usable when the book has no chapter index', () => {
    const records = toImportedNoteRecords([{ quote: '只有划线' }], { idFactory: () => 'fixed', now: 5 })
    expect(records).toEqual([{
      id: 'fixed',
      type: 'note',
      content: '只有划线',
      quote: '只有划线',
      source: 'import',
      createdAt: 5,
    }])
  })
})

describe('Readwise official API adapter', () => {
  it('builds a paginated books URL without leaking the token', () => {
    const url = buildReadwiseBooksUrl({ query: '人类简史', page: 2, pageSize: 25 })
    expect(url).toContain('https://readwise.io/api/v2/books/?')
    expect(url).toContain('page_size=25')
    expect(url).toContain('page=2')
    expect(url).toContain(`title=${encodeURIComponent('人类简史')}`)
    expect(url).not.toContain('token')
  })

  it('maps API payloads to import candidates and drops empty entries', () => {
    expect(readwiseBookToCandidate({
      id: 42,
      title: '人类简史',
      author: '尤瓦尔·赫拉利',
      num_highlights: 2,
      highlights: [
        { id: 1, text: '虚构故事', note: '关键', location: 12, location_type: 'page', highlighted_at: '2024-01-01T00:00:00Z' },
        { id: 2, text: '   ' },
      ]
    })).toEqual({
      externalId: '42',
      title: '人类简史',
      author: '尤瓦尔·赫拉利',
      highlightCount: 2,
      highlights: [{ quote: '虚构故事', note: '关键', location: 'page 12', highlightedAt: Date.parse('2024-01-01T00:00:00Z') }]
    })
    expect(readwiseBookToCandidate({ id: 7, title: '   ' })).toBeNull()
  })

  it('sends the personal token in the Authorization header and reports auth failures', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ results: [{ id: 1, title: '人类简史', highlights: [{ text: '虚构故事' }] }] })
    })
    const originalFetch = global.fetch
    global.fetch = fetchMock as unknown as typeof fetch
    try {
      const books = await fetchReadwiseBooks({ token: 'secret-token' })
      expect(books).toHaveLength(1)
      expect(books[0].title).toBe('人类简史')
      const [requestedUrl, init] = fetchMock.mock.calls[0]
      expect(String(requestedUrl)).toContain('/api/v2/books/')
      expect((init as RequestInit).headers).toEqual(expect.objectContaining({ Authorization: 'Token secret-token' }))

      fetchMock.mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({}) })
      await expect(fetchReadwiseBooks({ token: 'expired' })).rejects.toBeInstanceOf(ImportAdapterError)
      await expect(fetchReadwiseBooks({ token: '  ' })).rejects.toThrow('Readwise 访问令牌')
    } finally {
      global.fetch = originalFetch
    }
  })
})

describe('Zotero official API adapter', () => {
  it('builds a user library annotation query', () => {
    const url = buildZoteroAnnotationsUrl({ apiKey: 'k', userId: '12345', limit: 500, since: 1_700_000_000_000 })
    expect(url.startsWith('https://api.zotero.org/users/12345/items?')).toBe(true)
    expect(url).toContain('itemType=annotation')
    expect(url).toContain('limit=100')
    expect(url).toContain(`since=${Math.floor(1_700_000_000_000 / 1000)}`)
    expect(() => buildZoteroAnnotationsUrl({ apiKey: 'k', userId: '  ' })).toThrow('Zotero 用户 ID')
  })

  it('maps annotations to highlights with the parent document title', () => {
    const highlights = zoteroAnnotationsToHighlights([
      {
        key: 'ABCD',
        data: {
          parentItem: 'PARENT1',
          annotationText: '虚构故事让智人得以大规模协作。',
          annotationComment: '与《自私的基因》对照',
          annotationPageLabel: '12',
          dateAdded: '2024-02-01T10:00:00Z'
        }
      },
      { key: 'EMPTY', data: { annotationText: '  ' } }
    ], new Map([['PARENT1', '人类简史.pdf']]))

    expect(highlights).toEqual([{
      quote: '虚构故事让智人得以大规模协作。',
      note: '与《自私的基因》对照',
      chapterTitle: '人类简史.pdf',
      location: 'p.12',
      highlightedAt: Date.parse('2024-02-01T10:00:00Z')
    }])
  })

  it('keeps annotations grouped by their parent document', () => {
    const candidates = zoteroAnnotationsToBookCandidates([
      { data: { parentItem: 'P1', annotationText: '第一本的划线' } },
      { data: { parentItem: 'P2', annotationText: '第二本的划线' } },
      { data: { parentItem: 'P1', annotationComment: '第一本的笔记' } },
    ], new Map([
      ['P1', { title: '第一本书', author: '作者甲' }],
      ['P2', { title: '第二本书', author: '作者乙' }],
    ]))

    expect(candidates).toHaveLength(2)
    expect(candidates[0]).toEqual(expect.objectContaining({ title: '第一本书', author: '作者甲', highlightCount: 2 }))
    expect(candidates[1]).toEqual(expect.objectContaining({ title: '第二本书', author: '作者乙', highlightCount: 1 }))
  })
})

describe('platform capability registry', () => {
  it('only integrates officially supported hooks', () => {
    const byId = new Map(PLATFORM_CAPABILITIES.map(platform => [platform.id, platform]))
    expect(byId.get('readwise')?.kind).toBe('api')
    expect(byId.get('zotero')?.kind).toBe('api')
    expect(byId.get('wechat-reading')?.kind).toBe('export')
    expect(byId.get('kindle')?.kind).toBe('export')
    expect(byId.get('wechat-reading')?.detailZh)
      .toContain('导出')
    // 反例：没有任何平台被标记为可用的 cookie / 逆向方案。
    expect(PLATFORM_CAPABILITIES.every(platform => ['api', 'export', 'unsupported'].includes(platform.kind))).toBe(true)
  })

  it('groups the platforms we do not integrate into a single entry', () => {
    const byId = new Map(PLATFORM_CAPABILITIES.map(platform => [platform.id, platform]))
    const others = byId.get('others')

    expect(others?.kind).toBe('unsupported')
    for (const name of ['Get笔记', '有道云笔记', '掌阅', '京东读书', '番茄', 'QQ 阅读']) {
      expect(others?.detailZh).toContain(name)
    }
    // 这些平台不应该再有各自独立的条目
    for (const id of ['get-notes', 'youdao', 'closed-readers']) {
      expect(byId.has(id)).toBe(false)
    }
  })

  it('ships export steps and official links for every import-ready platform', () => {
    const exported = PLATFORM_CAPABILITIES.filter(platform => platform.kind === 'export')
    expect(exported.length).toBeGreaterThan(0)
    for (const platform of exported) {
      expect(platform.guideZh?.length ?? 0).toBeGreaterThan(0)
      expect(platform.guideEn?.length ?? 0).toBeGreaterThan(0)
      expect(platform.detailEn?.length ?? 0).toBeGreaterThan(0)
    }
    // 官方链接必须是 https，且只出现在有官方页面的平台上
    for (const platform of PLATFORM_CAPABILITIES) {
      if (!platform.officialUrl) continue
      expect(platform.officialUrl.startsWith('https://')).toBe(true)
      expect(platform.officialUrlLabelZh?.length ?? 0).toBeGreaterThan(0)
    }
  })

  it('keeps the support dialog group order stable', () => {
    expect(PLATFORM_CAPABILITY_GROUP_ORDER).toEqual(['api', 'export', 'unsupported'])
    const ordered = PLATFORM_CAPABILITY_GROUP_ORDER.flatMap(kind =>
      PLATFORM_CAPABILITIES.filter(platform => platform.kind === kind)
    )
    expect(ordered).toHaveLength(PLATFORM_CAPABILITIES.length)
  })

  it('resolves a platform by id for the note-source hint', () => {
    expect(getPlatformCapability('wechat-reading')?.name).toBe('微信读书')
    expect(getPlatformCapability('kindle')?.officialUrl).toBe('https://read.amazon.com/notebook')
    expect(getPlatformCapability('unknown-platform')).toBeUndefined()
  })
})
