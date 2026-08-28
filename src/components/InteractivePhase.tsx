'use client'

import { useState, useRef, useEffect } from 'react'
import OpenAI from 'openai'
import { logger } from '@/lib/logger'
import { Language, t } from '@/lib/i18n'
import { AI_CONTEXT_LIMIT_EXCEEDED, AI_OUTPUT_INCOMPLETE, chat, createDeepSeekClient } from '@/lib/deepseek'
import { AI_REQUEST_CANCELLED, AI_TASK_BUSY } from '@/lib/aiRequestManager'
import { tokendanceRecoveryMessage } from '@/lib/tokendance'
import {
  generateInteractiveQuestionPrompts,
  generateInteractiveRegeneratePrompts,
  RegenerateTone
} from '@/lib/feynman-prompts'
import MarkdownRenderer from './MarkdownRenderer'
import SourceEvidence from './SourceEvidence'
import { getThinkingQuestionsForPhase, ThinkingQuestion } from '@/lib/learningModes'
import AppIcon from './AppIcon'
import CopyContentButton from './CopyContentButton'

interface Props {
  bookId: string
  bookName: string
  phaseId: string
  phaseTitle: string
  initialContent: string
  apiKey: string
  lang: Language
  documentContent?: string
  onContentChange?: (newContent: string) => void
}

function interactiveAIError(error: unknown, lang: Language, fallbackZh: string, fallbackEn: string): string {
  if (error instanceof Error && error.message === AI_REQUEST_CANCELLED) {
    return lang === 'zh' ? '已取消本次 AI 请求，当前内容已保留。' : 'The AI request was cancelled. Current content was kept.'
  }
  if (error instanceof Error && error.message === AI_TASK_BUSY) {
    return lang === 'zh' ? '已有 AI 任务正在运行，请等待完成或先取消当前任务。' : 'Another AI task is running. Wait for it to finish or cancel it first.'
  }
  if (error instanceof Error && error.message === AI_OUTPUT_INCOMPLETE) {
    return lang === 'zh' ? 'AI 输出未通过完整性或原文引用校验，请重试。' : 'The AI output failed completeness or source-citation validation. Try again.'
  }
  const recovery = tokendanceRecoveryMessage(error, lang)
  if (recovery) return recovery
  return lang === 'zh' ? fallbackZh : fallbackEn
}

