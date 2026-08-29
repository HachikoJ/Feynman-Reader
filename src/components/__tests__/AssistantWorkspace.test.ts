import type { Book } from '@/lib/store'
import type { AssistantAttachment } from '@/lib/assistantSessions'
import {
  buildAssistantAttachmentContext,
  buildAssistantBookContext,
  deriveAssistantSessionTitle,
  findAssistantMentionedBook,
  getAssistantMentionQuery,
  clampAssistantPosition,
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

  it('detects both @ mentions and directly typed book names', () => {
    expect(findAssistantMentionedBook('请结合 @追风筝的人 解释背叛', books)?.id).toBe('kite')
    expect(findAssistantMentionedBook('我对活着的结尾有疑问', books)?.id).toBe('short')
    expect(findAssistantMentionedBook('今天聊点别的', books)).toBeUndefined()
  })

  it('returns the active @ query at the cursor', () => {
    expect(getAssistantMentionQuery('比较一下 @追风', 8)).toEqual({ start: 5, query: '追风' })
    expect(getAssistantMentionQuery('邮箱 a@b.com', 10)).toBeNull()
    expect(getAssistantMentionQuery('没有引用', 4)).toBeNull()
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
