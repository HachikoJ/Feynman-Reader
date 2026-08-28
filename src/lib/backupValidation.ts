import type {
  AppSettings,
  Book,
  BookStatus,
  BookTag,
  CustomQuote,
  NoteRecord,
  PersonaQuestion,
  PersonaType,
  PracticeRecord,
  QAPracticeRecord
} from './store'
import {
  MAX_BOOK_LIST_DESCRIPTION_LENGTH,
  MAX_BOOK_LIST_NAME_LENGTH,
  MAX_BOOK_LISTS,
  MAX_BOOK_RELATION_NOTE_LENGTH,
  MAX_BOOK_RELATIONS,
  MAX_BOOK_TAGS,
  MAX_BOOKS_PER_LIST,
  MAX_DOCUMENT_TEXT_LENGTH,
  MAX_TAG_LENGTH
} from './dataLimits'
import { AIUsageRecord, MAX_AI_USAGE_RECORDS } from './aiUsage'
import { getBookRelationIdentity, type BookList, type BookRelation, type BookRelationType } from './bookRelations'
import { migrateToTokenDanceAfterSunset } from './aiProviderPolicy'

export const BACKUP_DATA_VERSION = 5
export { MAX_BACKUP_FILE_BYTES } from './dataLimits'

const MAX_BOOKS = 1000
const MAX_NOTES_PER_BOOK = 5000
const MAX_PRACTICES_PER_BOOK = 2000
const MAX_QA_RECORDS_PER_BOOK = 1000
const MAX_QUOTES = 500
const MAX_TAGS = MAX_BOOK_TAGS
const MAX_RESPONSES = 50
const MAX_QUESTIONS_PER_RECORD = 10
const MAX_ATTEMPTS_PER_QUESTION = 50
const BOOK_RELATION_TYPES = new Set<BookRelationType>(['series', 'related', 'prerequisite', 'sequel', 'prequel'])

const BOOK_STATUSES = new Set<BookStatus>(['unread', 'reading', 'finished'])
const NOTE_TYPES = new Set<NoteRecord['type']>(['note', 'teaching'])
const PERSONAS = new Set<PersonaType>([
  'elementary', 'college', 'professional', 'scientist', 'entrepreneur',
  'teacher', 'investor', 'user', 'competitor', 'nitpicker'
])
const DANGEROUS_KEYS = new Set(['__proto__', 'prototype', 'constructor'])

type ValidationResult<T> = { valid: true; data: T } | { valid: false; error: string }

export interface ValidatedExportData {
  version: number
  exportDate: number
  settings: AppSettings
  books: Book[]
  aiUsageRecords: AIUsageRecord[]
  bookLists: BookList[]
  bookRelations: BookRelation[]
}

class ImportValidationError extends Error {}

function fail(path: string, message: string): never {
  throw new ImportValidationError(`${path}${message}`)
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(path, '格式无效')
  }
  return value as Record<string, unknown>
}

function stringValue(value: unknown, path: string, maxLength: number, required = true): string | undefined {
  if (value === undefined || value === null) {
    if (required) fail(path, '不能为空')
    return undefined
  }
  if (typeof value !== 'string') fail(path, '必须是文本')
  if (required && value.trim().length === 0) fail(path, '不能为空')
  if (value.length > maxLength) fail(path, `超过长度限制（${maxLength} 字符）`)
  return value
}

function identifier(value: unknown, path: string): string {
  const id = stringValue(value, path, 128)!
  if (!/^[A-Za-z0-9._:-]+$/.test(id)) fail(path, '只能包含字母、数字、点、下划线、冒号和连字符')
  return id
}

function finiteNumber(value: unknown, path: string, min: number, max: number, integer = false): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(path, '必须是有效数字')
  if (integer && !Number.isInteger(value)) fail(path, '必须是整数')
  if (value < min || value > max) fail(path, `必须在 ${min}-${max} 之间`)
  return value
}

