'use client'

import { useSyncExternalStore } from 'react'
import { LoaderCircle, Square } from 'lucide-react'
import { Language } from '@/lib/i18n'
import { aiRequestManager } from '@/lib/aiRequestManager'

function taskLabel(task: string, lang: Language): string {
  const labels: Array<[string, string, string]> = [
    ['phase-regenerate', '重新生成阶段内容', 'Regenerating phase'],
    ['phase-question', '回答阶段问题', 'Answering phase question'],
    ['phase-', '生成阶段分析', 'Generating phase analysis'],
    ['teaching-evaluation', '评估教学模拟', 'Evaluating teaching practice'],
    ['persona-questions', '生成角色问题', 'Generating persona questions'],
    ['persona-evaluation', '评估角色回答', 'Evaluating persona answers'],
    ['book-recommendations', '生成相关推荐', 'Generating recommendations'],
    ['document-metadata', '提取文档信息', 'Extracting document details'],
    ['book-metadata', '补全书籍信息', 'Completing book details'],
    ['book-tags', '生成书籍标签', 'Generating book tags']
  ]
  const matched = labels.find(([prefix]) => task.startsWith(prefix))
  return matched ? (lang === 'zh' ? matched[1] : matched[2]) : (lang === 'zh' ? '处理 AI 任务' : 'Processing AI task')
}

function isResumableBookAnalysis(task: string): boolean {
  return task.startsWith('phase-') && !task.startsWith('phase-regenerate') && !task.startsWith('phase-question')
}

export default function AITaskStatus({ lang }: { lang: Language }) {
  const state = useSyncExternalStore(
    aiRequestManager.subscribe,
    aiRequestManager.getSnapshot,
    aiRequestManager.getSnapshot
  )

  if (!state.activeTasks.length) return null
  const hasResumableBookAnalysis = state.activeTasks.some(task => isResumableBookAnalysis(task.task))

  return (
    <div className="fixed bottom-4 right-4 z-50 flex max-w-[calc(100vw-2rem)] items-center gap-3 rounded-lg border border-[var(--accent)]/40 bg-[var(--bg-card)] px-4 py-3 shadow-xl">
      <LoaderCircle size={19} className="shrink-0 animate-spin text-[var(--accent)]" aria-hidden="true" />
      <div className="min-w-0">
        <p role="status" className="truncate text-sm font-medium">{state.activeTasks.length > 1
          ? (lang === 'zh' ? `${state.activeTasks.length} 个 AI 任务运行中` : `${state.activeTasks.length} AI tasks running`)
          : taskLabel(state.activeTasks[0].task, lang)}</p>
        <p className="text-xs text-[var(--text-secondary)]">
          {state.cancelling
            ? (lang === 'zh' ? '正在取消...' : 'Cancelling...')
            : hasResumableBookAnalysis
              ? (lang === 'zh' ? '六阶段解读会自动保存进度，可切换页面后继续' : 'Six-phase analysis saves progress automatically and can resume after navigation')
              : (lang === 'zh' ? '任务可并行运行，受账号并发额度限制' : 'Tasks run in parallel, subject to account limits')}
        </p>
      </div>
      {!hasResumableBookAnalysis && (
        <button
          type="button"
          onClick={() => aiRequestManager.cancelActive()}
          disabled={state.cancelling}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-red-500/40 text-red-500 hover:bg-red-500/10 disabled:opacity-50"
          aria-label={lang === 'zh' ? '取消当前 AI 任务' : 'Cancel current AI task'}
          title={lang === 'zh' ? '取消当前 AI 任务' : 'Cancel current AI task'}
        >
          <Square size={15} fill="currentColor" aria-hidden="true" />
        </button>
      )}
    </div>
  )
}
