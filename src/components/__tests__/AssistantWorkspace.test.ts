import type { Book } from '@/lib/store'
import type { AssistantAttachment } from '@/lib/assistantSessions'
import {
  buildAssistantAttachmentContext,
  buildAssistantBookContext,
  buildAssistantReferenceScopeInstruction,
  buildAssistantReferenceScopeHint,
  deriveAssistantSessionTitle,
  filterAssistantMentionBooks,
  findAssistantMentionedBook,
  getAssistantMentionQuery,
  clampAssistantPosition,
  hasAssistantAttachmentIntent,
  resolveAssistantContextAttachments,
  resolveAssistantContextBook,
  shouldDeriveAssistantSessionTitle
} from '../AssistantWorkspace'
import { buildAssistantLearningContext, buildFeynmanNudge, searchLearningRecords } from '@/lib/assistantLearningContext'

function makeBook(id: string, name: string): Book {
  return {
    id,
    name,
    author: '测试作者',
    description: '测试简介',
    status: 'reading',
    currentPhase: 2,
    noteRecords: [{ id: 'note-1', type: 'note', content: '用户笔记', createdAt: 1 }],
    responses: { background: '阶段学习记录' },
    practiceRecords: [],
    qaPracticeRecords: [],
    bestScore: 82,
    createdAt: 1,
    updatedAt: 1,
    documentContent: '整本书原文不应进入助手上下文'
  }
}