function timestamp(value: unknown, path: string): number {
  return finiteNumber(value, path, 0, Number.MAX_SAFE_INTEGER, true)
}

function optionalBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function normalizeQuote(value: unknown, path: string): CustomQuote {
  const item = record(value, path)
  return {
    text: stringValue(item.text, `${path}.text`, 500)!,
    author: stringValue(item.author, `${path}.author`, 100)!,
    ...(typeof item.isPreset === 'boolean' ? { isPreset: item.isPreset } : {})
  }
}

export function normalizeSettings(
  value: unknown,
  options: { preserveApiKey?: boolean } = {}
): ValidationResult<AppSettings> {
  try {
    const item = record(value, '设置')
    const quotesRaw = item.quotes === undefined ? [] : item.quotes
    if (!Array.isArray(quotesRaw)) fail('设置.quotes', '必须是数组')
    if (quotesRaw.length > MAX_QUOTES) fail('设置.quotes', `最多允许 ${MAX_QUOTES} 条金句`)

    return {
      valid: true,
      data: migrateToTokenDanceAfterSunset({
        apiKey: options.preserveApiKey && typeof item.apiKey === 'string' && item.apiKey.length <= 500
          ? item.apiKey
          : '',
        aiProvider: item.aiProvider === 'deepseek' || item.aiProvider === 'tokendance'
          ? item.aiProvider
          : (typeof item.apiKey === 'string' && item.apiKey.trim() ? 'deepseek' : 'tokendance'),
        language: item.language === 'en' ? 'en' : 'zh',
        theme: item.theme === 'dark' ? 'dark' : 'light',
        hideApiKeyAlert: optionalBoolean(item.hideApiKeyAlert, false),
        aiDataConsent: optionalBoolean(item.aiDataConsent, false),
        assistantMemoryEnabled: optionalBoolean(item.assistantMemoryEnabled, true),
        quotes: quotesRaw.map((quote, index) => normalizeQuote(quote, `设置.quotes[${index}]`)),
        quotesInitialized: optionalBoolean(item.quotesInitialized, false)
      })
    }
  } catch (error) {
    return { valid: false, error: error instanceof Error ? error.message : '设置数据无效' }
  }
}

function normalizeTag(value: unknown, path: string): BookTag {
  const item = record(value, path)
  return {
    name: stringValue(item.name, `${path}.name`, MAX_TAG_LENGTH)!,
    category: stringValue(item.category, `${path}.category`, MAX_TAG_LENGTH)!
  }
}

function normalizeNote(value: unknown, path: string): NoteRecord {
  const item = record(value, path)
  if (!NOTE_TYPES.has(item.type as NoteRecord['type'])) fail(`${path}.type`, '取值无效')
  const type = item.type as NoteRecord['type']
  return {
    id: identifier(item.id, `${path}.id`),
    type,
    content: stringValue(item.content, `${path}.content`, 200_000)!,
    ...(type === 'teaching' && item.aiReview !== undefined
      ? { aiReview: stringValue(item.aiReview, `${path}.aiReview`, 100_000)! }
      : {}),
    ...(item.phaseId !== undefined ? { phaseId: stringValue(item.phaseId, `${path}.phaseId`, 64)! } : {}),
    createdAt: timestamp(item.createdAt, `${path}.createdAt`)
  }
}

function normalizeScore(value: unknown, path: string): number {
  return finiteNumber(value, path, 0, 100)
}

