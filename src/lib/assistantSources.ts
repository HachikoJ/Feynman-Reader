export type AssistantSourceKind = 'book' | 'original' | 'note' | 'bookmark' | 'phase' | 'practice' | 'question' | 'recommendation'

export interface AssistantSourceTarget {
  kind: AssistantSourceKind
  bookId: string
  recordId?: string
  phaseId?: string
  questionIndex?: number
  /** Character offset in book.documentContent for reader-level navigation. */
  offset?: number
}

export interface AssistantSource extends AssistantSourceTarget {
  id: string
  label: string
  title: string
  excerpt?: string
  createdAt?: number
}

export const MAX_ASSISTANT_SOURCES = 8
export const MAX_ASSISTANT_SOURCE_ID_CHARS = 200
export const MAX_ASSISTANT_SOURCE_TEXT_CHARS = 220

const SOURCE_KINDS = new Set<AssistantSourceKind>(['book', 'original', 'note', 'bookmark', 'phase', 'practice', 'question', 'recommendation'])
const PHASE_IDS = new Set(['background', 'overview', 'deepDive', 'critical', 'reception', 'synthesis'])

const KIND_LABELS: Record<AssistantSourceKind, string> = {
  book: '书籍',
  original: '原文',
  note: '笔记',
  bookmark: '书签',
  phase: '阶段学习',
  practice: '费曼实践',
  question: '角色问答',
  recommendation: '相关推荐'
}

function compactText(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined
  const compacted = value.replace(/\s+/g, ' ').trim()
  if (!compacted) return undefined
  return compacted.length <= max ? compacted : `${compacted.slice(0, max - 1)}…`
}

function cleanIdentifier(value: unknown): string | undefined {
  const cleaned = compactText(value, MAX_ASSISTANT_SOURCE_ID_CHARS)
  if (!cleaned || /[\u0000-\u001f\u007f]/u.test(cleaned)) return undefined
  return cleaned
}

function cleanQuestionIndex(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 99) return undefined
  return value
}

function cleanOffset(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > Number.MAX_SAFE_INTEGER) return undefined
  return value
}

function isAssistantSourceKind(value: unknown): value is AssistantSourceKind {
  return typeof value === 'string' && SOURCE_KINDS.has(value as AssistantSourceKind)
}

export function isAssistantSourcePhaseId(value: unknown): value is string {
  return typeof value === 'string' && PHASE_IDS.has(value)
}

export function assistantSourceId(target: AssistantSourceTarget): string {
  if (target.kind === 'book') return `book:${target.bookId}`
  if (target.kind === 'original') return `original:${target.bookId}:${target.offset ?? 0}`
  if (target.kind === 'recommendation') return `recommendation:${target.bookId}`
  if (target.kind === 'phase') return `phase:${target.bookId}:${target.phaseId || ''}`
  if (target.kind === 'question') {
    return `question:${target.bookId}:${target.recordId || ''}:${target.questionIndex ?? 'all'}`
  }
  return `${target.kind}:${target.bookId}:${target.recordId || ''}`
}

export function normalizeAssistantSource(value: unknown): AssistantSource | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Partial<AssistantSource>
  if (!isAssistantSourceKind(candidate.kind)) return null

  const bookId = cleanIdentifier(candidate.bookId)
  if (!bookId) return null
  const recordId = cleanIdentifier(candidate.recordId)
  const phaseId = cleanIdentifier(candidate.phaseId)
  const questionIndex = cleanQuestionIndex(candidate.questionIndex)
  const offset = cleanOffset(candidate.offset)

  if (!['book', 'original', 'phase', 'recommendation'].includes(candidate.kind) && !recordId) return null
  if (candidate.kind === 'phase' && !isAssistantSourcePhaseId(phaseId)) return null
  if (candidate.kind === 'question' && candidate.questionIndex !== undefined && questionIndex === undefined) return null
  if (candidate.kind === 'original' && offset === undefined) return null

  const target: AssistantSourceTarget = {
    kind: candidate.kind,
    bookId,
    ...(recordId ? { recordId } : {}),
    ...(phaseId ? { phaseId } : {}),
    ...(questionIndex !== undefined ? { questionIndex } : {}),
    ...(offset !== undefined ? { offset } : {})
  }
  const label = compactText(candidate.label, 40) || KIND_LABELS[candidate.kind]
  const title = compactText(candidate.title, 120) || label
  const excerpt = compactText(candidate.excerpt, MAX_ASSISTANT_SOURCE_TEXT_CHARS)
  const createdAt = typeof candidate.createdAt === 'number' && Number.isFinite(candidate.createdAt)
    ? candidate.createdAt
    : undefined

  return {
    id: assistantSourceId(target),
    ...target,
    label,
    title,
    ...(excerpt ? { excerpt } : {}),
    ...(createdAt !== undefined ? { createdAt } : {})
  }
}

