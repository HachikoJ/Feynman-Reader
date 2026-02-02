'use client'

import { useState, useEffect } from 'react'
import { Language, t } from '@/lib/i18n'
import { logger } from '@/lib/logger'
import { Book, QAPracticeRecord, getQAPracticeRecords, addQAPracticeRecord, updateQAPracticeRecord, deleteQAPracticeRecord, updateBook } from '@/lib/store'
import { createDeepSeekClient, generatePersonaQuestions, evaluatePersonaAnswers } from '@/lib/deepseek'
import MarkdownRenderer from './MarkdownRenderer'
import LoadingQuotes from './LoadingQuotes'
import PersonaSelector, { PersonaBadge } from './PersonaSelector'
import ScoreTrendChart from './ScoreTrendChart'
import ScoringCriteriaDisplay from './ScoringCriteriaDisplay'
import { calculateScoreTrend, ProgressRecord, PERSONA_TYPES } from '@/lib/practiceEnhancement'

interface Props {
  book: Book
  apiKey: string
  lang: Language
  quotes?: { text: string; author: string }[]
  onBookUpdate?: () => void
  showHistory?: boolean
  onShowHistoryChange?: (show: boolean) => void
  historyRef?: React.RefObject<HTMLDivElement>
}

export default function QAPractice({ book, apiKey, lang, quotes = [], onBookUpdate, showHistory: externalShowHistory, onShowHistoryChange, historyRef }: Props) {
  const [currentRecord, setCurrentRecord] = useState<QAPracticeRecord | null>(null)
  const [qaRecords, setQaRecords] = useState<QAPracticeRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [answers, setAnswers] = useState<Record<number, string>>({})
  const [internalShowHistory, setInternalShowHistory] = useState(false)

  // 新增状态：角色选择、评分标准显示、进步追踪
  const [selectedPersonaIds, setSelectedPersonaIds] = useState<string[]>([])
  const [showCriteria, setShowCriteria] = useState(false)
  const [showProgress, setShowProgress] = useState(false)
  
  // 使用外部控制的showHistory，如果没有则使用内部状态
  const showHistory = externalShowHistory !== undefined ? externalShowHistory : internalShowHistory
  const setShowHistory = onShowHistoryChange || setInternalShowHistory

  useEffect(() => {
    const records = getQAPracticeRecords(book.id)
    setQaRecords(records)
  }, [book.id])

  // 生成新问题
  const handleGenerateQuestions = async () => {
    if (!apiKey) return

    // 开始问答时，如果还是未读状态，改为在读
    if (book.status === 'unread') {
      updateBook(book.id, { status: 'reading' })
      if (onBookUpdate) {
        onBookUpdate()
      }
    }

    setLoading(true)
    try {
      const client = await createDeepSeekClient(apiKey)

      // 获取最高分的教学实践内容
      let bestTeachingContent: string | undefined
      if (book.practiceRecords && book.practiceRecords.length > 0) {
        const bestRecord = book.practiceRecords.reduce((best, current) =>
          current.scores.overall > best.scores.overall ? current : best
        )
        bestTeachingContent = bestRecord.content
      }

      // 使用用户选择的角色，如果没有则使用默认角色
      let personasToUse = selectedPersonaIds
      if (personasToUse.length === 0) {
        // 默认使用3个不同类型的角色
        personasToUse = ['elementary', 'professional', 'scientist']
      }

      // 获取角色详细信息
      const selectedPersonas = PERSONA_TYPES.filter(p => personasToUse.includes(p.id))

      const questions = await generatePersonaQuestions(
        client,
        book.name,
        book.author,
        book.documentContent,
        bestTeachingContent,
        selectedPersonas
      )

      if (questions.length > 0) {
        const newRecord: QAPracticeRecord = {
          id: '',
          bookId: book.id,
          questions: questions.map(q => ({
            persona: q.persona as any,
            personaName: q.personaName,
            question: q.question
          })),
          allPassed: false,
          createdAt: 0,
          updatedAt: 0
        }

        const savedRecord = addQAPracticeRecord(book.id, newRecord)
        setCurrentRecord(savedRecord)
        setQaRecords(getQAPracticeRecords(book.id))
        setAnswers({})

        if (onBookUpdate) {
          onBookUpdate()
        }
      }
    } catch (error) {
      logger.error('生成问题失败:', error)
    } finally {
      setLoading(false)
    }
  }

  // 提交答案
  const handleSubmitAnswers = async () => {
    if (!currentRecord || !apiKey) return
    
    setLoading(true)
    try {
      const client = await createDeepSeekClient(apiKey)
      
      // 评估所有未通过且有新答案的问题
      const questionsToEvaluate = currentRecord.questions
        .map((q, i) => ({ ...q, index: i }))
        .filter(q => !q.passed && answers[q.index]?.trim()) // 只评估未通过且有新答案的
        .map(q => ({
          persona: q.persona,
          personaName: q.personaName,
          question: q.question,
          answer: answers[q.index]
        }))
      
      if (questionsToEvaluate.length === 0) return
      
      const evaluations = await evaluatePersonaAnswers(client, book.name, questionsToEvaluate, book.documentContent)
      
      // 更新记录
      const updatedQuestions = [...currentRecord.questions]
      questionsToEvaluate.forEach((q, i) => {
        const evaluation = evaluations[i]
        if (evaluation) {
          const originalIndex = currentRecord.questions.findIndex(
            oq => oq.persona === q.persona && oq.question === q.question
          )
          if (originalIndex !== -1) {
            // 客户端自己计算 passed，不信任 AI 返回的值
            const passed = evaluation.score >= 60
            
            updatedQuestions[originalIndex] = {
              ...updatedQuestions[originalIndex],
              userAnswer: q.answer,
              answeredAt: Date.now(),
              aiReview: evaluation.review,
              score: evaluation.score,
              passed: passed,
              reviewedAt: Date.now()
            }
          }
        }
      })
      
      const allPassed = updatedQuestions.every(q => q.passed)
      
      updateQAPracticeRecord(book.id, currentRecord.id, {
        questions: updatedQuestions,
        allPassed
      })
      
      const updatedRecord = getQAPracticeRecords(book.id).find(r => r.id === currentRecord.id)
      if (updatedRecord) {
        setCurrentRecord(updatedRecord)
      }
      setQaRecords(getQAPracticeRecords(book.id))
      setAnswers({}) // 清空输入
      
      if (onBookUpdate) {
        onBookUpdate()
      }
      
    } catch (error) {
      logger.error('评估失败:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteRecord = (recordId: string) => {
    deleteQAPracticeRecord(book.id, recordId)
    setQaRecords(getQAPracticeRecords(book.id))
    if (currentRecord?.id === recordId) {
      setCurrentRecord(null)
    }
    if (onBookUpdate) {
      onBookUpdate()
    }
  }

  // 将 QA 记录转换为进度记录，用于趋势图
  const getProgressRecords = (): ProgressRecord[] => {
    return qaRecords.map(record => {
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
        passed: record.allPassed
      }
    })
  }

  const progressRecords = getProgressRecords()

  const hasAnsweredAll = currentRecord?.questions.every(q => q.passed) || false
  
  // 检查是否所有未通过的问题都有回答（至少有内容）
  const allUnansweredQuestionsHaveAnswers = currentRecord 
    ? currentRecord.questions
        .filter(q => !q.passed) // 只检查未通过的问题
        .every((q, idx) => {
          const answer = answers[idx] || q.userAnswer || ''
          return answer.trim().length > 0 // 必须有内容
        })
    : false
  
  const canSubmit = currentRecord && allUnansweredQuestionsHaveAnswers

  return (
    <div className="space-y-6">
      {/* 进步追踪图 */}
      {progressRecords.length > 0 && (
        <details>
          <summary className="cursor-pointer card flex items-center justify-between p-4 hover:bg-[var(--bg-secondary)] rounded-xl transition-colors">
            <h3 className="font-semibold">
              📈 {lang === 'zh' ? '进步追踪' : 'Progress Tracking'}
            </h3>
            <span className="text-sm text-[var(--text-secondary)]">
              {showProgress ? (lang === 'zh' ? '收起' : 'Hide') : (lang === 'zh' ? '展开' : 'Expand')}
            </span>
          </summary>
          <div className="mt-4">
            <ScoreTrendChart records={progressRecords} lang={lang} compact={false} />
          </div>
        </details>
      )}

      {/* 评分标准 */}
      <details>
        <summary className="cursor-pointer card flex items-center justify-between p-4 hover:bg-[var(--bg-secondary)] rounded-xl transition-colors">
          <h3 className="font-semibold">
            📊 {lang === 'zh' ? '评分标准' : 'Scoring Criteria'}
          </h3>
          <span className="text-sm text-[var(--text-secondary)]">
            {showCriteria ? (lang === 'zh' ? '收起' : 'Hide') : (lang === 'zh' ? '查看详情' : 'View Details')}
          </span>
        </summary>
        <div className="mt-4">
          <ScoringCriteriaDisplay lang={lang} compact={false} />
        </div>
      </details>

      {/* 问答输入区域 */}
      <div className="card">
        <h3 className="text-xl font-bold mb-2">
          {lang === 'zh' ? '💬 角色问答' : '💬 Role-based Q&A'}
        </h3>
        <p className="text-sm text-[var(--text-secondary)] mb-4">
          {lang === 'zh'
            ? 'AI 会分析你的教学实践内容，找出其中的漏洞和不足，然后从不同角色的视角提出针对性的问题'
            : 'AI will analyze your teaching content, find gaps, and ask targeted questions from different perspectives'}
        </p>

        {loading ? (
          <LoadingQuotes lang={lang} quotes={quotes} />
        ) : !currentRecord ? (
          <div className="text-center py-8">
            <div className="text-5xl mb-4">🎭</div>

            {/* 角色选择器 */}
            {book.practiceRecords && book.practiceRecords.length > 0 && (
              <div className="mb-6">
                <PersonaSelector
                  lang={lang}
                  selectedIds={selectedPersonaIds}
                  onSelectionChange={setSelectedPersonaIds}
                  maxSelect={5}
                  compact={false}
                />
              </div>
            )}

            {book.practiceRecords && book.practiceRecords.length > 0 ? (
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
                  className="btn-primary"
                >
                  {lang === 'zh' ? '生成问题' : 'Generate Questions'}
                </button>
              </>
            ) : (
              <>
                <p className="text-yellow-400 mb-4">
                  {lang === 'zh'
                    ? '⚠️ 请先完成教学模拟，AI 会基于你的教学内容生成针对性的问题'
                    : '⚠️ Please complete teaching simulation first'}
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
                {currentRecord.allPassed && (
                  <span className="text-green-400 text-sm">✓ {lang === 'zh' ? '全部通过' : 'All Passed'}</span>
                )}
              </div>
              <button 
                onClick={handleGenerateQuestions}
                className="btn-secondary text-sm"
              >
                {lang === 'zh' ? '重新生成问题' : 'Regenerate'}
              </button>
            </div>

            {/* 问题列表 */}
            {currentRecord.questions.map((q, idx) => (
              <div key={idx} className="bg-[var(--bg-secondary)] rounded-xl p-4">
                <div className="flex items-start gap-3 mb-3">
                  <span className="text-2xl">{['🧒', '🎓', '💼', '🔬', '💰', '👨‍🏫', '💸', '👤', '🏢', '🔍'][idx] || '❓'}</span>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium">{q.personaName}</span>
                      {q.passed && <span className="text-green-400 text-sm">✓ {lang === 'zh' ? '已通过' : 'Passed'}</span>}
                      {q.score !== undefined && !q.passed && <span className="text-yellow-400 text-sm">{q.score}分</span>}
                    </div>
                    <p className="text-sm mb-3">{q.question}</p>
                    
                    {!q.passed && (
                      <textarea
                        value={answers[idx] || q.userAnswer || ''}
                        onChange={e => setAnswers(prev => ({ ...prev, [idx]: e.target.value }))}
                        placeholder={lang === 'zh' ? '输入你的回答...' : 'Your answer...'}
                        className="input-field min-h-[100px] resize-y text-sm"
                      />
                    )}
                    
                    {q.userAnswer && q.aiReview && (
                      <details className="mt-3">
                        <summary className="cursor-pointer text-sm text-[var(--accent)]">
                          {lang === 'zh' ? '查看点评' : 'View Review'}
                        </summary>
                        <div className="mt-2 p-3 bg-[var(--bg-card)] rounded text-sm">
                          <MarkdownRenderer content={q.aiReview} />
                        </div>
                      </details>
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
                    <p className="text-blue-300 text-sm">
                      💡 {lang === 'zh' 
                        ? '请先回答所有未通过的问题，至少写一些思考内容，才能提交给 AI 评估' 
                        : 'Please answer all unanswered questions before submitting'}
                    </p>
                  </div>
                )}
                <button
                  onClick={handleSubmitAnswers}
                  disabled={!canSubmit}
                  className="w-full btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {lang === 'zh' ? '提交答案' : 'Submit Answers'}
                </button>
              </div>
            )}
            
            {hasAnsweredAll && (
              <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4 text-center">
                <div className="text-4xl mb-2">🎉</div>
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
            <h3 className="font-semibold">📊 {lang === 'zh' ? '问答记录' : 'Q&A History'} ({qaRecords.length})</h3>
            <span className={`text-sm text-[var(--text-secondary)] transition-transform duration-200 ${showHistory ? 'rotate-180' : ''}`}>
              ▼
            </span>
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
                      {record.allPassed && (
                        <span className="status-badge status-finished">
                          {lang === 'zh' ? '全部通过' : 'All Passed'}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-[var(--text-secondary)]">
                        {new Date(record.createdAt).toLocaleString()}
                      </span>
                      <button onClick={() => handleDeleteRecord(record.id)} className="text-red-400 text-sm">
                        {lang === 'zh' ? '删除' : 'Delete'}
                      </button>
                    </div>
                  </div>
                  <details>
                    <summary className="cursor-pointer text-sm text-[var(--accent)]">
                      {lang === 'zh' ? '查看详情' : 'View details'}
                    </summary>
                    <div className="mt-3 space-y-3">
                      {record.questions.map((q, idx) => (
                        <div key={idx} className="bg-[var(--bg-card)] rounded p-3 text-sm">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="font-medium">{q.personaName}</span>
                            {q.passed && <span className="text-green-400">✓</span>}
                            {q.score !== undefined && <span className={q.passed ? 'text-green-400' : 'text-yellow-400'}>{q.score}分</span>}
                          </div>
                          <p className="text-[var(--text-secondary)] mb-2">{q.question}</p>
                          {q.userAnswer && (
                            <>
                              <p className="text-xs text-[var(--text-secondary)] mb-1">{lang === 'zh' ? '回答：' : 'Answer:'}</p>
                              <p className="mb-2">{q.userAnswer}</p>
                            </>
                          )}
                          {q.aiReview && (
                            <>
                              <p className="text-xs text-[var(--text-secondary)] mb-1">{lang === 'zh' ? 'AI 点评：' : 'AI Review:'}</p>
                              <MarkdownRenderer content={q.aiReview} />
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  </details>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
