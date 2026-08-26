'use client'

import { useState, useEffect, useRef } from 'react'
import { Language } from '@/lib/i18n'
import { logger } from '@/lib/logger'
import { Book, PersonaAnswerAttempt, PersonaQuestion, PracticeRecord, QAPracticeRecord, getQAPracticeRecords, addQAPracticeRecord, updateQAPracticeRecord, deleteQAPracticeRecord, flushPendingStoreWrites, isQAPracticeRecordComplete, reloadBookFromPersistence } from '@/lib/store'
import { AI_CONTEXT_LIMIT_EXCEEDED, AI_DATA_CONSENT_REQUIRED, AI_OUTPUT_INCOMPLETE, createDeepSeekClient, evaluatePersonaAnswers, generatePersonaQuestions, PERSONA_QUESTION_COUNT } from '@/lib/deepseek'
import { AI_REQUEST_CANCELLED, AI_TASK_BUSY } from '@/lib/aiRequestManager'
import { tokendanceRecoveryMessage } from '@/lib/tokendance'
import MarkdownRenderer from './MarkdownRenderer'
import SourceEvidence from './SourceEvidence'
import LoadingQuotes from './LoadingQuotes'
import PersonaSelector from './PersonaSelector'
import ScoreTrendChart from './ScoreTrendChart'
import ScoringCriteriaDisplay from './ScoringCriteriaDisplay'
import { ProgressRecord, PERSONA_TYPES } from '@/lib/practiceEnhancement'
import { MAX_AI_ANSWER_LENGTH } from '@/lib/dataLimits'
import AppIcon, { AppIconName } from './AppIcon'

interface Props {
  book: Book
  apiKey: string
  lang: Language
  quotes?: { text: string; author: string }[]
  onBookUpdate?: () => void
  showHistory?: boolean
  onShowHistoryChange?: (show: boolean) => void
  historyRef?: React.RefObject<HTMLDivElement>
  onOpenSettings?: () => void
}

export function selectActiveQARecord(records: QAPracticeRecord[]): QAPracticeRecord | null {
  return records
    .filter(record => !isQAPracticeRecordComplete(record) && record.questions.some(question => !question.passed))
    .reduce<QAPracticeRecord | null>((latest, record) => {
      if (!latest) return record
      return record.updatedAt > latest.updatedAt ? record : latest
    }, null)
}

export function getBestPassedTeachingRecord(records: PracticeRecord[] = []): PracticeRecord | undefined {
  return records
    .filter(record => record.scores.overall >= 60)
    .reduce<PracticeRecord | null>((best, record) => {
      if (!best) return record
      return record.scores.overall > best.scores.overall ? record : best
    }, null) || undefined
}

export function haveAnswersForUnpassedQuestions(
  questions: QAPracticeRecord['questions'],
  answers: Record<number, string>
): boolean {
  return questions.every((question, index) => {
    if (question.passed) return true

    return (answers[index] || question.userAnswer || '').trim().length > 0
  })
}

export function normalizePersonaSelection(selectedIds: string[]): string[] {
  const validIds = new Set(PERSONA_TYPES.map(persona => persona.id))
  const normalized = Array.from(new Set(selectedIds.filter(id => validIds.has(id))))
    .slice(0, PERSONA_QUESTION_COUNT)
  const fallbackIds = ['elementary', 'professional', 'scientist', ...PERSONA_TYPES.map(persona => persona.id)]

  for (const id of fallbackIds) {
    if (normalized.length >= PERSONA_QUESTION_COUNT) break
    if (validIds.has(id) && !normalized.includes(id)) normalized.push(id)
  }

  return normalized
}

type PersonaEvaluation = {
  persona: string
  score: number
  review: string
  passed: boolean
}

const MAX_STORED_ATTEMPTS_PER_QUESTION = 50
const PERSONA_ICONS: AppIconName[] = ['user', 'graduation', 'briefcase', 'microscope', 'landmark', 'graduation', 'scale', 'user', 'building', 'scan']

