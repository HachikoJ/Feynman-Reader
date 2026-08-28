import type { Book, NoteRecord, PersonaQuestion, PracticeRecord, QAPracticeRecord } from './store'

export type LearningRecordKind = 'note' | 'phase' | 'practice' | 'question' | 'answer'

interface LearningRecordEntry {
  bookId: string
  bookName: string
  kind: LearningRecordKind
  label: string
  content: string
  createdAt: number
}

export interface LearningRecordMatch extends LearningRecordEntry {
  score: number
}

const MAX_CONTEXT_CHARS = 28_000
const MAX_MATCHES = 10

function trim(value: string, max: number): string {
  const normalized = value.trim()
  return normalized.length <= max ? normalized : `${normalized.slice(0, max)}…`
}

function entry(book: Book, kind: LearningRecordKind, label: string, content: string, createdAt: number): LearningRecordEntry {
  return { bookId: book.id, bookName: book.name, kind, label, content: content.trim(), createdAt }
}

function questionEntries(book: Book, record: QAPracticeRecord): LearningRecordEntry[] {
  return record.questions.flatMap((question: PersonaQuestion) => {
    const attempts = (question.attempts || []).map((attempt, index) => `第 ${index + 1} 次回答（${new Date(attempt.answeredAt).toLocaleDateString('zh-CN')}）：${attempt.userAnswer}\nAI 点评：${attempt.aiReview}\n得分：${attempt.score}/100`).join('\n')
    const latest = question.userAnswer || question.aiReview
      ? `当前回答：${question.userAnswer || '未回答'}\n当前点评：${question.aiReview || '暂无点评'}\n当前得分：${question.score ?? '未评分'}`
      : ''
    return [entry(book, 'question', `${question.personaName} 的角色提问`, `问题：${question.question}\n${latest}${attempts ? `\n历史尝试：\n${attempts}` : ''}`, question.answeredAt || record.updatedAt)]
  })
}

function allEntries(book: Book): LearningRecordEntry[] {
  const notes = (book.noteRecords || []).map((note: NoteRecord) => entry(book, 'note', note.type === 'teaching' ? '教学笔记' : '读书笔记', `笔记：${note.content}${note.aiReview ? `\nAI 点评：${note.aiReview}` : ''}${note.phaseId ? `\n关联阶段：${note.phaseId}` : ''}`, note.createdAt))
  const phases = Object.entries(book.responses || {}).map(([phase, content]) => entry(book, 'phase', `阶段分析：${phase}`, content, book.updatedAt))
  const practices = (book.practiceRecords || []).map((record: PracticeRecord) => entry(book, 'practice', '费曼实践记录', `用户复述：\n${record.content}\n\nAI 点评：\n${record.aiReview}\n\n评分：准确度 ${record.scores.accuracy}，完整度 ${record.scores.completeness}，清晰度 ${record.scores.clarity}，综合 ${record.scores.overall}；${record.passed ? '已通过' : '待改进'}`, record.createdAt))
  const questions = (book.qaPracticeRecords || []).flatMap(record => questionEntries(book, record))
  return [...notes, ...phases, ...practices, ...questions].filter(item => item.content)
}