function normalizePractice(value: unknown, path: string, bookId: string): PracticeRecord {
  const item = record(value, path)
  const scores = record(item.scores, `${path}.scores`)
  const normalizedScores = {
    accuracy: normalizeScore(scores.accuracy, `${path}.scores.accuracy`),
    completeness: normalizeScore(scores.completeness, `${path}.scores.completeness`),
    clarity: normalizeScore(scores.clarity, `${path}.scores.clarity`),
    overall: normalizeScore(scores.overall, `${path}.scores.overall`)
  }

  return {
    id: identifier(item.id, `${path}.id`),
    bookId,
    sessionId: item.sessionId === undefined
      ? `legacy:${bookId}`
      : identifier(item.sessionId, `${path}.sessionId`),
    content: stringValue(item.content, `${path}.content`, 200_000)!,
    aiReview: stringValue(item.aiReview, `${path}.aiReview`, 100_000)!,
    scores: normalizedScores,
    passed: normalizedScores.overall >= 60,
    createdAt: timestamp(item.createdAt, `${path}.createdAt`)
  }
}

function normalizeQuestion(value: unknown, path: string): PersonaQuestion {
  const item = record(value, path)
  if (!PERSONAS.has(item.persona as PersonaType)) fail(`${path}.persona`, '取值无效')
  const score = item.score === undefined ? undefined : normalizeScore(item.score, `${path}.score`)
  const attemptsRaw = item.attempts === undefined ? [] : item.attempts
  if (!Array.isArray(attemptsRaw)) fail(`${path}.attempts`, '必须是数组')
  if (attemptsRaw.length > MAX_ATTEMPTS_PER_QUESTION) {
    fail(`${path}.attempts`, `最多允许 ${MAX_ATTEMPTS_PER_QUESTION} 次回答`)
  }
  const attempts = attemptsRaw.map((value, index) => {
    const attempt = record(value, `${path}.attempts[${index}]`)
    const attemptScore = normalizeScore(attempt.score, `${path}.attempts[${index}].score`)
    return {
      userAnswer: stringValue(attempt.userAnswer, `${path}.attempts[${index}].userAnswer`, 200_000)!,
      answeredAt: timestamp(attempt.answeredAt, `${path}.attempts[${index}].answeredAt`),
      aiReview: stringValue(attempt.aiReview, `${path}.attempts[${index}].aiReview`, 100_000)!,
      score: attemptScore,
      passed: attemptScore >= 60,
      reviewedAt: timestamp(attempt.reviewedAt, `${path}.attempts[${index}].reviewedAt`)
    }
  })
  const latestAttempt = attempts.at(-1)

  return {
    persona: item.persona as PersonaType,
    personaName: stringValue(item.personaName, `${path}.personaName`, 50)!,
    question: stringValue(item.question, `${path}.question`, 20_000)!,
    ...(latestAttempt
      ? {
          userAnswer: latestAttempt.userAnswer,
          answeredAt: latestAttempt.answeredAt,
          aiReview: latestAttempt.aiReview,
          score: latestAttempt.score,
          passed: latestAttempt.passed,
          reviewedAt: latestAttempt.reviewedAt
        }
      : {
          ...(item.userAnswer !== undefined ? { userAnswer: stringValue(item.userAnswer, `${path}.userAnswer`, 200_000)! } : {}),
          ...(item.answeredAt !== undefined ? { answeredAt: timestamp(item.answeredAt, `${path}.answeredAt`) } : {}),
          ...(item.aiReview !== undefined ? { aiReview: stringValue(item.aiReview, `${path}.aiReview`, 100_000)! } : {}),
          ...(score !== undefined ? { score, passed: score >= 60 } : {}),
          ...(item.reviewedAt !== undefined ? { reviewedAt: timestamp(item.reviewedAt, `${path}.reviewedAt`) } : {})
        }),
    ...(attempts.length > 0 ? { attempts } : {})
  }
}

function normalizeQARecord(value: unknown, path: string, bookId: string): QAPracticeRecord {
  const item = record(value, path)
  if (!Array.isArray(item.questions)) fail(`${path}.questions`, '必须是数组')
  if (item.questions.length > MAX_QUESTIONS_PER_RECORD) {
    fail(`${path}.questions`, `最多允许 ${MAX_QUESTIONS_PER_RECORD} 个问题`)
  }
  const questions = item.questions.map((question, index) => normalizeQuestion(question, `${path}.questions[${index}]`))
  return {
    id: identifier(item.id, `${path}.id`),
    bookId,
    sessionId: item.sessionId === undefined
      ? `legacy:${bookId}`
      : identifier(item.sessionId, `${path}.sessionId`),
    questions,
    allPassed: questions.length === 3 && questions.every(question => question.passed === true),
    createdAt: timestamp(item.createdAt, `${path}.createdAt`),
    updatedAt: timestamp(item.updatedAt, `${path}.updatedAt`)
  }
}

