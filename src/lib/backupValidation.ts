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
import { MAX_BACKUP_FILE_BYTES, MAX_BOOK_TAGS, MAX_DOCUMENT_TEXT_LENGTH, MAX_TAG_LENGTH } from './dataLimits'

export const BACKUP_DATA_VERSION = 3
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
      data: {
        apiKey: options.preserveApiKey && typeof item.apiKey === 'string' && item.apiKey.length <= 500
          ? item.apiKey
          : '',
        language: item.language === 'en' ? 'en' : 'zh',
        theme: item.theme === 'dark' ? 'dark' : 'light',
        hideApiKeyAlert: optionalBoolean(item.hideApiKeyAlert, false),
        aiDataConsent: optionalBoolean(item.aiDataConsent, false),
        quotes: quotesRaw.map((quote, index) => normalizeQuote(quote, `设置.quotes[${index}]`)),
        quotesInitialized: optionalBoolean(item.quotesInitialized, false)
      }
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
  return {
    id: identifier(item.id, `${path}.id`),
    type: item.type as NoteRecord['type'],
    content: stringValue(item.content, `${path}.content`, 200_000)!,
    ...(item.aiReview !== undefined ? { aiReview: stringValue(item.aiReview, `${path}.aiReview`, 100_000)! } : {}),
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

  const teachingMaxScore = normalizedPractices.reduce((max, practice) => Math.max(max, practice.scores.overall), 0)
  const qaMaxAvgScore = normalizedQARecords
    .filter(qa => qa.allPassed)
    .reduce((max, qa) => {
      const average = qa.questions.reduce((sum, question) => sum + (question.score || 0), 0) / qa.questions.length
      return Math.max(max, average)
    }, 0)
  const completed = teachingMaxScore >= 60 && qaMaxAvgScore >= 60
  const bestScore = completed ? Math.round((teachingMaxScore + qaMaxAvgScore) / 2) : 0
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

export function normalizeImportData(value: unknown): ValidationResult<ValidatedExportData> {
  try {
    const item = record(value, '备份数据')
    const version = finiteNumber(item.version, '数据版本', 1, BACKUP_DATA_VERSION, true)
    const exportDate = timestamp(item.exportDate, '导出日期')
    const settings = normalizeSettings(item.settings)
    if (!settings.valid) fail('设置：', settings.error)
    const books = normalizeBooks(item.books)
    if (!books.valid) fail('', books.error)

    return { valid: true, data: { version, exportDate, settings: settings.data, books: books.data } }
  } catch (error) {
    return { valid: false, error: error instanceof Error ? error.message : '备份数据无效' }
  }
}