export function getQuestionAttempts(question: PersonaQuestion): PersonaAnswerAttempt[] {
  if (question.attempts?.length) return question.attempts
  if (
    !question.userAnswer ||
    question.answeredAt === undefined ||
    !question.aiReview ||
    question.score === undefined ||
    question.reviewedAt === undefined
  ) return []

  return [{
    userAnswer: question.userAnswer,
    answeredAt: question.answeredAt,
    aiReview: question.aiReview,
    score: question.score,
    passed: question.score >= 60,
    reviewedAt: question.reviewedAt
  }]
}

export function appendQuestionAttempt(
  question: PersonaQuestion,
  userAnswer: string,
  evaluation: Pick<PersonaEvaluation, 'score' | 'review'>,
  timestamp: number
): PersonaQuestion {
  const attempt: PersonaAnswerAttempt = {
    userAnswer,
    answeredAt: timestamp,
    aiReview: evaluation.review,
    score: evaluation.score,
    passed: evaluation.score >= 60,
    reviewedAt: timestamp
  }
  const attempts = [...getQuestionAttempts(question), attempt]
    .slice(-MAX_STORED_ATTEMPTS_PER_QUESTION)

  return {
    ...question,
    userAnswer: attempt.userAnswer,
    answeredAt: attempt.answeredAt,
    aiReview: attempt.aiReview,
    score: attempt.score,
    passed: attempt.passed,
    reviewedAt: attempt.reviewedAt,
    attempts
  }
}

export function matchEvaluationsToQuestions(
  questions: Array<{ index: number; persona: string }>,
  evaluations: PersonaEvaluation[]
): Array<{ index: number; evaluation: PersonaEvaluation }> {
  const evaluationsByPersona = new Map(evaluations.map(evaluation => [evaluation.persona, evaluation]))

  return questions.flatMap(question => {
    const evaluation = evaluationsByPersona.get(question.persona)
    return evaluation ? [{ index: question.index, evaluation }] : []
  })
}