export default function InteractivePhase({
  bookId,
  bookName,
  phaseId,
  phaseTitle,
  initialContent,
  apiKey,
  lang,
  documentContent,
  onContentChange
}: Props) {
  const [content, setContent] = useState(initialContent)
  const [isEditing, setIsEditing] = useState(false)
  const [editedContent, setEditedContent] = useState(initialContent)
  const [editReason, setEditReason] = useState('')
  const [showRegenerateOptions, setShowRegenerateOptions] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [regenerateFocus, setRegenerateFocus] = useState('')
  const [regenerateTone, setRegenerateTone] = useState<RegenerateTone>('formal')
  const [actionError, setActionError] = useState<string | null>(null)

  // 问答功能
  const [question, setQuestion] = useState('')
  const [asking, setAsking] = useState(false)
  const [qaHistory, setQaHistory] = useState<Array<{ q: string; a: string; timestamp: number }>>([])

  // 思考题
  const [thinkingQuestions] = useState<ThinkingQuestion[]>(() => getThinkingQuestionsForPhase(phaseId))
  const [thinkingAnswers, setThinkingAnswers] = useState<Record<string, string>>({})
  const [showThinking, setShowThinking] = useState(true)

  const [client, setClient] = useState<OpenAI | null>(null)
  const qaEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (apiKey) {
      createDeepSeekClient(apiKey).then(setClient)
    }
  }, [apiKey])

  useEffect(() => {
    setContent(initialContent)
    setEditedContent(initialContent)
  }, [initialContent])

  // 当有新问答时滚动到底部
  useEffect(() => {
    if (qaHistory.length > 0) {
      qaEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [qaHistory])

  // 保存编辑
  const handleSaveEdit = () => {
    setContent(editedContent)
    setIsEditing(false)
    onContentChange?.(editedContent)
  }

  // 取消编辑
  const handleCancelEdit = () => {
    setEditedContent(content)
    setIsEditing(false)
    setEditReason('')
  }

  // 重新生成内容
  const handleRegenerate = async () => {
    if (!client) return

    setRegenerating(true)
    setActionError(null)

    try {
      const { systemPrompt, userPrompt } = generateInteractiveRegeneratePrompts(
        bookName,
        phaseTitle,
        regenerateFocus,
        regenerateTone
      )

      const requiredHeadings = [...content.matchAll(/^##\s+(.+)$/gm)].map(match => match[1].trim())
      const response = await chat(client, systemPrompt, userPrompt, documentContent, {
        requiredHeadings,
        requireSourceCitations: Boolean(documentContent),
        requestContext: { task: `phase-regenerate-${phaseId}`, bookId }
      })
      setContent(response)
      setEditedContent(response)
      onContentChange?.(response)
    } catch (error) {
      logger.error('Regeneration failed:', error)
      setActionError(error instanceof Error && error.message === AI_CONTEXT_LIMIT_EXCEEDED
        ? (lang === 'zh'
            ? '文档上下文过长，系统自动缩减后仍未能重新生成。当前阶段内容已保留，请拆分文档后重试。'
            : 'The document context is too long even after automatic reduction. The current phase content was kept; split the document and try again.')
        : interactiveAIError(error, lang, '重新生成失败，请检查网络和 API Key 后重试。', 'Regeneration failed. Check your network and API key, then try again.'))
    }

    setRegenerating(false)
    setShowRegenerateOptions(false)
  }

  // 提问
  const handleAskQuestion = async () => {
    if (!client || !question.trim()) return

    setAsking(true)
    setActionError(null)
    const userQuestion = question.trim()

    try {
      const { systemPrompt, userPrompt } = generateInteractiveQuestionPrompts(
        bookName,
        phaseTitle,
        userQuestion
      )
      const response = await chat(client, systemPrompt, userPrompt, documentContent, {
        requireSourceCitations: Boolean(documentContent),
        requestContext: { task: `phase-question-${phaseId}`, bookId }
      })

      setQaHistory(prev => [...prev, {
        q: userQuestion,
        a: response,
        timestamp: Date.now()
      }])
      setQuestion('')
    } catch (error) {
      logger.error('Question failed:', error)
      setActionError(error instanceof Error && error.message === AI_CONTEXT_LIMIT_EXCEEDED
        ? (lang === 'zh'
            ? '文档上下文过长，系统自动缩减后仍未完成回答。你的问题已保留，请拆分文档后重试。'
            : 'The document context is too long even after automatic reduction. Your question was kept; split the document and try again.')
        : interactiveAIError(error, lang, '提问失败，请检查网络和 API Key 后重试。', 'The question failed. Check your network and API key, then try again.'))
    }

    setAsking(false)
  }

  // 保存思考题答案
  const handleSaveThinkingAnswer = (questionId: string, answer: string) => {
    setThinkingAnswers(prev => ({ ...prev, [questionId]: answer }))
  }

  return (
    <div className="space-y-6">
      {actionError && (
        <div role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-300">
          {actionError}
        </div>
      )}
      {/* AI 分析内容 */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold flex items-center gap-2">
            <AppIcon name="brain" tone="violet" size={20} />
            <span>{lang === 'zh' ? 'AI 分析' : 'AI Analysis'}</span>
          </h3>

          <div className="flex items-center gap-2">
            {/* 编辑按钮 */}
            {!isEditing && (
              <button
                onClick={() => setIsEditing(true)}
                className="text-sm px-3 py-1 rounded-lg bg-[var(--bg-secondary)] hover:bg-[var(--border)] transition-colors"
              >
                <span className="inline-flex items-center gap-1.5">
                  <AppIcon name="edit" tone="amber" size={15} />
                  {lang === 'zh' ? '编辑' : 'Edit'}
                </span>
              </button>
            )}

            {/* 重新生成按钮 */}
            <button
              onClick={() => setShowRegenerateOptions(!showRegenerateOptions)}
              className="text-sm px-3 py-1 rounded-lg bg-[var(--bg-secondary)] hover:bg-[var(--border)] transition-colors"
            >
              <span className="inline-flex items-center gap-1.5">
                <AppIcon name="refresh" tone="blue" size={15} />
                {lang === 'zh' ? '重新生成' : 'Regenerate'}
              </span>
            </button>
            <CopyContentButton content={content} lang={lang} />
          </div>
        </div>

        {/* 重新生成选项 */}
        {showRegenerateOptions && (
          <div className="mb-4 p-4 bg-[var(--bg-secondary)] rounded-xl space-y-3">
            <div>
              <label className="text-sm text-[var(--text-secondary)] block mb-2">
                {lang === 'zh' ? '关注重点（可选）' : 'Focus Area (Optional)'}
              </label>
              <input
                type="text"
                value={regenerateFocus}
                onChange={e => setRegenerateFocus(e.target.value)}
                placeholder={lang === 'zh' ? '例如：更多例子、更简化的解释...' : 'e.g., More examples, simpler explanation...'}
                className="input-field w-full"
              />
            </div>

            <div>
              <label className="text-sm text-[var(--text-secondary)] block mb-2">
                {lang === 'zh' ? '语调风格' : 'Tone'}
              </label>
              <div className="flex flex-wrap gap-2">
                {[
                  { value: 'formal', label: lang === 'zh' ? '正式' : 'Formal' },
                  { value: 'casual', label: lang === 'zh' ? '轻松' : 'Casual' },
                  { value: 'simplified', label: lang === 'zh' ? '简化' : 'Simplified' },
                  { value: 'detailed', label: lang === 'zh' ? '详细' : 'Detailed' }
                ].map(option => (
                  <button
                    key={option.value}
                    onClick={() => setRegenerateTone(option.value as any)}
                    className={`px-3 py-1 rounded-lg text-sm transition-colors ${
                      regenerateTone === option.value
                        ? 'bg-[var(--accent)] text-white'
                        : 'bg-[var(--bg-card)] hover:bg-[var(--border)]'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleRegenerate}
                disabled={regenerating}
                className="btn-primary text-sm"
              >
                {regenerating
                  ? (lang === 'zh' ? '生成中...' : 'Generating...')
                  : (lang === 'zh' ? '确认重新生成' : 'Regenerate')
                }
              </button>
              <button
                onClick={() => setShowRegenerateOptions(false)}
                className="btn-secondary text-sm"
              >
                {lang === 'zh' ? '取消' : 'Cancel'}
              </button>
            </div>
          </div>
        )}

        {/* 编辑模式 */}
        {isEditing ? (
          <div className="space-y-3">
            <textarea
              value={editedContent}
              onChange={e => setEditedContent(e.target.value)}
              className="input-field min-h-[300px] resize-y font-mono text-sm"
            />
            <div>
              <input
                type="text"
                value={editReason}
                onChange={e => setEditReason(e.target.value)}
                placeholder={lang === 'zh' ? '为什么修改？（可选）' : 'Reason for edit (optional)'}
                className="input-field w-full text-sm"
              />
            </div>
            <div className="flex gap-2">
              <button onClick={handleSaveEdit} className="btn-primary text-sm">
                {lang === 'zh' ? '保存修改' : 'Save'}
              </button>
              <button onClick={handleCancelEdit} className="btn-secondary text-sm">
                {lang === 'zh' ? '取消' : 'Cancel'}
              </button>
            </div>
          </div>
        ) : (
          /* 显示内容 */
          <div className="prose prose-invert max-w-none">
            <MarkdownRenderer content={content} />
            <SourceEvidence content={content} documentContent={documentContent} lang={lang} />
          </div>
        )}
      </div>

      {/* 思考题 */}
      {thinkingQuestions.length > 0 && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold flex items-center gap-2">
              <AppIcon name="lightbulb" tone="amber" size={20} />
              <span>{lang === 'zh' ? '思考题' : 'Thinking Questions'}</span>
            </h3>
            <button
              onClick={() => setShowThinking(!showThinking)}
              className="text-sm text-[var(--accent)]"
            >
              {showThinking ? (lang === 'zh' ? '收起' : 'Hide') : (lang === 'zh' ? '展开' : 'Show')}
            </button>
          </div>

          {showThinking && (
            <div className="space-y-4">
              {thinkingQuestions.map((q, idx) => (
                <div key={q.id} className="bg-[var(--bg-secondary)] rounded-xl p-4">
                  <p className="font-medium mb-2">
                    <span className="text-[var(--accent)] mr-2">{idx + 1}.</span>
                    {q.question[lang]}
                  </p>
                  {q.hint && (
                    <p className="flex items-start gap-2 text-sm text-[var(--text-secondary)] mb-3">
                      <AppIcon name="lightbulb" tone="amber" size={16} />
                      <span>{q.hint[lang]}</span>
                    </p>
                  )}
                  <textarea
                    value={thinkingAnswers[q.id] || ''}
                    onChange={e => handleSaveThinkingAnswer(q.id, e.target.value)}
                    placeholder={lang === 'zh' ? '写下你的思考...' : 'Write your thoughts...'}
                    className="input-field min-h-[100px] resize-y text-sm"
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* AI 问答 */}
      <div className="card">
        <h3 className="font-semibold flex items-center gap-2 mb-4">
          <AppIcon name="message" tone="blue" size={20} />
          <span>{lang === 'zh' ? '向 AI 提问' : 'Ask AI'}</span>
        </h3>

        {/* 问答历史 */}
        {qaHistory.length > 0 && (
          <div className="mb-4 space-y-3 max-h-[400px] overflow-y-auto">
            {qaHistory.map((item, idx) => (
              <div key={idx} className="space-y-2">
                <div className="bg-[var(--accent)]/10 rounded-xl p-3">
                  <p className="text-sm font-medium text-[var(--accent)]">
                    {lang === 'zh' ? '问：' : 'Q:'} {item.q}
                  </p>
                </div>
                <div className="bg-[var(--bg-secondary)] rounded-xl p-3">
                  <div className="mb-2 flex justify-end">
                    <CopyContentButton content={item.a} lang={lang} />
                  </div>
                  <MarkdownRenderer content={item.a} />
                  <SourceEvidence content={item.a} documentContent={documentContent} lang={lang} />
                </div>
              </div>
            ))}
            <div ref={qaEndRef} />
          </div>
        )}

        {/* 提问输入 */}
        <div className="flex gap-2">
          <input
            type="text"
            value={question}
            onChange={e => setQuestion(e.target.value)}
            onKeyPress={e => e.key === 'Enter' && !asking && handleAskQuestion()}
            placeholder={lang === 'zh' ? '关于这个阶段，你有什么疑问？' : 'What questions do you have about this phase?'}
            className="input-field flex-1"
            disabled={asking}
          />
          <button
            onClick={handleAskQuestion}
            disabled={asking || !question.trim()}
            className="btn-primary"
          >
            {asking ? '...' : (lang === 'zh' ? '发送' : 'Send')}
          </button>
        </div>
      </div>
    </div>
  )
}
