'use client'

import { useState, useEffect, useRef } from 'react'
import OpenAI from 'openai'
import { logger } from '@/lib/logger'
import { Book, NoteRecord, updateBook, addPracticeRecord, deletePracticeRecord, checkFeynmanComplete, getBook } from '@/lib/store'
import { Language, t } from '@/lib/i18n'
import { LEARNING_PHASES, generateSystemPrompt, generatePhasePrompt, generateReviewPrompt } from '@/lib/feynman-prompts'
import { createDeepSeekClient, chat } from '@/lib/deepseek'
import LoadingQuotes from './LoadingQuotes'
import PhaseResult from './PhaseResult'
import QAPractice from './QAPractice'
import MarkdownRenderer from './MarkdownRenderer'
import BookRecommendations from './BookRecommendations'

interface Props {
  book: Book
  apiKey: string
  lang: Language
  quotes?: { text: string; author: string }[]
  onBack: () => void
}

type TabType = 'phase' | 'practice' | 'notes' | 'recommendations'

export default function ReadingView({ book: initialBook, apiKey, lang, quotes = [], onBack }: Props) {
  const [book, setBook] = useState(initialBook)
  const [activeTab, setActiveTab] = useState<TabType>('phase')
  // 如果有分析结果，默认显示第一个阶段（索引0），否则显示当前进度
  const [currentPhase, setCurrentPhase] = useState(
    Object.keys(initialBook.responses || {}).length > 0 ? 0 : initialBook.currentPhase
  )
  const [responses, setResponses] = useState<Record<string, string>>(initialBook.responses || {})
  const [loading, setLoading] = useState(false)
  const [analyzingInBackground, setAnalyzingInBackground] = useState(false)
  const [client, setClient] = useState<OpenAI | null>(null)
  const [teachingNote, setTeachingNote] = useState('')
  const [noteRecords, setNoteRecords] = useState<NoteRecord[]>(initialBook.noteRecords || [])
  const [newNote, setNewNote] = useState('')
  const [recommendations, setRecommendations] = useState<string>(initialBook.recommendations || '')
  const [loadingRecommendations, setLoadingRecommendations] = useState(false)
  const [showPracticeHistory, setShowPracticeHistory] = useState(false)
  const [qaShowHistory, setQaShowHistory] = useState(false)
  
  // 用于滚动定位的ref
  const practiceHistoryRef = useRef<HTMLDivElement>(null)
  const qaHistoryRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (apiKey) {
      createDeepSeekClient(apiKey).then(setClient)
    }
  }, [apiKey])

  // 确保打开书籍时页面滚动到顶部
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [book.id])

  const saveProgress = (updates: Partial<Book>) => {
    updateBook(book.id, updates)
    setBook(prev => ({ ...prev, ...updates }))
  }

  const handleAnalyzeAll = async () => {
    if (!client) return
    setLoading(true)
    setAnalyzingInBackground(true)
    
    // 第一次开始学习时，将状态改为"在读"
    if (book.status === 'unread') {
      saveProgress({ status: 'reading' })
    }
    
    const systemPrompt = generateSystemPrompt(book.name, lang)
    const newResponses: Record<string, string> = { ...responses }
    
    // 后台依次分析所有阶段
    ;(async () => {
      for (let i = 0; i < LEARNING_PHASES.length; i++) {
        const phase = LEARNING_PHASES[i]
        
        // 如果已经有结果了，跳过
        if (newResponses[phase.id]) continue
        
        try {
          const prompt = generatePhasePrompt(book.name, phase.id, lang)
          const response = await chat(client, systemPrompt, prompt, book.documentContent)
          newResponses[phase.id] = response
          
          // 实时更新
          setResponses({ ...newResponses })
          saveProgress({ responses: { ...newResponses } })
        } catch (error) {
          const errorMsg = lang === 'zh' ? '请求失败，请检查 API Key' : 'Request failed'
          newResponses[phase.id] = errorMsg
        }
      }
      
      // 分析完成后，停留在第一个阶段（索引0），等用户手动完成
      setCurrentPhase(0)
      setLoading(false)
      setAnalyzingInBackground(false)
    })()
  }

  const handlePhaseChange = (idx: number) => {
    setCurrentPhase(idx)
  }

  const handleCompletePhase = () => {
    // 标记当前查看的阶段为已完成，更新进度
    if (currentPhase >= book.currentPhase) {
      const newProgress = currentPhase + 1
      saveProgress({ currentPhase: newProgress })
    }
    
    // 如果完成了所有阶段，跳转到实践
    if (currentPhase === LEARNING_PHASES.length - 1) {
      setActiveTab('practice')
    } else {
      // 否则跳转到下一个阶段
      setCurrentPhase(currentPhase + 1)
    }
  }

  const handleSubmitPractice = async () => {
    if (!client || teachingNote.length < 200) return
    setLoading(true)
    
    // 开始实践时，如果还是未读状态，改为在读
    if (book.status === 'unread') {
      saveProgress({ status: 'reading' })
    }
    
    try {
      const prompt = generateReviewPrompt(book.name, teachingNote, lang)
      const systemPrompt = generateSystemPrompt(book.name, lang)
      const response = await chat(client, systemPrompt, prompt, book.documentContent)
      
      let result
      try {
        const jsonMatch = response.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
          result = JSON.parse(jsonMatch[0])
        } else {
          throw new Error('No JSON')
        }
      } catch {
        result = {
          scores: { accuracy: 60, completeness: 60, clarity: 60, overall: 60 },
          review: response,
          passed: false
        }
      }
      
      // 客户端自己计算 passed，不信任 AI 返回的值
      const passed = result.scores.overall >= 60
      
      // addPracticeRecord 会自动检查并更新状态
      addPracticeRecord(book.id, {
        content: teachingNote,
        aiReview: result.review,
        scores: result.scores,
        passed: passed
      })
      
      // 重新获取更新后的 book 数据
      const updatedBook = getBook(book.id)
      if (updatedBook) {
        setBook(updatedBook)
      }
      
      setTeachingNote('')
    } catch (error) {
      logger.error('Practice failed:', error)
    }
    setLoading(false)
  }

  const handleDeleteRecord = (recordId: string) => {
    // deletePracticeRecord 会自动检查并更新状态
    deletePracticeRecord(book.id, recordId)
    
    // 重新获取更新后的 book 数据
    const updatedBook = getBook(book.id)
    if (updatedBook) {
      setBook(updatedBook)
    }
  }

  const handleSaveNote = () => {
    if (!newNote.trim()) return
    const newRecord: NoteRecord = {
      id: Date.now().toString(),
      type: 'note',
      content: newNote.trim(),
      phaseId: LEARNING_PHASES[currentPhase]?.id,
      createdAt: Date.now()
    }
    const updatedRecords = [...noteRecords, newRecord]
    setNoteRecords(updatedRecords)
    saveProgress({ noteRecords: updatedRecords })
    setNewNote('')
  }

  const handleDeleteNote = (noteId: string) => {
    const updatedRecords = noteRecords.filter(n => n.id !== noteId)
    setNoteRecords(updatedRecords)
    saveProgress({ noteRecords: updatedRecords })
  }

  const handleBookUpdate = () => {
    // 重新获取 book 数据以更新状态
    const updatedBook = getBook(book.id)
    if (updatedBook) {
      setBook(updatedBook)
    }
  }
  
  // 点击教学模拟卡片，跳转并展开记录
  const handleTeachingCardClick = () => {
    if (practiceRecords.length > 0) {
      setShowPracticeHistory(true)
      setTimeout(() => {
        practiceHistoryRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }, 100)
    }
  }
  
  // 点击角色问答卡片，跳转并展开记录
  const handleQACardClick = () => {
    if (book.qaPracticeRecords && book.qaPracticeRecords.length > 0) {
      setQaShowHistory(true)
      setTimeout(() => {
        qaHistoryRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }, 100)
    }
  }

  const phase = LEARNING_PHASES[currentPhase]
  const phaseResponse = phase ? responses[phase.id] : null
  const practiceRecords = book.practiceRecords || []
  const hasPassed = practiceRecords.some(r => r.passed)
  const qaPassed = book.qaPracticeRecords && book.qaPracticeRecords.length > 0
    ? book.qaPracticeRecords.some(r => r.allPassed)
    : false
  const shouldBeFinished = hasPassed && qaPassed

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-[var(--text-secondary)] text-sm">{t(lang, 'reading.currentBook')}</p>
          <h1 className="text-2xl font-bold">《{book.name}》</h1>
          {book.bestScore > 0 && (
            <p className="text-sm mt-1">
              <span className="text-[var(--text-secondary)]">{t(lang, 'practice.bestScore')}: </span>
              <span className={book.bestScore >= 60 ? 'text-green-400' : 'text-yellow-400'}>{book.bestScore}分</span>
              {hasPassed && <span className="ml-2 text-green-400">✓ {t(lang, 'practice.passed')}</span>}
            </p>
          )}
        </div>
        <button onClick={onBack} className="btn-secondary text-sm py-2">← {t(lang, 'reading.changeBook')}</button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 p-1 bg-[var(--bg-secondary)] rounded-xl">
        {[
          { key: 'phase' as TabType, label: lang === 'zh' ? '阶段学习' : 'Learning', icon: '📚' },
          { key: 'practice' as TabType, label: lang === 'zh' ? '费曼实践' : 'Practice', icon: '✍️' },
          { key: 'notes' as TabType, label: lang === 'zh' ? '我的笔记' : 'Notes', icon: '📝' },
          { key: 'recommendations' as TabType, label: lang === 'zh' ? '相关推荐' : 'Recommendations', icon: '📖' }
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg transition-all ${
              activeTab === tab.key 
                ? 'bg-[var(--accent)] text-white' 
                : 'hover:bg-[var(--bg-card)]'
            }`}
          >
            <span>{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Phase Tab */}
      {activeTab === 'phase' && (
        <div className="animate-fade-in">
          {/* 如果还没开始分析，显示开始按钮 */}
          {Object.keys(responses).length === 0 && !loading && (
            <div className="card text-center py-16">
              <div className="text-6xl mb-4">📚</div>
              <h3 className="text-xl font-bold mb-2">
                {lang === 'zh' ? '开始深度学习' : 'Start Deep Learning'}
              </h3>
              <p className="text-[var(--text-secondary)] mb-6">
                {lang === 'zh' 
                  ? 'AI 将从6个维度深度分析这本书，帮助你全面理解' 
                  : 'AI will analyze this book from 6 dimensions'}
              </p>
              <button
                onClick={handleAnalyzeAll}
                disabled={!apiKey}
                className="btn-primary text-lg px-8 py-4"
              >
                {lang === 'zh' ? '🚀 开始 AI 深度分析' : '🚀 Start AI Analysis'}
              </button>
            </div>
          )}

          {/* 分析中显示金句 */}
          {loading && Object.keys(responses).length < LEARNING_PHASES.length && (
            <div className="card">
              <div className="mb-6 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-xl">
                <p className="text-yellow-400 text-sm font-medium text-center">
                  ⚠️ {lang === 'zh' 
                    ? '正在分析中，请不要关闭或离开此页面，否则分析会中断' 
                    : 'Analyzing, please do not close or leave this page'}
                </p>
              </div>
              
              <LoadingQuotes lang={lang} quotes={quotes} />
              
              <div className="mt-6 text-center">
                <p className="text-sm text-[var(--text-secondary)]">
                  {lang === 'zh' 
                    ? `正在分析中... 已完成 ${Object.keys(responses).length}/${LEARNING_PHASES.length} 个阶段` 
                    : `Analyzing... ${Object.keys(responses).length}/${LEARNING_PHASES.length} phases completed`}
                </p>
                <div className="mt-3 progress-bar">
                  <div className="progress-fill" style={{ width: `${(Object.keys(responses).length / LEARNING_PHASES.length) * 100}%` }} />
                </div>
              </div>
            </div>
          )}

          {/* 已有分析结果，显示阶段选择器和内容 */}
          {Object.keys(responses).length > 0 && (
            <>
              {/* Phase Selector */}
              <div className="card mb-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold">{lang === 'zh' ? '学习进度' : 'Learning Progress'}</h3>
                  <span className="text-sm text-[var(--text-secondary)]">
                    {Math.min(book.currentPhase + 1, LEARNING_PHASES.length)} / {LEARNING_PHASES.length}
                  </span>
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                  {LEARNING_PHASES.map((p, idx) => (
                    <button
                      key={p.id}
                      onClick={() => handlePhaseChange(idx)}
                      disabled={!responses[p.id]}
                      className={`flex flex-col items-center p-3 rounded-xl transition-all ${
                        idx === currentPhase 
                          ? 'bg-[var(--accent)] text-white scale-105' 
                          : responses[p.id]
                            ? 'bg-[var(--bg-secondary)] hover:bg-[var(--border)]' 
                            : 'bg-[var(--bg-secondary)] opacity-30 cursor-not-allowed'
                      }`}
                    >
                      <span className="text-2xl mb-1">{p.icon}</span>
                      <span className="text-xs text-center">{t(lang, `phases.${p.id}.subtitle`)}</span>
                      {responses[p.id] && idx <= book.currentPhase && <span className="text-green-400 text-xs mt-1">✓</span>}
                      {responses[p.id] && idx > book.currentPhase && <span className="text-yellow-400 text-xs mt-1">○</span>}
                    </button>
                  ))}
                </div>
                <div className="mt-4 progress-bar">
                  <div className="progress-fill" style={{ width: `${((book.currentPhase + 1) / LEARNING_PHASES.length) * 100}%` }} />
                </div>
                
                {analyzingInBackground && (
                  <div className="mt-4 text-center">
                    <p className="text-xs text-yellow-400">
                      ⏳ {lang === 'zh' ? '后台分析中，你可以自由浏览已完成的阶段' : 'Analyzing in background, feel free to browse'}
                    </p>
                  </div>
                )}
              </div>

              {/* Phase Content */}
              {phase && responses[phase.id] && (
                <div className="card">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-3xl">{phase.icon}</span>
                    <div>
                      <h2 className="text-xl font-bold">{t(lang, `phases.${phase.id}.title`)}</h2>
                      <p className="text-[var(--text-secondary)] text-sm">{t(lang, `phases.${phase.id}.subtitle`)}</p>
                    </div>
                  </div>
                  <p className="text-[var(--text-secondary)] mb-6 pl-12">{t(lang, `phases.${phase.id}.desc`)}</p>

                  {/* 检查是否可以查看内容 */}
                  {currentPhase <= book.currentPhase ? (
                    <>
                      <PhaseResult key={currentPhase} content={responses[phase.id]} lang={lang} />

                      {/* 每个阶段都显示完成按钮 */}
                      {currentPhase < book.currentPhase ? (
                        // 已完成的阶段，显示已完成标记
                        <div className="mt-6 text-center py-3 bg-green-500/10 border border-green-500/30 rounded-xl">
                          <span className="text-green-400">✓ {lang === 'zh' ? '已完成此阶段' : 'Phase Completed'}</span>
                        </div>
                      ) : (
                        // 当前进度的阶段，可以点击完成
                        <button 
                          onClick={handleCompletePhase} 
                          className="mt-6 w-full btn-primary"
                        >
                          {currentPhase < LEARNING_PHASES.length - 1 
                            ? (lang === 'zh' ? '✓ 完成此阶段，进入下一步 →' : '✓ Complete & Next →')
                            : (lang === 'zh' ? '✓ 完成学习，去实践 →' : '✓ Complete & Practice →')}
                        </button>
                      )}
                    </>
                  ) : (
                    // 未到达的阶段，显示锁定提示
                    <div className="text-center py-16">
                      <div className="text-6xl mb-4">🔒</div>
                      <p className="text-[var(--text-secondary)] text-lg mb-2">
                        {lang === 'zh' ? '此阶段尚未解锁' : 'This Phase is Locked'}
                      </p>
                      <p className="text-sm text-[var(--text-secondary)]">
                        {lang === 'zh' 
                          ? '请先完成前面的阶段才能查看此内容' 
                          : 'Complete previous phases to unlock this content'}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Practice Tab */}
      {activeTab === 'practice' && (
        <div className="animate-fade-in space-y-6">
          {/* 成绩概览卡片 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* 教学模拟成绩 */}
            <div 
              onClick={handleTeachingCardClick}
              className={`card bg-gradient-to-br from-blue-500/10 to-purple-500/10 border-2 border-blue-500/30 transition-all ${
                practiceRecords.length > 0 ? 'cursor-pointer hover:border-blue-500/60 hover:shadow-lg hover:scale-[1.02]' : ''
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">✍️</span>
                  <h3 className="font-bold">{lang === 'zh' ? '教学模拟' : 'Teaching'}</h3>
                </div>
                {practiceRecords.length > 0 && (
                  <span className="text-xs text-[var(--text-secondary)]">
                    {practiceRecords.length} {lang === 'zh' ? '次记录' : 'records'}
                  </span>
                )}
              </div>
              
              {practiceRecords.length > 0 ? (
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-3xl font-bold text-blue-400 mb-1">
                      {Math.max(...practiceRecords.map(r => r.scores.overall))}
                    </div>
                    <div className="text-xs text-[var(--text-secondary)]">
                      {lang === 'zh' ? '最高分' : 'Best Score'}
                    </div>
                  </div>
                  <div className={`px-4 py-2 rounded-xl font-bold ${
                    Math.max(...practiceRecords.map(r => r.scores.overall)) >= 60
                      ? 'bg-green-500 text-white'
                      : 'bg-yellow-500 text-white'
                  }`}>
                    {Math.max(...practiceRecords.map(r => r.scores.overall)) >= 60
                      ? (lang === 'zh' ? '✓ 已通过' : '✓ Passed')
                      : (lang === 'zh' ? '未通过' : 'Not Passed')}
                  </div>
                </div>
              ) : (
                <div className="text-center py-4 text-[var(--text-secondary)]">
                  <div className="text-4xl mb-2">📝</div>
                  <div className="text-sm">{lang === 'zh' ? '还没有记录' : 'No records yet'}</div>
                </div>
              )}
              
              {practiceRecords.length > 0 && (
                <div className="mt-3 pt-3 border-t border-blue-500/20 text-center">
                  <span className="text-xs text-blue-400">
                    {lang === 'zh' ? '点击查看详细记录 →' : 'Click to view details →'}
                  </span>
                </div>
              )}
            </div>

            {/* 角色问答成绩 */}
            <div 
              onClick={handleQACardClick}
              className={`card bg-gradient-to-br from-green-500/10 to-teal-500/10 border-2 border-green-500/30 transition-all ${
                book.qaPracticeRecords && book.qaPracticeRecords.length > 0 ? 'cursor-pointer hover:border-green-500/60 hover:shadow-lg hover:scale-[1.02]' : ''
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">💬</span>
                  <h3 className="font-bold">{lang === 'zh' ? '角色问答' : 'Q&A'}</h3>
                </div>
                {book.qaPracticeRecords && book.qaPracticeRecords.length > 0 && (
                  <span className="text-xs text-[var(--text-secondary)]">
                    {book.qaPracticeRecords.length} {lang === 'zh' ? '次记录' : 'records'}
                  </span>
                )}
              </div>
              
              {book.qaPracticeRecords && book.qaPracticeRecords.length > 0 ? (
                (() => {
                  const latestRecord = book.qaPracticeRecords[book.qaPracticeRecords.length - 1]
                  const answeredQuestions = latestRecord.questions.filter(q => q.score !== undefined)
                  const avgScore = answeredQuestions.length > 0
                    ? Math.round(answeredQuestions.reduce((sum, q) => sum + (q.score || 0), 0) / answeredQuestions.length)
                    : 0
                  
                  return (
                    <>
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-3xl font-bold text-green-400 mb-1">
                            {avgScore}
                          </div>
                          <div className="text-xs text-[var(--text-secondary)]">
                            {lang === 'zh' ? '最新平均分' : 'Latest Avg'}
                          </div>
                        </div>
                        <div className={`px-4 py-2 rounded-xl font-bold ${
                          latestRecord.allPassed
                            ? 'bg-green-500 text-white'
                            : 'bg-yellow-500 text-white'
                        }`}>
                          {latestRecord.allPassed
                            ? (lang === 'zh' ? '✓ 已通过' : '✓ Passed')
                            : (lang === 'zh' ? '未通过' : 'Not Passed')}
                        </div>
                      </div>
                      <div className="mt-3 pt-3 border-t border-green-500/20 text-center">
                        <span className="text-xs text-green-400">
                          {lang === 'zh' ? '点击查看详细记录 →' : 'Click to view details →'}
                        </span>
                      </div>
                    </>
                  )
                })()
              ) : (
                <div className="text-center py-4 text-[var(--text-secondary)]">
                  <div className="text-4xl mb-2">💭</div>
                  <div className="text-sm">{lang === 'zh' ? '还没有记录' : 'No records yet'}</div>
                </div>
              )}
            </div>
          </div>

          {/* 完成提示 */}
          {!hasPassed && (
            <div className="bg-gradient-to-r from-cyan-50 to-blue-50 border-2 border-cyan-400 rounded-xl p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-cyan-100 flex items-center justify-center flex-shrink-0">
                    <span className="text-xl">📋</span>
                  </div>
                  <div>
                    <h3 className="text-cyan-700 font-semibold text-base mb-0.5">
                      {lang === 'zh' ? '阅读完成条件' : 'Completion Requirements'}
                    </h3>
                    <p className="text-gray-600 text-sm">
                      {lang === 'zh' 
                        ? '教学模拟 60分+ ｜ 角色问答全部 60分+' 
                        : 'Teaching 60+ | All Q&A 60+'}
                    </p>
                  </div>
                </div>
                <div className="px-3 py-1.5 bg-cyan-100 rounded-lg border border-cyan-300">
                  <span className="text-cyan-700 text-xs font-medium">
                    {lang === 'zh' ? '待完成' : 'Pending'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* 教学模拟 */}
          <div className="card">
            <div className="flex items-center gap-3 mb-4">
              <span className="text-3xl">✍️</span>
              <div>
                <h2 className="text-xl font-bold">{t(lang, 'practice.title')}</h2>
                <p className="text-[var(--text-secondary)]">{t(lang, 'practice.subtitle')}</p>
              </div>
            </div>

            {loading ? (
              <LoadingQuotes lang={lang} quotes={quotes} />
            ) : (
              <>
                <h3 className="font-semibold mb-1">{t(lang, 'practice.teach')}</h3>
                <p className="text-sm text-[var(--text-secondary)] mb-3">{t(lang, 'practice.teachDesc')}</p>
                
                <textarea
                  value={teachingNote}
                  onChange={e => setTeachingNote(e.target.value)}
                  placeholder={t(lang, 'practice.teachPlaceholder')}
                  className="input-field min-h-[250px] resize-y mb-2"
                />
                
                <div className="flex items-center justify-between">
                  <span className={`text-sm ${teachingNote.length >= 200 ? 'text-green-400' : 'text-[var(--text-secondary)]'}`}>
                    {teachingNote.length} / 200 {lang === 'zh' ? '字' : 'chars'}
                    {teachingNote.length < 200 && <span className="ml-2 text-yellow-400">({t(lang, 'practice.minChars')})</span>}
                  </span>
                  <button
                    onClick={handleSubmitPractice}
                    disabled={teachingNote.length < 200 || !apiKey}
                    className="btn-primary"
                  >
                    {t(lang, 'practice.getReview')}
                  </button>
                </div>
              </>
            )}
          </div>

          {/* 实践记录 - 移到教学模拟下方，默认折叠 */}
          {practiceRecords.length > 0 && (
            <div className="card" ref={practiceHistoryRef}>
              <button
                onClick={() => setShowPracticeHistory(!showPracticeHistory)}
                className="w-full flex items-center justify-between p-2 hover:bg-[var(--bg-secondary)] rounded-lg transition-colors"
              >
                <h3 className="font-semibold">📊 {t(lang, 'practice.history')} ({practiceRecords.length})</h3>
                <span className={`text-sm text-[var(--text-secondary)] transition-transform duration-200 ${showPracticeHistory ? 'rotate-180' : ''}`}>
                  ▼
                </span>
              </button>
              
              {showPracticeHistory && (
                <div className="mt-4 space-y-4 animate-fade-in">
                  {practiceRecords.slice().reverse().map(record => (
                    <div key={record.id} className="bg-[var(--bg-secondary)] rounded-xl p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <span className={`text-2xl font-bold ${record.passed ? 'text-green-400' : 'text-yellow-400'}`}>
                            {record.scores.overall}
                          </span>
                          <span className={`status-badge ${record.passed ? 'status-finished' : 'status-reading'}`}>
                            {record.passed ? t(lang, 'practice.passed') : t(lang, 'practice.notPassed')}
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-[var(--text-secondary)]">
                            {new Date(record.createdAt).toLocaleString()}
                          </span>
                          <button onClick={() => handleDeleteRecord(record.id)} className="text-red-400 text-sm">
                            {t(lang, 'practice.deleteRecord')}
                          </button>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2 mb-3">
                        {(['accuracy', 'completeness', 'clarity'] as const).map(key => (
                          <div key={key} className="bg-[var(--bg-card)] rounded-lg p-2 text-center">
                            <div className="text-xs text-[var(--text-secondary)]">{t(lang, `practice.${key}`)}</div>
                            <div className={record.scores[key] >= 60 ? 'text-green-400' : 'text-yellow-400'}>
                              {record.scores[key]}
                            </div>
                          </div>
                        ))}
                      </div>
                      <details>
                        <summary className="cursor-pointer text-sm text-[var(--accent)]">
                          {lang === 'zh' ? '查看详情' : 'View details'}
                        </summary>
                        <div className="mt-3 space-y-4 text-sm">
                          <div>
                            <p className="text-xs text-[var(--text-secondary)] mb-2">
                              {lang === 'zh' ? '教学输出：' : 'Teaching Output:'}
                            </p>
                            <div className="bg-[var(--bg-card)] rounded p-3">
                              <MarkdownRenderer content={record.content} />
                            </div>
                          </div>
                          <div>
                            <p className="text-xs text-[var(--text-secondary)] mb-2">
                              {lang === 'zh' ? 'AI 点评：' : 'AI Review:'}
                            </p>
                            <div className="bg-[var(--bg-card)] rounded p-3">
                              <MarkdownRenderer content={record.aiReview} />
                            </div>
                          </div>
                        </div>
                      </details>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 角色问答 */}
          <QAPractice 
            book={book} 
            apiKey={apiKey} 
            lang={lang} 
            quotes={quotes} 
            onBookUpdate={handleBookUpdate}
            showHistory={qaShowHistory}
            onShowHistoryChange={setQaShowHistory}
            historyRef={qaHistoryRef}
          />

          {/* 相关推荐 - 移到独立 Tab */}
        </div>
      )}

      {/* Notes Tab */}
      {activeTab === 'notes' && (
        <div className="animate-fade-in">
          <div className="card mb-6">
            <h2 className="text-xl font-bold mb-4">📝 {t(lang, 'practice.notes')}</h2>
            <textarea
              value={newNote}
              onChange={e => setNewNote(e.target.value)}
              placeholder={t(lang, 'practice.notesPlaceholder')}
              className="input-field min-h-[120px] resize-y mb-4"
            />
            <button onClick={handleSaveNote} disabled={!newNote.trim()} className="btn-primary">
              {lang === 'zh' ? '添加笔记' : 'Add Note'}
            </button>
          </div>

          <div className="card">
            <h3 className="font-semibold mb-4">📚 {lang === 'zh' ? '笔记历史' : 'History'} ({noteRecords.length})</h3>
            {noteRecords.length === 0 ? (
              <p className="text-[var(--text-secondary)] text-center py-8">
                {lang === 'zh' ? '还没有笔记' : 'No notes yet'}
              </p>
            ) : (
              <div className="space-y-3">
                {noteRecords.slice().reverse().map(note => (
                  <div key={note.id} className="bg-[var(--bg-secondary)] rounded-xl p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {note.phaseId && (
                          <span className="text-xs bg-[var(--accent)]/20 text-[var(--accent)] px-2 py-1 rounded">
                            {t(lang, `phases.${note.phaseId}.subtitle`)}
                          </span>
                        )}
                        <span className="text-xs text-[var(--text-secondary)]">
                          {new Date(note.createdAt).toLocaleString()}
                        </span>
                      </div>
                      <button onClick={() => handleDeleteNote(note.id)} className="text-red-400 text-sm">
                        {lang === 'zh' ? '删除' : 'Delete'}
                      </button>
                    </div>
                    <p className="whitespace-pre-wrap text-sm">{note.content}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Recommendations Tab */}
      {activeTab === 'recommendations' && (
        <div className="animate-fade-in">
          {book.status !== 'finished' ? (
            <div className="card text-center py-16">
              <div className="text-6xl mb-4">🔒</div>
              <h3 className="text-xl font-bold mb-2">
                {lang === 'zh' ? '相关推荐已锁定' : 'Recommendations Locked'}
              </h3>
              <p className="text-[var(--text-secondary)] mb-4">
                {lang === 'zh' 
                  ? '完成阅读后，系统将为你推荐相关书籍，帮助你继续深入探索' 
                  : 'Complete reading to unlock book recommendations'}
              </p>
              <div className="inline-block px-4 py-2 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                <p className="text-yellow-400 text-sm">
                  ⚠️ {lang === 'zh' 
                    ? '需要通过教学模拟（60分+）和角色问答（全部60分+）才能解锁' 
                    : 'Pass teaching simulation (60+) and all Q&A (60+) to unlock'}
                </p>
              </div>
            </div>
          ) : (
            <BookRecommendations 
              book={book} 
              apiKey={apiKey} 
              lang={lang}
              quotes={quotes}
              recommendations={recommendations}
              onRecommendationsChange={(newRecs) => {
                setRecommendations(newRecs)
                saveProgress({ recommendations: newRecs })
              }}
              loadingRecommendations={loadingRecommendations}
              onLoadingChange={setLoadingRecommendations}
            />
          )}
        </div>
      )}
    </div>
  )
}