function normalizeResponses(value: unknown, path: string): Record<string, string> {
  const item = value === undefined ? {} : record(value, path)
  const entries = Object.entries(item)
  if (entries.length > MAX_RESPONSES) fail(path, `最多允许 ${MAX_RESPONSES} 条阶段回答`)

  const responses: Record<string, string> = {}
  for (const [key, response] of entries) {
    if (DANGEROUS_KEYS.has(key)) fail(`${path}.${key}`, '字段名不安全')
    if (key.length === 0 || key.length > 64) fail(`${path}.${key}`, '字段名无效')
    responses[key] = stringValue(response, `${path}.${key}`, 200_000)!
  }
  return responses
}

function normalizeBook(value: unknown, path: string): Book {
  const item = record(value, path)
  const id = identifier(item.id, `${path}.id`)
  if (!BOOK_STATUSES.has(item.status as BookStatus)) fail(`${path}.status`, '取值无效')

  const notes = item.noteRecords === undefined ? [] : item.noteRecords
  const practices = item.practiceRecords === undefined ? [] : item.practiceRecords
  const qaRecords = item.qaPracticeRecords === undefined ? [] : item.qaPracticeRecords
  const tags = item.tags === undefined ? [] : item.tags
  if (!Array.isArray(notes) || notes.length > MAX_NOTES_PER_BOOK) fail(`${path}.noteRecords`, `最多允许 ${MAX_NOTES_PER_BOOK} 条记录`)
  if (!Array.isArray(practices) || practices.length > MAX_PRACTICES_PER_BOOK) fail(`${path}.practiceRecords`, `最多允许 ${MAX_PRACTICES_PER_BOOK} 条记录`)
  if (!Array.isArray(qaRecords) || qaRecords.length > MAX_QA_RECORDS_PER_BOOK) fail(`${path}.qaPracticeRecords`, `最多允许 ${MAX_QA_RECORDS_PER_BOOK} 条记录`)
  if (!Array.isArray(tags) || tags.length > MAX_TAGS) fail(`${path}.tags`, `最多允许 ${MAX_TAGS} 个标签`)

  const currentPhase = finiteNumber(item.currentPhase, `${path}.currentPhase`, 0, 6, true)
  const normalizedNotes = notes.map((note, index) => normalizeNote(note, `${path}.noteRecords[${index}]`))
  const normalizedPractices = practices.map((practice, index) => normalizePractice(practice, `${path}.practiceRecords[${index}]`, id))
  const normalizedQARecords = qaRecords.map((qa, index) => normalizeQARecord(qa, `${path}.qaPracticeRecords[${index}]`, id))
  const normalizedResponses = normalizeResponses(item.responses, `${path}.responses`)
  normalizeScore(item.bestScore, `${path}.bestScore`)

  const teachingScores = new Map<string, number>()
  normalizedPractices.forEach(practice => {
    if (practice.scores.overall < 60) return
    const sessionId = practice.sessionId || `legacy:${id}`
    teachingScores.set(sessionId, Math.max(teachingScores.get(sessionId) || 0, practice.scores.overall))
  })
  const bestScore = normalizedQARecords.filter(qa => qa.allPassed).reduce((best, qa) => {
    const teachingScore = teachingScores.get(qa.sessionId || `legacy:${id}`) || 0
    if (teachingScore < 60) return best
    const qaScore = qa.questions.reduce((sum, question) => sum + (question.score || 0), 0) / qa.questions.length
    return Math.max(best, Math.round((teachingScore + qaScore) / 2))
  }, 0)
  const practiceCompleted = bestScore >= 60
  const completed = currentPhase === 6 && practiceCompleted
  const hasLearningActivity = currentPhase > 0
    || normalizedNotes.length > 0
    || Object.keys(normalizedResponses).length > 0
    || normalizedPractices.length > 0
    || normalizedQARecords.length > 0
  const status: BookStatus = completed ? 'finished' : hasLearningActivity ? 'reading' : 'unread'

  const book: Book = {
    id,
    name: stringValue(item.name, `${path}.name`, 200)!,
    ...(item.author !== undefined ? { author: stringValue(item.author, `${path}.author`, 100)! } : {}),
    ...(item.cover !== undefined ? { cover: stringValue(item.cover, `${path}.cover`, 5_000_000)! } : {}),
    ...(item.description !== undefined ? { description: stringValue(item.description, `${path}.description`, 5000)! } : {}),
    tags: tags.map((tag, index) => normalizeTag(tag, `${path}.tags[${index}]`)),
    ...(item.documentContent !== undefined ? { documentContent: stringValue(item.documentContent, `${path}.documentContent`, MAX_DOCUMENT_TEXT_LENGTH)! } : {}),
    status,
    currentPhase,
    noteRecords: normalizedNotes,
    responses: normalizedResponses,
    practiceRecords: normalizedPractices,
    qaPracticeRecords: normalizedQARecords,
    ...(item.recommendations !== undefined ? { recommendations: stringValue(item.recommendations, `${path}.recommendations`, 100_000)! } : {}),
    bestScore,
    createdAt: timestamp(item.createdAt, `${path}.createdAt`),
    updatedAt: timestamp(item.updatedAt, `${path}.updatedAt`)
  }
  if (item.isSample === true) book.isSample = true

  if (item.readingProgress !== undefined) {
    const progress = record(item.readingProgress, `${path}.readingProgress`)
    const totalPages = finiteNumber(progress.totalPages, `${path}.readingProgress.totalPages`, 1, 1_000_000, true)
    const currentPage = finiteNumber(progress.currentPage, `${path}.readingProgress.currentPage`, 0, totalPages, true)
    book.readingProgress = {
      currentPage,
      totalPages,
      percentage: finiteNumber(progress.percentage, `${path}.readingProgress.percentage`, 0, 100)
    }
  }

  return book
}