describe('Feynman Assistant context helpers', () => {
  const books = [makeBook('kite', '追风筝的人'), makeBook('short', '活着')]
  const attachments: AssistantAttachment[] = [
    {
      id: 'attachment-1',
      fileName: 'research.md',
      fileType: 'md',
      content: '研究资料',
      createdAt: 1
    },
    {
      id: 'attachment-2',
      fileName: 'notes.pdf',
      fileType: 'application/pdf',
      content: '阅读笔记',
      createdAt: 2
    }
  ]

  it('detects both @ mentions and directly typed book names', () => {
    expect(findAssistantMentionedBook('请结合 @追风筝的人 解释背叛', books)?.id).toBe('kite')
    expect(findAssistantMentionedBook('我对活着的结尾有疑问', books)?.id).toBe('short')
    expect(findAssistantMentionedBook('今天聊点别的', books)).toBeUndefined()
  })

  it('uses a book only when this message names it or explicitly requests its id', () => {
    expect(resolveAssistantContextBook('这段话和我之前的笔记有什么关系？', books)).toBeUndefined()
    expect(resolveAssistantContextBook('继续解释', books, 'short')?.id).toBe('short')
    expect(resolveAssistantContextBook('请解释追风筝的人的救赎', books, 'short')?.id).toBe('kite')
    expect(resolveAssistantContextBook('继续解释', books, 'missing')).toBeUndefined()
  })

  it('scopes attachments to the object referenced by the current message', () => {
    expect(resolveAssistantContextAttachments('请解释追风筝的人', attachments, true)).toEqual([])
    expect(resolveAssistantContextAttachments('请解释这段选中内容', attachments, true)).toEqual([])
    expect(resolveAssistantContextAttachments('请直接回答这个问题', attachments, false)).toEqual(attachments)
    expect(resolveAssistantContextAttachments('请解释 research.md', attachments, true).map(item => item.id))
      .toEqual(['attachment-1'])
    expect(resolveAssistantContextAttachments('请根据 PDF 附件回答', attachments, false).map(item => item.id))
      .toEqual(['attachment-2'])
    expect(resolveAssistantContextAttachments('请结合追风筝的人和 research.md', attachments, true).map(item => item.id))
      .toEqual(['attachment-1'])
    expect(resolveAssistantContextAttachments('请分析 report.pdf', attachments, false)).toEqual([])
    expect(resolveAssistantContextAttachments('请分析 research.txt', attachments, false)).toEqual([])
    expect(resolveAssistantContextAttachments('请根据 DOCX 附件回答', attachments, false)).toEqual([])
    expect(hasAssistantAttachmentIntent('普通问题')).toBe(false)
    expect(hasAssistantAttachmentIntent('请分析 report.pdf')).toBe(true)
  })

  it('states the current reference scope without forcing review or extra objects', () => {
    const bookOnly = buildAssistantReferenceScopeInstruction(books[0], [])
    const attachmentOnly = buildAssistantReferenceScopeInstruction(undefined, [attachments[0]])
    const combined = buildAssistantReferenceScopeInstruction(books[0], [attachments[0]])
    const selectedOnly = buildAssistantReferenceScopeInstruction(undefined, [], {
      id: 'original:kite:1',
      kind: 'original',
      bookId: 'kite',
      offset: 1,
      label: '原文',
      title: '追风筝的人 · 第一章',
      excerpt: '选中内容'
    })

    expect(bookOnly).toContain('本轮只引用书籍《追风筝的人》')
    expect(bookOnly).toContain('不得要求用户先复习')
    expect(bookOnly).not.toContain('1 个附件')
    expect(attachmentOnly).toContain('本轮只引用1 个附件')
    expect(attachmentOnly).not.toContain('书籍《')
    expect(combined).toContain('书籍《追风筝的人》')
    expect(combined).toContain('1 个附件')
    expect(selectedOnly).toContain('用户选中内容')
    expect(selectedOnly).not.toContain('书籍《')
    expect(buildAssistantReferenceScopeInstruction(undefined, []))
      .toContain('本轮没有明确引用书籍或附件')
    expect(buildAssistantReferenceScopeInstruction(undefined, [], undefined, true))
      .toContain('当前会话没有匹配的附件')
    expect(buildAssistantReferenceScopeInstruction(books[0], [], undefined, true))
      .toContain('用户另外引用的附件当前会话中没有匹配项')
  })

  it('shows the same reference scope that will be sent to the model', () => {
    const selectedSource = {
      id: 'original:kite:1',
      kind: 'original' as const,
      bookId: 'kite',
      offset: 1,
      label: '原文',
      title: '追风筝的人 · 第一章',
      excerpt: '选中内容'
    }

    expect(buildAssistantReferenceScopeHint(undefined, [], selectedSource, 'zh'))
      .toBe('本次将只使用用户选中内容“追风筝的人 · 第一章”作答')
    expect(buildAssistantReferenceScopeHint(books[0], [], null, 'zh'))
      .toBe('本次将只使用书籍《追风筝的人》作答')
    expect(buildAssistantReferenceScopeHint(undefined, [attachments[0]], null, 'zh'))
      .toBe('本次将只使用1 个附件作答')
    expect(buildAssistantReferenceScopeHint(books[0], [attachments[0]], selectedSource, 'zh'))
      .toBe('本次将只使用书籍《追风筝的人》、用户选中内容“追风筝的人 · 第一章”、1 个附件作答')
    expect(buildAssistantReferenceScopeHint(undefined, [], null, 'en')).toBeNull()
    expect(buildAssistantReferenceScopeHint(undefined, [], null, 'zh', true))
      .toBe('本次引用了附件，但当前会话没有匹配的附件')
    expect(buildAssistantReferenceScopeHint(books[0], [], null, 'en', true))
      .toBe('This reply will use only material related to 追风筝的人; the referenced attachment is unavailable')
  })

  it('returns the active @ query at the cursor', () => {
    expect(getAssistantMentionQuery('比较一下 @追风', 8)).toEqual({ start: 5, query: '追风' })
    expect(getAssistantMentionQuery('邮箱 a@b.com', 10)).toBeNull()
    expect(getAssistantMentionQuery('没有引用', 4)).toBeNull()
  })

  it('keeps every matching book in the @ candidate list', () => {
    const library = Array.from({ length: 12 }, (_, index) => makeBook(`book-${index + 1}`, `候选书 ${index + 1}`))

    expect(filterAssistantMentionBooks(library, '')).toHaveLength(12)
    expect(filterAssistantMentionBooks(library, '候')).toHaveLength(12)
    expect(filterAssistantMentionBooks(library, '候选书 12').map(book => book.name)).toEqual(['候选书 12'])
  })

  it('includes learning records but excludes the uploaded full book document', () => {
    const context = buildAssistantBookContext(books[0])

    expect(context).toContain('追风筝的人')
    expect(context).toContain('用户笔记')
    expect(context).toContain('阶段学习记录')
    expect(context).not.toContain('整本书原文不应进入助手上下文')
  })

  it('bounds uploaded file context while retaining file names', () => {
    const attachments: AssistantAttachment[] = [{
      id: 'attachment-1',
      fileName: 'research.md',
      fileType: 'md',
      content: 'a'.repeat(20_000),
      createdAt: 1
    }]
    const context = buildAssistantAttachmentContext(attachments)

    expect(context).toContain('research.md')
    expect(context.length).toBeLessThan(16_100)
  })

  it('derives a concise topic title from the first user message', () => {
    expect(deriveAssistantSessionTitle('请结合《追风筝的人》解释救赎主题的转折点。再给我一个复习问题。', 'zh'))
      .toBe('请结合《追风筝的人》解释救赎主题的转折点')
    expect(deriveAssistantSessionTitle('Hello! Help me compare these two ideas.', 'en'))
      .toBe('Help me compare these two id…')
    expect(deriveAssistantSessionTitle('   ', 'zh')).toBe('新会话')
  })

  it('derives a title after a proactive reminder without overwriting manual titles', () => {
    const reminder = {
      id: 'assistant-reminder',
      role: 'assistant' as const,
      content: '今天可以用费曼学习法复习。',
      createdAt: 1
    }

    expect(shouldDeriveAssistantSessionTitle({ title: '新会话', messages: [reminder] })).toBe(true)
    expect(shouldDeriveAssistantSessionTitle({ title: '我的复习计划', messages: [reminder] })).toBe(false)
    expect(shouldDeriveAssistantSessionTitle({
      title: '新会话',
      messages: [reminder, { id: 'user-1', role: 'user', content: '已经问过的问题', createdAt: 2 }]
    })).toBe(false)
  })

  it('searches detailed notes, practice, and Q&A across books when the title is unknown', () => {
    const detailed = { ...books[0], noteRecords: [{ id: 'note-2', type: 'note' as const, content: '关于创伤记忆与救赎的详细描述', createdAt: 3 }], practiceRecords: [{ id: 'practice-2', bookId: 'kite', content: '我复述了阿米尔的选择', aiReview: '遗漏了哈桑的视角', scores: { accuracy: 70, completeness: 55, clarity: 80, overall: 68 }, passed: true, createdAt: 4 }] }
    const matches = searchLearningRecords('我记得有一份创伤记忆相关描述的笔记', [detailed, books[1]])
    expect(matches[0]).toMatchObject({ bookName: '追风筝的人', kind: 'note' })
    const context = buildAssistantLearningContext('请回顾这本书的实践和记录', [detailed], detailed)
    expect(context).toContain('关于创伤记忆与救赎的详细描述')
    expect(context).toContain('遗漏了哈桑的视角')
  })

  it('retrieves bookmarks and recommendations with inline source ids', () => {
    const enriched = {
      ...books[0],
      bookmarks: [{ id: 'bookmark-1', chapterIndex: 0, offset: 128, chapterTitle: '第一章', snippet: '风筝是救赎的线索', label: '关键转折', createdAt: 5 }],
      recommendations: '可以对照阅读关于创伤与记忆的作品。'
    }
    const bookmarkContext = buildAssistantLearningContext('我的书签里哪一处是关键转折？', [enriched], enriched)
    const recommendationContext = buildAssistantLearningContext('有哪些相关推荐？', [enriched], enriched)

    expect(bookmarkContext).toContain('[R')
    expect(bookmarkContext).toContain('风筝是救赎的线索')
    expect(recommendationContext).toContain('关于创伤与记忆的作品')
  })

  it('builds a Feynman reminder from the actual learning history', () => {
    const reminder = buildFeynmanNudge(books, 'zh')
    expect(reminder).toContain('追风筝的人')
    expect(reminder).toContain('费曼学习法')
  })

  it('keeps the draggable assistant launcher inside the viewport', () => {
    expect(clampAssistantPosition(-20, 700, 56, 56, 375, 812)).toEqual({ x: 8, y: 700 })
    expect(clampAssistantPosition(360, -10, 56, 56, 375, 812)).toEqual({ x: 311, y: 8 })
  })
})