export default function QAPractice({ book, apiKey, lang, quotes = [], onBookUpdate, showHistory: externalShowHistory, onShowHistoryChange, historyRef, onOpenSettings }: Props) {
  const [currentRecord, setCurrentRecord] = useState<QAPracticeRecord | null>(null)
  const [qaRecords, setQaRecords] = useState<QAPracticeRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [answers, setAnswers] = useState<Record<number, string>>({})
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [internalShowHistory, setInternalShowHistory] = useState(false)

  // 新增状态：角色选择、评分标准显示、进步追踪
  const [selectedPersonaIds, setSelectedPersonaIds] = useState<string[]>([])
  const [showCriteria, setShowCriteria] = useState(false)
  const [showProgress, setShowProgress] = useState(false)
  const requestInFlightRef = useRef(false)
  const deletingRecordIdsRef = useRef(new Set<string>())
  const [deletingRecordIds, setDeletingRecordIds] = useState<Set<string>>(new Set())
  
  // 使用外部控制的showHistory，如果没有则使用内部状态
  const showHistory = externalShowHistory !== undefined ? externalShowHistory : internalShowHistory
  const setShowHistory = onShowHistoryChange || setInternalShowHistory

  useEffect(() => {
    const records = getQAPracticeRecords(book.id)
    setQaRecords(records)
    const activeRecord = selectActiveQARecord(records)
    setCurrentRecord(activeRecord)
    setAnswers(activeRecord
      ? Object.fromEntries(activeRecord.questions.flatMap((question, index) =>
          !question.passed && question.userAnswer ? [[index, question.userAnswer]] : []
        ))
      : {})
    setErrorMessage(null)
  }, [book.id])

  const bestTeachingRecord = getBestPassedTeachingRecord(book.practiceRecords)
  const bestTeachingContent = bestTeachingRecord?.content
  const hasPassedTeaching = bestTeachingContent !== undefined

  const getRequestErrorMessage = (error: unknown, action: 'generate' | 'evaluate') => {
    if (error instanceof Error && error.message === AI_DATA_CONSENT_REQUIRED) {
      return lang === 'zh'
        ? '请先在设置中同意 AI 数据传输，再使用角色问答。'
        : 'Please consent to AI data transfer in Settings before using role-based Q&A.'
    }

    if (error instanceof Error && error.message === AI_CONTEXT_LIMIT_EXCEEDED) {
      if (action === 'generate') {
        return lang === 'zh'
          ? '文档上下文过长，系统自动缩减后仍未完成问题生成。请拆分文档后重试，已有练习记录不会丢失。'
          : 'The document context is too long even after automatic reduction. Split the document and try again; existing practice records were kept.'
      }

      return lang === 'zh'
        ? '文档上下文过长，系统自动缩减后仍未完成评分。你填写的回答已保留，请拆分文档后重试。'
        : 'The document context is too long even after automatic reduction. Your answers were kept; split the document and try again.'
    }

    if (error instanceof Error && error.message === AI_REQUEST_CANCELLED) {
      return lang === 'zh' ? '已取消本次 AI 请求，已填写内容仍然保留。' : 'The AI request was cancelled. Your answers were kept.'
    }
    if (error instanceof Error && error.message === AI_TASK_BUSY) {
      return lang === 'zh' ? '已有 AI 任务正在运行，请等待完成或先取消当前任务。' : 'Another AI task is running. Wait for it to finish or cancel it first.'
    }
    if (error instanceof Error && error.message === AI_OUTPUT_INCOMPLETE) {
      return lang === 'zh' ? 'AI 输出未通过完整性或原文引用校验，请重试。' : 'The AI output failed completeness or source-citation validation. Try again.'
    }

  const recovery = tokendanceRecoveryMessage(error, lang)
  if (recovery) return recovery
  if (error instanceof Error && (error.message === 'Failed to fetch' || error.message.toLowerCase().includes('networkerror'))) {
    return lang === 'zh'
      ? '无法连接 AI 服务。请检查网络、浏览器扩展拦截和 TokenDance API Key，然后重试。'
      : 'Unable to reach the AI service. Check your network, browser extensions, and TokenDance API key, then retry.'
  }

    if (action === 'generate') {
      return lang === 'zh'
        ? '问题生成失败，请检查网络和 API Key 后重试。'
        : 'Question generation failed. Check your network and API key, then try again.'
    }

    return lang === 'zh'
      ? '答案评估失败，你填写的内容已保留，请检查网络和 API Key 后重试。'
      : 'Answer evaluation failed. Your answers were kept; check your network and API key, then try again.'
  }

  // 生成新问题
  const handleGenerateQuestions = async () => {
    if (requestInFlightRef.current) return
    if (!apiKey) {
      setErrorMessage(lang === 'zh' ? '请先在设置中填写 API Key。' : 'Please add an API key in Settings first.')
      return
    }
    if (!bestTeachingContent) {
      setErrorMessage(lang === 'zh'
        ? '请先完成并通过教学模拟（60 分及以上），再生成角色问题。'
        : 'Pass the teaching simulation with 60 or above before generating questions.')
      return
    }

    requestInFlightRef.current = true
    setLoading(true)
    setErrorMessage(null)
    try {
      const client = await createDeepSeekClient(apiKey)

      // 使用用户选择的角色，如果没有则使用默认角色
      const personasToUse = normalizePersonaSelection(selectedPersonaIds)

      // 获取角色详细信息
      const selectedPersonas = PERSONA_TYPES.filter(p => personasToUse.includes(p.id))

      const questions = await generatePersonaQuestions(
        client,
        book.name,
        book.author,
        book.documentContent,
        bestTeachingContent,
        selectedPersonas,
        { task: 'persona-questions', bookId: book.id, sessionId: bestTeachingRecord!.sessionId }
      )

      if (questions.length !== PERSONA_QUESTION_COUNT) {
        throw new Error('AI returned an invalid question set')
      }

      await flushPendingStoreWrites()
      const savedRecord = addQAPracticeRecord(book.id, {
        sessionId: bestTeachingRecord!.sessionId!,
        questions: questions.map(q => ({
          persona: q.persona as any,
          personaName: q.personaName,
          question: q.question
        })),
        allPassed: false
      })
      await flushPendingStoreWrites()
      setCurrentRecord(savedRecord)
      setQaRecords(getQAPracticeRecords(book.id))
      setAnswers({})

      if (onBookUpdate) {
        onBookUpdate()
      }
    } catch (error) {
      await reloadBookFromPersistence(book.id).catch(() => undefined)
      logger.error('生成问题失败:', error)
      setErrorMessage(getRequestErrorMessage(error, 'generate'))
    } finally {
      requestInFlightRef.current = false
      setLoading(false)
    }
  }

  // 提交答案
  const handleSubmitAnswers = async () => {
    if (requestInFlightRef.current) return
    if (!currentRecord || !apiKey) {
      setErrorMessage(lang === 'zh' ? '请先在设置中填写 API Key。' : 'Please add an API key in Settings first.')
      return
    }

    requestInFlightRef.current = true
    setLoading(true)
    setErrorMessage(null)
    try {
      const client = await createDeepSeekClient(apiKey)
      
      // 评估所有未通过且有新答案的问题
      const questionsToEvaluate = currentRecord.questions
        .map((q, i) => ({ ...q, index: i }))
        .filter(q => !q.passed && answers[q.index]?.trim()) // 只评估未通过且有新答案的
        .map(q => ({
          index: q.index,
          persona: q.persona,
          personaName: q.personaName,
          question: q.question,
          answer: answers[q.index]
        }))
      
      if (questionsToEvaluate.length === 0) {
        setErrorMessage(lang === 'zh' ? '请先填写需要重答的问题。' : 'Please answer the questions that still need work.')
        return
      }
      if (questionsToEvaluate.some(question => question.answer.length > MAX_AI_ANSWER_LENGTH)) {
        setErrorMessage(lang === 'zh'
          ? `每题回答不能超过 ${MAX_AI_ANSWER_LENGTH.toLocaleString()} 个字符。`
          : `Each answer cannot exceed ${MAX_AI_ANSWER_LENGTH.toLocaleString()} characters.`)
        return
      }
      
      const evaluations = await evaluatePersonaAnswers(
        client,
        book.name,
        questionsToEvaluate.map(({ index: _index, ...question }) => question),
        book.documentContent,
        { task: 'persona-evaluation', bookId: book.id, sessionId: currentRecord.sessionId }
      )
      const matchedEvaluations = matchEvaluationsToQuestions(questionsToEvaluate, evaluations)
      if (matchedEvaluations.length !== questionsToEvaluate.length) {
        throw new Error('AI returned an incomplete evaluation set')
      }
      
      // 更新记录
      const updatedQuestions = [...currentRecord.questions]
      const answersByIndex = new Map(questionsToEvaluate.map(question => [question.index, question.answer]))
      matchedEvaluations.forEach(({ index, evaluation }) => {
        const answer = answersByIndex.get(index)
        if (!answer) return
        updatedQuestions[index] = appendQuestionAttempt(updatedQuestions[index], answer, evaluation, Date.now())
      })
      
      const allPassed = isQAPracticeRecordComplete(updatedQuestions)
      
      await flushPendingStoreWrites()
      updateQAPracticeRecord(book.id, currentRecord.id, {
        questions: updatedQuestions,
        allPassed
      })
      await flushPendingStoreWrites()
      
      const updatedRecord = getQAPracticeRecords(book.id).find(r => r.id === currentRecord.id)
      if (updatedRecord) {
        setCurrentRecord(updatedRecord)
      }
      setQaRecords(getQAPracticeRecords(book.id))
      setAnswers(Object.fromEntries(updatedQuestions.flatMap((question, index) =>
        !question.passed && question.userAnswer ? [[index, question.userAnswer]] : []
      )))
      
      if (onBookUpdate) {
        onBookUpdate()
      }
      
    } catch (error) {
      const persistedBook = await reloadBookFromPersistence(book.id).catch(() => undefined)
      if (persistedBook) {
        const records = getQAPracticeRecords(book.id)
        const persistedRecord = records.find(record => record.id === currentRecord?.id) || selectActiveQARecord(records)
        setQaRecords(records)
        setCurrentRecord(persistedRecord)
      }
      logger.error('评估失败:', error)
      setErrorMessage(getRequestErrorMessage(error, 'evaluate'))
    } finally {
      requestInFlightRef.current = false
      setLoading(false)
    }
  }

  const handleDeleteRecord = async (recordId: string) => {
    if (deletingRecordIdsRef.current.has(recordId)) return
    deletingRecordIdsRef.current.add(recordId)
    setDeletingRecordIds(new Set(deletingRecordIdsRef.current))
    setErrorMessage(null)
    try {
      await flushPendingStoreWrites()
      deleteQAPracticeRecord(book.id, recordId)
      await flushPendingStoreWrites()
      const records = getQAPracticeRecords(book.id)
      setQaRecords(records)
      if (currentRecord?.id === recordId) {
        const activeRecord = selectActiveQARecord(records)
        setCurrentRecord(activeRecord)
        setAnswers(activeRecord
          ? Object.fromEntries(activeRecord.questions.flatMap((question, index) =>
              !question.passed && question.userAnswer ? [[index, question.userAnswer]] : []
            ))
          : {})
      }
      onBookUpdate?.()
    } catch (error) {
      await reloadBookFromPersistence(book.id).catch(() => undefined)
      const records = getQAPracticeRecords(book.id)
      const activeRecord = selectActiveQARecord(records)
      setQaRecords(records)
      setCurrentRecord(activeRecord)
      logger.error('Q&A record deletion failed:', error)
      setErrorMessage(lang === 'zh'
        ? '问答记录删除失败，原记录已恢复。请稍后重试。'
        : 'The Q&A record could not be deleted and was restored. Please try again.')
    } finally {
      deletingRecordIdsRef.current.delete(recordId)
      setDeletingRecordIds(new Set(deletingRecordIdsRef.current))
    }
  }

  // 将 QA 记录转换为进度记录，用于趋势图
  const getProgressRecords = (): ProgressRecord[] => {
    return qaRecords.filter(isQAPracticeRecordComplete).map(record => {
      const answeredQuestions = record.questions.filter(q => q.score !== undefined)
      const avgScore = answeredQuestions.length > 0
        ? Math.round(answeredQuestions.reduce((sum, q) => sum + (q.score || 0), 0) / answeredQuestions.length)
        : 0

      return {
        id: record.id,
        bookId: record.bookId,
        type: 'qa',
        timestamp: record.createdAt,
        scores: {
          accuracy: avgScore, // 简化：使用平均分作为各维度分数
          completeness: avgScore,
          clarity: avgScore,
          overall: avgScore
        },
        passed: true
      }
    })
  }

  const progressRecords = getProgressRecords()

  const hasAnsweredAll = currentRecord ? isQAPracticeRecordComplete(currentRecord) : false
  
  // 检查是否所有未通过的问题都有回答（至少有内容）
  const allUnansweredQuestionsHaveAnswers = currentRecord
    ? haveAnswersForUnpassedQuestions(currentRecord.questions, answers)
    : false
  
  const canSubmit = currentRecord && allUnansweredQuestionsHaveAnswers

  return (
    <div className="space-y-6">
      {/* 进步追踪图 */}
      {progressRecords.length > 0 && (
        <details className="card overflow-hidden" onToggle={event => setShowProgress(event.currentTarget.open)}>
          <summary className="cursor-pointer flex items-center justify-between p-2 hover:bg-[var(--bg-secondary)] rounded-lg transition-colors">
            <h3 className="flex items-center gap-2 font-semibold">
              <AppIcon name="trendUp" tone="green" size={17} />{lang === 'zh' ? '进步追踪' : 'Progress Tracking'}
            </h3>
            <AppIcon name="chevronDown" tone="muted" size={18} className={`transition-transform duration-200 ${showProgress ? 'rotate-180' : ''}`} />
          </summary>
          <div className="border-t border-[var(--border)] p-4">
            <ScoreTrendChart records={progressRecords} lang={lang} compact={false} embedded />
          </div>
        </details>
      )}

      {/* 评分标准 */}
      <details className="card overflow-hidden" onToggle={event => setShowCriteria(event.currentTarget.open)}>
        <summary className="cursor-pointer flex items-center justify-between p-2 hover:bg-[var(--bg-secondary)] rounded-lg transition-colors">
          <h3 className="flex items-center gap-2 font-semibold">
            <AppIcon name="chart" tone="blue" size={17} />{lang === 'zh' ? '评分标准' : 'Scoring Criteria'}
          </h3>
          <AppIcon name="chevronDown" tone="muted" size={18} className={`transition-transform duration-200 ${showCriteria ? 'rotate-180' : ''}`} />
        </summary>
        <div className="border-t border-[var(--border)] p-4">
          <ScoringCriteriaDisplay lang={lang} compact={false} embedded />
        </div>
      </details>

      {/* 问答输入区域 */}
      <div className="card">
        <h3 className="flex items-center gap-2 text-xl font-bold mb-2">
          <AppIcon name="message" tone="green" size={22} />{lang === 'zh' ? '角色问答' : 'Role-based Q&A'}
        </h3>
        <p className="text-sm text-[var(--text-secondary)] mb-4">
          {lang === 'zh'
            ? 'AI 会分析你的教学实践内容，找出其中的漏洞和不足，然后从不同角色的视角提出针对性的问题'
            : 'AI will analyze your teaching content, find gaps, and ask targeted questions from different perspectives'}
        </p>

        {errorMessage && (
          <div role="alert" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">
            <span>{errorMessage}</span>
            {(errorMessage.includes(lang === 'zh' ? '设置' : 'Settings') || errorMessage.includes('TokenDance')) && onOpenSettings && (
              <button onClick={onOpenSettings} className="btn-secondary text-sm py-2">
                {lang === 'zh' ? '前往设置' : 'Open Settings'}
              </button>
            )}
          </div>
        )}

        {loading ? (
          <LoadingQuotes lang={lang} quotes={quotes} />
        ) : !currentRecord ? (
          <div className="text-center py-8">
            <AppIcon name="users" tone="violet" size={48} className="mx-auto mb-4" />

            {/* 角色选择器 */}
            {hasPassedTeaching && (
              <div className="mb-6">
                <PersonaSelector
                  lang={lang}
                  selectedIds={selectedPersonaIds}
                  onSelectionChange={setSelectedPersonaIds}
                  maxSelect={PERSONA_QUESTION_COUNT}
                  compact={false}
                />
              </div>
            )}

            {hasPassedTeaching ? (
              <>
                <p className="text-[var(--text-secondary)] mb-4">
                  {lang === 'zh'
                    ? selectedPersonaIds.length > 0
                      ? `已选择 ${selectedPersonaIds.length} 个角色，AI 将从这些角色的视角提出问题`
                      : 'AI 将基于你的教学实践内容，从不同角色的视角提出问题，帮助你发现理解中的漏洞和盲点'
                    : 'AI will ask questions based on your teaching content from different perspectives'}
                </p>
                <button
                  onClick={handleGenerateQuestions}
                  disabled={loading}
                  className="btn-primary"
                >
                  {lang === 'zh' ? '生成问题' : 'Generate Questions'}
                </button>
              </>
            ) : (
              <>
                <p className="mb-4 flex items-center justify-center gap-2 text-amber-700 dark:text-amber-400">
                  <AppIcon name="alert" size={17} />{lang === 'zh'
                    ? '请先完成并通过教学模拟（60 分及以上），AI 会基于合格的教学内容生成问题'
                    : 'Pass the teaching simulation with 60 or above first'}
                </p>
                <button
                  disabled
                  className="btn-primary opacity-50 cursor-not-allowed"
                >
                  {lang === 'zh' ? '生成问题' : 'Generate Questions'}
                </button>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {/* 进度提示 */}
            <div className="flex items-center justify-between p-3 bg-[var(--bg-secondary)] rounded-lg">
              <div className="flex items-center gap-2">
                <span className="text-sm">
                  {lang === 'zh' ? '进度：' : 'Progress: '}
                  {currentRecord.questions.filter(q => q.passed).length} / {currentRecord.questions.length}
                </span>
              {isQAPracticeRecordComplete(currentRecord) && (
                  <span className="flex items-center gap-1 text-sm text-emerald-600 dark:text-emerald-400"><AppIcon name="success" size={14} />{lang === 'zh' ? '全部通过' : 'All Passed'}</span>
                )}
              </div>
              <button
                onClick={handleGenerateQuestions}
                disabled={loading}
                className="btn-secondary text-sm"
              >
                {lang === 'zh' ? '重新生成问题' : 'Regenerate'}
              </button>
            </div>

            {/* 问题列表 */}
            {currentRecord.questions.map((q, idx) => (
              <div key={idx} className="bg-[var(--bg-secondary)] rounded-xl p-4">
                <div className="flex items-start gap-3 mb-3">
                  <AppIcon name={PERSONA_ICONS[idx] || 'help'} tone={idx % 3 === 0 ? 'blue' : idx % 3 === 1 ? 'violet' : 'amber'} size={24} />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium">{q.personaName}</span>
                      {q.passed && <span className="flex items-center gap-1 text-sm text-emerald-600 dark:text-emerald-400"><AppIcon name="success" size={14} />{lang === 'zh' ? '已通过' : 'Passed'}</span>}
                      {q.score !== undefined && !q.passed && <span className="text-yellow-400 text-sm">{q.score}分</span>}
                    </div>
                    <p className="text-sm mb-3">{q.question}</p>
                    <SourceEvidence content={q.question} documentContent={book.documentContent} lang={lang} />
                    
                    {q.userAnswer && q.aiReview && !q.passed && (
                      <div className="mt-3 border border-yellow-500/30 bg-yellow-500/10 rounded-lg p-3 text-sm">
                        <p className="font-medium text-yellow-300 mb-2">
                          {lang === 'zh' ? `本次回答未通过（${q.score} 分）` : `This answer did not pass (${q.score} points)`}
                        </p>
                        <p className="text-xs text-[var(--text-secondary)] mb-1">
                          {lang === 'zh' ? '你的回答：' : 'Your answer:'}
                        </p>
                        <p className="mb-3 whitespace-pre-wrap">{q.userAnswer}</p>
                        <p className="text-xs text-[var(--text-secondary)] mb-1">
                          {lang === 'zh' ? 'AI 改进建议：' : 'AI improvement advice:'}
                        </p>
                        <MarkdownRenderer content={q.aiReview} />
                        <SourceEvidence content={q.aiReview} documentContent={book.documentContent} lang={lang} />
                      </div>
                    )}

                    {!q.passed && (
                      <>
                        <textarea
                          value={answers[idx] || q.userAnswer || ''}
                          onChange={e => setAnswers(prev => ({ ...prev, [idx]: e.target.value }))}
                          maxLength={MAX_AI_ANSWER_LENGTH}
                          placeholder={lang === 'zh' ? '根据点评重新回答...' : 'Revise your answer using the feedback...'}
                          className="input-field min-h-[100px] resize-y text-sm mt-3"
                        />
                        <p className="mt-1 text-right text-xs text-[var(--text-secondary)]">
                          {(answers[idx] || q.userAnswer || '').length.toLocaleString()} / {MAX_AI_ANSWER_LENGTH.toLocaleString()}
                        </p>
                      </>
                    )}

                    {q.userAnswer && q.aiReview && q.passed && (
                      <div className="mt-3 p-3 bg-[var(--bg-card)] rounded text-sm">
                        <p className="text-xs text-[var(--text-secondary)] mb-1">
                          {lang === 'zh' ? 'AI 点评：' : 'AI Review:'}
                        </p>
                        <MarkdownRenderer content={q.aiReview} />
                        <SourceEvidence content={q.aiReview} documentContent={book.documentContent} lang={lang} />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {/* 提交按钮 */}
            {!hasAnsweredAll && (
              <div className="space-y-3">
                {!canSubmit && (
                  <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
                    <p className="flex items-start gap-2 text-blue-700 dark:text-blue-300 text-sm">
                      <AppIcon name="lightbulb" tone="amber" size={16} className="mt-0.5" />{lang === 'zh'
                        ? '请先回答所有未通过的问题，至少写一些思考内容，才能提交给 AI 评估' 
                        : 'Please answer all unanswered questions before submitting'}
                    </p>
                  </div>
                )}
                <button
                  onClick={handleSubmitAnswers}
                  disabled={!canSubmit || loading}
                  className="w-full btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {lang === 'zh' ? '提交答案' : 'Submit Answers'}
                </button>
              </div>
            )}
            
            {hasAnsweredAll && (
              <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4 text-center">
                <AppIcon name="sparkles" tone="green" size={38} className="mx-auto mb-2" />
                <p className="text-green-300 font-semibold">
                  {lang === 'zh' ? '恭喜！所有问题都已通过' : 'Congratulations! All questions passed'}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 问答记录 - 默认折叠 */}
      {qaRecords.length > 0 && (
        <div className="card" ref={historyRef}>
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="w-full flex items-center justify-between p-2 hover:bg-[var(--bg-secondary)] rounded-lg transition-colors"
          >
            <h3 className="flex items-center gap-2 font-semibold"><AppIcon name="chart" tone="blue" size={18} />{lang === 'zh' ? '问答记录' : 'Q&A History'} ({qaRecords.length})</h3>
            <AppIcon name="chevronDown" tone="muted" size={18} className={`transition-transform duration-200 ${showHistory ? 'rotate-180' : ''}`} />
          </button>
          
          {showHistory && (
            <div className="mt-4 space-y-4 animate-fade-in">
              {qaRecords.slice().reverse().map(record => (
                <div key={record.id} className="bg-[var(--bg-secondary)] rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <span className="text-sm">
                        {lang === 'zh' ? '通过：' : 'Passed: '}
                        {record.questions.filter(q => q.passed).length} / {record.questions.length}
                      </span>
                      {isQAPracticeRecordComplete(record) && (
                        <span className="status-badge status-finished">
                          {lang === 'zh' ? '全部通过' : 'All Passed'}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-[var(--text-secondary)]">
                        {new Date(record.createdAt).toLocaleString()}
                      </span>
                      <span className="text-xs text-[var(--text-secondary)]">
                        {lang === 'zh' ? '会话' : 'Session'} {record.sessionId?.slice(-6)}
                      </span>
                      <button
                        onClick={() => handleDeleteRecord(record.id)}
                        disabled={deletingRecordIds.has(record.id)}
                        className="text-red-400 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {deletingRecordIds.has(record.id)
                          ? (lang === 'zh' ? '删除中...' : 'Deleting...')
                          : (lang === 'zh' ? '删除' : 'Delete')}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-3">
                    {record.questions.map((q, idx) => (
                      <div key={idx} className={`rounded p-3 text-sm ${q.score !== undefined && !q.passed ? 'border border-yellow-500/30 bg-yellow-500/10' : 'bg-[var(--bg-card)]'}`}>
                        <div className="flex items-center gap-2 mb-2">
                          <span className="font-medium">{q.personaName}</span>
                          {q.passed && <AppIcon name="success" tone="green" size={15} />}
                          {q.score !== undefined && <span className={q.passed ? 'text-green-400' : 'text-yellow-400'}>{q.score}分</span>}
                          {q.score !== undefined && !q.passed && (
                            <span className="text-yellow-300">{lang === 'zh' ? '未通过' : 'Not passed'}</span>
                          )}
                        </div>
                        <p className="text-[var(--text-secondary)] mb-2">{q.question}</p>
                        <SourceEvidence content={q.question} documentContent={book.documentContent} lang={lang} />
                        {getQuestionAttempts(q).map((attempt, attemptIndex) => (
                          <div key={attemptIndex} className="mt-3 border-t border-[var(--border)] pt-3 first:mt-0 first:border-t-0 first:pt-0">
                            <div className="mb-2 flex items-center justify-between gap-3 text-xs text-[var(--text-secondary)]">
                              <span>{lang === 'zh' ? `第 ${attemptIndex + 1} 次回答` : `Attempt ${attemptIndex + 1}`}</span>
                              <span className={attempt.passed ? 'text-green-400' : 'text-yellow-400'}>
                                {attempt.score} {lang === 'zh' ? '分' : 'pts'} · {attempt.passed ? (lang === 'zh' ? '通过' : 'Passed') : (lang === 'zh' ? '未通过' : 'Not passed')}
                              </span>
                            </div>
                            <p className="text-xs text-[var(--text-secondary)] mb-1">{lang === 'zh' ? '你的回答：' : 'Your answer:'}</p>
                            <p className="mb-3 whitespace-pre-wrap">{attempt.userAnswer}</p>
                            <p className="text-xs text-[var(--text-secondary)] mb-1">
                              {attempt.passed ? (lang === 'zh' ? 'AI 点评：' : 'AI Review:') : (lang === 'zh' ? 'AI 改进建议：' : 'AI improvement advice:')}
                            </p>
                            <MarkdownRenderer content={attempt.aiReview} />
                            <SourceEvidence content={attempt.aiReview} documentContent={book.documentContent} lang={lang} />
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