export function normalizeBooks(value: unknown): ValidationResult<Book[]> {
  try {
    if (!Array.isArray(value)) fail('书籍数据', '必须是数组')
    if (value.length > MAX_BOOKS) fail('书籍数据', `最多允许 ${MAX_BOOKS} 本书`)

    const books = value.map((book, index) => normalizeBook(book, `书籍[${index}]`))
    const ids = new Set<string>()
    for (const book of books) {
      if (ids.has(book.id)) fail('书籍数据', `存在重复 ID：${book.id}`)
      ids.add(book.id)
    }
    return { valid: true, data: books }
  } catch (error) {
    return { valid: false, error: error instanceof Error ? error.message : '书籍数据无效' }
  }
}

export function normalizeStoredBooks(value: unknown): { books: Book[]; errors: string[] } {
  if (!Array.isArray(value)) {
    return { books: [], errors: ['书籍数据必须是数组'] }
  }

  const books: Book[] = []
  const errors: string[] = []
  const ids = new Set<string>()
  const records = value.slice(0, MAX_BOOKS)

  if (value.length > MAX_BOOKS) {
    errors.push(`书籍数量超过上限，仅读取前 ${MAX_BOOKS} 本`)
  }

  records.forEach((book, index) => {
    try {
      const normalized = normalizeBook(book, `书籍[${index}]`)
      if (ids.has(normalized.id)) {
        errors.push(`书籍[${index}] ID 重复，已跳过`)
        return
      }
      ids.add(normalized.id)
      books.push(normalized)
    } catch (error) {
      errors.push(error instanceof Error ? error.message : `书籍[${index}]数据无效`)
    }
  })

  return { books, errors }
}

