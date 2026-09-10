export type AssistantSourceKind = 'book' | 'note' | 'phase' | 'practice' | 'question'

export interface AssistantSourceTarget {
  kind: AssistantSourceKind
  bookId: string
  recordId?: string
  phaseId?: string
  questionIndex?: number
}

export interface AssistantSource extends AssistantSourceTarget {
  id: string
  label: string
  title: string
  excerpt?: string
  createdAt?: number
}

export const MAX_ASSISTANT_SOURCES = 6
export const MAX_ASSISTANT_SOURCE_ID_CHARS = 200
export const MAX_ASSISTANT_SOURCE_TEXT_CHARS = 220

const SOURCE_KINDS = new Set<AssistantSourceKind>(['book', 'note', 'phase', 'practice', 'question'])
const PHASE_IDS = new Set(['background', 'overview', 'deepDive', 'critical', 'reception', 'synthesis'])

const KIND_LABELS: Record<AssistantSourceKind, string> = {
  book: '书籍',
  note: '笔记',
  phase: '阶段学习',
  practice: '费曼实践',
  question: '角色问答'
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

function isAssistantSourceKind(value: unknown): value is AssistantSourceKind {
  return typeof value === 'string' && SOURCE_KINDS.has(value as AssistantSourceKind)
}

export function isAssistantSourcePhaseId(value: unknown): value is string {
  return typeof value === 'string' && PHASE_IDS.has(value)
}

export function assistantSourceId(target: AssistantSourceTarget): string {
  if (target.kind === 'book') return `book:${target.bookId}`
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

  if (candidate.kind !== 'book' && candidate.kind !== 'phase' && !recordId) return null
  if (candidate.kind === 'phase' && !isAssistantSourcePhaseId(phaseId)) return null
  if (candidate.kind === 'question' && candidate.questionIndex !== undefined && questionIndex === undefined) return null

  const target: AssistantSourceTarget = {
    kind: candidate.kind,
    bookId,
    ...(recordId ? { recordId } : {}),
    ...(phaseId ? { phaseId } : {}),
    ...(questionIndex !== undefined ? { questionIndex } : {})
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

  return normalizeAssistantSource({
    kind,
    bookId,
    recordId,
    phaseId,
    questionIndex,
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
  return `/?${params.toString()}`
}

export function assistantSourceKindLabel(kind: AssistantSourceKind): string {
  return KIND_LABELS[kind]
}