function terms(value: string): string[] {
  const normalized = value.toLocaleLowerCase().replace(/[@#]/g, ' ')
  const latin = normalized.match(/[a-z0-9][a-z0-9_-]{1,}/g) || []
  const han = Array.from(normalized).filter(char => /[\u3400-\u9fff]/u.test(char))
  const bigrams = han.slice(0, 80).map((char, index) => `${char}${han[index + 1] || ''}`).filter(term => term.length === 2)
  return [...new Set([...latin, ...han, ...bigrams])]
}

function scoreEntry(entryValue: LearningRecordEntry, query: string): number {
  const haystack = `${entryValue.label} ${entryValue.content}`.toLocaleLowerCase()
  const queryTerms = terms(query)
  let score = 0
  queryTerms.forEach(term => {
    if (haystack.includes(term)) score += term.length > 1 ? 2 : 1
  })
  const lowerQuery = query.toLocaleLowerCase()
  if (lowerQuery.includes('笔记') && entryValue.kind === 'note') score += 8
  if (/(实践|复述|点评|评分|表现|错误|薄弱)/.test(lowerQuery) && entryValue.kind === 'practice') score += 7
  if (/(问答|提问|问题|角色|回答|追问)/.test(lowerQuery) && entryValue.kind === 'question') score += 7
  if (/(阶段|分析|背景|概览|拆解|辩证|融会)/.test(lowerQuery) && entryValue.kind === 'phase') score += 6
  if (haystack.includes(lowerQuery.trim()) && lowerQuery.trim().length > 1) score += 12
  return score
}

export function searchLearningRecords(query: string, books: Book[], book?: Book | null): LearningRecordMatch[] {
  const pool = book ? [book] : books
  return pool
    .flatMap(item => allEntries(item))
    .map(item => ({ ...item, score: scoreEntry(item, query) }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score || b.createdAt - a.createdAt)
    .slice(0, MAX_MATCHES)
}

function compactMatch(match: LearningRecordMatch): string {
  return `【${match.bookName}｜${match.label}】\n${match.content}`
}

export function buildAssistantLearningContext(query: string, books: Book[], mentionedBook?: Book | null): string {
  const matches = searchLearningRecords(query, books, mentionedBook)
  const contextualMatches = mentionedBook && matches.length === 0
    ? allEntries(mentionedBook).map(item => ({ ...item, score: 1 })).sort((a, b) => b.createdAt - a.createdAt).slice(0, MAX_MATCHES)
    : matches
  const overview = mentionedBook
    ? `书籍：${mentionedBook.name}\n作者：${mentionedBook.author || '未知'}\n简介：${mentionedBook.description || '暂无'}\n学习阶段：${mentionedBook.currentPhase}/6，综合分：${mentionedBook.bestScore || 0}`
    : ''
  if (!contextualMatches.length) return overview
  let remaining = MAX_CONTEXT_CHARS - overview.length
  const details: string[] = []
  for (const match of contextualMatches) {
    if (remaining <= 0) break
    const value = trim(compactMatch(match), Math.min(6_000, remaining))
    details.push(value)
    remaining -= value.length
  }
  return [overview, details.length ? `相关原始学习记录（按当前问题匹配，保留原回答与点评）：\n${details.join('\n\n')}` : ''].filter(Boolean).join('\n\n')
}

export function buildFeynmanNudge(books: Book[], lang: 'zh' | 'en'): string {
  const candidates = books
    .flatMap(book => allEntries(book).map(record => ({ book, record })))
    .sort((a, b) => {
      const aWeak = a.record.kind === 'practice' && /待改进/.test(a.record.content) ? 0 : 1
      const bWeak = b.record.kind === 'practice' && /待改进/.test(b.record.content) ? 0 : 1
      return aWeak - bWeak || b.record.createdAt - a.record.createdAt
    })
  const selected = candidates[0]
  if (!selected) return lang === 'zh'
    ? '欢迎回来。今天可以选一本书，用自己的话讲清一个概念；讲不清的地方，就是下一轮学习的起点。'
    : 'Welcome back. Pick one idea and explain it in your own words; whatever feels unclear is your next learning starting point.'
  const date = new Date(selected.record.createdAt).toLocaleDateString(lang === 'zh' ? 'zh-CN' : 'en-US')
  if (lang === 'zh') return `根据你的学习记录：你在 ${date} 做过《${selected.book.name}》的${selected.record.label}。费曼学习法的下一步不是重读全部内容，而是再次复述并找出卡住的地方。今天建议从这条记录开始，我可以帮你逐句追问、对照原点评并安排一次短复习。`
  return `From your learning history: on ${date}, you worked on ${selected.record.label} in ${selected.book.name}. The next Feynman step is not rereading everything, but explaining it again and finding the exact point that still feels unclear. I can ask follow-up questions, compare the earlier review, and plan a short refresher.`
}