function normalizeAIUsageRecord(value: unknown, path: string): AIUsageRecord {
  const item = record(value, path)
  const promptTokens = finiteNumber(item.promptTokens, `${path}.promptTokens`, 0, Number.MAX_SAFE_INTEGER, true)
  const completionTokens = finiteNumber(item.completionTokens, `${path}.completionTokens`, 0, Number.MAX_SAFE_INTEGER, true)
  const totalTokens = finiteNumber(item.totalTokens, `${path}.totalTokens`, 0, Number.MAX_SAFE_INTEGER, true)

  return {
    id: identifier(item.id, `${path}.id`),
    task: stringValue(item.task, `${path}.task`, 100)!,
    model: stringValue(item.model, `${path}.model`, 100)!,
    promptTokens,
    completionTokens,
    totalTokens,
    createdAt: timestamp(item.createdAt, `${path}.createdAt`),
    ...(item.bookId !== undefined ? { bookId: identifier(item.bookId, `${path}.bookId`) } : {}),
    ...(item.sessionId !== undefined ? { sessionId: identifier(item.sessionId, `${path}.sessionId`) } : {})
  }
}

export function normalizeAIUsageRecords(value: unknown): ValidationResult<AIUsageRecord[]> {
  try {
    const records = value === undefined ? [] : value
    if (!Array.isArray(records)) fail('AI 用量记录', '必须是数组')
    if (records.length > MAX_AI_USAGE_RECORDS) fail('AI 用量记录', `最多允许 ${MAX_AI_USAGE_RECORDS} 条`)
    const normalized = records.map((item, index) => normalizeAIUsageRecord(item, `AI 用量记录[${index}]`))
    const ids = new Set<string>()
    normalized.forEach(record => {
      if (ids.has(record.id)) fail('AI 用量记录', `存在重复 ID：${record.id}`)
      ids.add(record.id)
    })
    return { valid: true, data: normalized }
  } catch (error) {
    return { valid: false, error: error instanceof Error ? error.message : 'AI 用量记录无效' }
  }
}

export function normalizeBookLists(value: unknown, validBookIds?: Set<string>): ValidationResult<BookList[]> {
  try {
    const lists = value === undefined ? [] : value
    if (!Array.isArray(lists)) fail('书单数据', '必须是数组')
    if (lists.length > MAX_BOOK_LISTS) fail('书单数据', `最多允许 ${MAX_BOOK_LISTS} 个书单`)

    const normalized = lists.map((rawList, index) => {
      const path = `书单[${index}]`
      const item = record(rawList, path)
      const bookIds = item.bookIds === undefined ? [] : item.bookIds
      if (!Array.isArray(bookIds)) fail(`${path}.bookIds`, '必须是数组')
      if (bookIds.length > MAX_BOOKS_PER_LIST) fail(`${path}.bookIds`, `最多允许 ${MAX_BOOKS_PER_LIST} 本书`)
      const uniqueBookIds = Array.from(new Set(bookIds.map((bookId, bookIndex) => identifier(bookId, `${path}.bookIds[${bookIndex}]`))))

      return {
        id: identifier(item.id, `${path}.id`),
        name: stringValue(item.name, `${path}.name`, MAX_BOOK_LIST_NAME_LENGTH)!.trim(),
        ...(item.description !== undefined
          ? { description: stringValue(item.description, `${path}.description`, MAX_BOOK_LIST_DESCRIPTION_LENGTH, false)?.trim() || undefined }
          : {}),
        bookIds: validBookIds ? uniqueBookIds.filter(bookId => validBookIds.has(bookId)) : uniqueBookIds,
        createdAt: timestamp(item.createdAt, `${path}.createdAt`),
        updatedAt: timestamp(item.updatedAt, `${path}.updatedAt`)
      }
    })

    const ids = new Set<string>()
    normalized.forEach(list => {
      if (ids.has(list.id)) fail('书单数据', `存在重复 ID：${list.id}`)
      ids.add(list.id)
    })
    return { valid: true, data: normalized }
  } catch (error) {
    return { valid: false, error: error instanceof Error ? error.message : '书单数据无效' }
  }
}