export function normalizeAssistantSources(value: unknown): AssistantSource[] {
  if (!Array.isArray(value)) return []
  const sources: AssistantSource[] = []
  const seen = new Set<string>()
  for (const item of value) {
    const source = normalizeAssistantSource(item)
    if (!source || seen.has(source.id)) continue
    seen.add(source.id)
    sources.push(source)
    if (sources.length >= MAX_ASSISTANT_SOURCES) break
  }
  return sources
}

export function assistantSourceTargetFromSearchParams(params: URLSearchParams): AssistantSourceTarget | null {
  const kind = params.get('sourceKind')
  const bookId = cleanIdentifier(params.get('bookId'))
  if (!isAssistantSourceKind(kind) || !bookId) return null

  const recordId = cleanIdentifier(params.get('sourceId'))
  const phaseId = cleanIdentifier(params.get('sourcePhase'))
  const rawQuestionIndex = params.get('sourceQuestion')
  if (rawQuestionIndex !== null && rawQuestionIndex !== '' && cleanQuestionIndex(Number(rawQuestionIndex)) === undefined) return null
  const questionIndex = rawQuestionIndex === null || rawQuestionIndex === ''
    ? undefined
    : cleanQuestionIndex(Number(rawQuestionIndex))
  const rawOffset = params.get('sourceOffset')
  if (rawOffset !== null && rawOffset !== '' && cleanOffset(Number(rawOffset)) === undefined) return null
  const offset = rawOffset === null || rawOffset === '' ? undefined : cleanOffset(Number(rawOffset))

  return normalizeAssistantSource({
    kind,
    bookId,
    recordId,
    phaseId,
    questionIndex,
    offset,
    label: KIND_LABELS[kind],
    title: KIND_LABELS[kind]
  })
}

export function assistantSourceHref(source: AssistantSourceTarget): string {
  const params = new URLSearchParams({
    view: 'reading',
    bookId: source.bookId,
    sourceKind: source.kind
  })
  if (source.recordId) params.set('sourceId', source.recordId)
  if (source.phaseId) params.set('sourcePhase', source.phaseId)
  if (source.questionIndex !== undefined) params.set('sourceQuestion', String(source.questionIndex))
  if (source.offset !== undefined) params.set('sourceOffset', String(source.offset))
  return `/?${params.toString()}`
}

export function assistantSourceKindLabel(kind: AssistantSourceKind): string {
  return KIND_LABELS[kind]
}

/**
 * Turns valid model citation tokens into regular safe Markdown links. Invalid
 * or out-of-range tokens stay as plain text, and fenced/inline code is left
 * untouched so examples are not made interactive.
 */
export function linkAssistantSourceReferences(content: string, sources: AssistantSource[]): string {
  const normalized = normalizeAssistantSources(sources)
  if (!normalized.length || !content.includes('[R')) return content

  return content.split(/(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`)/g).map(part => {
    if (/^(?:```|~~~|`)/.test(part)) return part
    return part.replace(/\[R(\d+)\](?!\s*\()/g, (token, rawIndex: string) => {
      const source = normalized[Number(rawIndex) - 1]
      return source ? `[R${rawIndex}](${assistantSourceHref(source)})` : token
    })
  }).join('')
}