export function normalizeBookRelations(value: unknown, validBookIds?: Set<string>): ValidationResult<BookRelation[]> {
  try {
    const relations = value === undefined ? [] : value
    if (!Array.isArray(relations)) fail('书籍关系', '必须是数组')
    if (relations.length > MAX_BOOK_RELATIONS) fail('书籍关系', `最多允许 ${MAX_BOOK_RELATIONS} 条`)

    const normalized = relations.map((rawRelation, index) => {
      const path = `书籍关系[${index}]`
      const item = record(rawRelation, path)
      if (!BOOK_RELATION_TYPES.has(item.type as BookRelationType)) fail(`${path}.type`, '取值无效')
      const fromBookId = identifier(item.fromBookId, `${path}.fromBookId`)
      const toBookId = identifier(item.toBookId, `${path}.toBookId`)
      if (fromBookId === toBookId) fail(path, '不能关联书籍自身')
      return {
        id: identifier(item.id, `${path}.id`),
        fromBookId,
        toBookId,
        type: item.type as BookRelationType,
        ...(item.note !== undefined
          ? { note: stringValue(item.note, `${path}.note`, MAX_BOOK_RELATION_NOTE_LENGTH, false)?.trim() || undefined }
          : {}),
        createdAt: timestamp(item.createdAt, `${path}.createdAt`)
      }
    }).filter(relation => !validBookIds || (validBookIds.has(relation.fromBookId) && validBookIds.has(relation.toBookId)))

    const ids = new Set<string>()
    const relationKeys = new Set<string>()
    normalized.forEach(relation => {
      if (ids.has(relation.id)) fail('书籍关系', `存在重复 ID：${relation.id}`)
      ids.add(relation.id)
      const relationKey = getBookRelationIdentity(relation.fromBookId, relation.toBookId, relation.type)
      if (relationKeys.has(relationKey)) fail('书籍关系', '存在重复关系')
      relationKeys.add(relationKey)
    })
    return { valid: true, data: normalized }
  } catch (error) {
    return { valid: false, error: error instanceof Error ? error.message : '书籍关系无效' }
  }
}

export function normalizeImportData(value: unknown): ValidationResult<ValidatedExportData> {
  try {
    const item = record(value, '备份数据')
    const version = finiteNumber(item.version, '数据版本', 1, BACKUP_DATA_VERSION, true)
    const exportDate = timestamp(item.exportDate, '导出日期')
    const settings = normalizeSettings(item.settings)
    if (!settings.valid) fail('设置：', settings.error)
    const books = normalizeBooks(item.books)
    if (!books.valid) fail('', books.error)
    const aiUsageRecords = normalizeAIUsageRecords(item.aiUsageRecords)
    if (!aiUsageRecords.valid) fail('', aiUsageRecords.error)
    const bookIds = new Set(books.data.map(book => book.id))
    const bookLists = normalizeBookLists(item.bookLists, bookIds)
    if (!bookLists.valid) fail('', bookLists.error)
    const bookRelations = normalizeBookRelations(item.bookRelations, bookIds)
    if (!bookRelations.valid) fail('', bookRelations.error)

    return {
      valid: true,
      data: {
        version,
        exportDate,
        settings: settings.data,
        books: books.data,
        aiUsageRecords: aiUsageRecords.data,
        bookLists: bookLists.data,
        bookRelations: bookRelations.data
      }
    }
  } catch (error) {
    return { valid: false, error: error instanceof Error ? error.message : '备份数据无效' }
  }
}
