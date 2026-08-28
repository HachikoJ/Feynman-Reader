'use client'

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts'
import { Book, isQAPracticeRecordComplete } from '@/lib/store'
import { Language, t } from '@/lib/i18n'
import { LEARNING_PHASES } from '@/lib/feynman-prompts'
import AppIcon from './AppIcon'

const CHART_COLORS = {
  accent: '#315efb',
  cyan: '#28c79a',
  green: '#16a47b',
  amber: '#d5a400',
  violet: '#ff6b61',
  muted: '#94a3b8'
}

interface ScorePoint {
  timestamp: number
  label: string
  score: number
  teaching?: number
  qa?: number
  bookName?: string
}

function shortDate(timestamp: number, lang: Language): string {
  return new Intl.DateTimeFormat(lang === 'zh' ? 'zh-CN' : 'en-US', {
    month: 'numeric',
    day: 'numeric'
  }).format(timestamp)
}

function getQAScore(book: Book, recordIndex: number): number | null {
  const record = book.qaPracticeRecords?.[recordIndex]
  if (!record) return null
  const scored = record.questions.filter(question => typeof question.score === 'number')
  if (scored.length === 0) return null
  return Math.round(scored.reduce((sum, question) => sum + (question.score || 0), 0) / scored.length)
}

export function buildLibraryScoreTrend(books: Book[], lang: Language): ScorePoint[] {
  const points: ScorePoint[] = []
  books.forEach(book => {
    book.practiceRecords?.forEach(record => {
      points.push({
        timestamp: record.createdAt,
        label: shortDate(record.createdAt, lang),
        score: record.scores.overall,
        bookName: book.name
      })
    })
    book.qaPracticeRecords?.forEach((record, index) => {
      const score = getQAScore(book, index)
      if (score === null) return
      points.push({
        timestamp: record.updatedAt || record.createdAt,
        label: shortDate(record.updatedAt || record.createdAt, lang),
        score,
        bookName: book.name
      })
    })
  })
  return points.sort((left, right) => left.timestamp - right.timestamp).slice(-24)
}

export function buildBookScoreTrend(book: Book, lang: Language): ScorePoint[] {
  const points: ScorePoint[] = []
  book.practiceRecords?.forEach(record => {
    points.push({
      timestamp: record.createdAt,
      label: shortDate(record.createdAt, lang),
      score: record.scores.overall,
      teaching: record.scores.overall
    })
  })
  book.qaPracticeRecords?.forEach((record, index) => {
    const score = getQAScore(book, index)
    if (score === null) return
    points.push({
      timestamp: record.updatedAt || record.createdAt,
      label: shortDate(record.updatedAt || record.createdAt, lang),
      score,
      qa: score
    })
  })
  return points.sort((left, right) => left.timestamp - right.timestamp)
}

function ChartTooltipStyle() {
  return {
    backgroundColor: 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    color: 'var(--text-primary)',
    fontSize: 12
  }
}

export function LibraryAnalytics({ books, lang }: { books: Book[]; lang: Language }) {
  const statusData = [
    { name: lang === 'zh' ? '未读' : 'Unread', value: books.filter(book => book.status === 'unread').length, color: CHART_COLORS.muted },
    { name: lang === 'zh' ? '在读' : 'Reading', value: books.filter(book => book.status === 'reading').length, color: CHART_COLORS.amber },
    { name: lang === 'zh' ? '已读' : 'Finished', value: books.filter(book => book.status === 'finished').length, color: CHART_COLORS.green }
  ].filter(item => item.value > 0)

  const phaseData = LEARNING_PHASES.map((phase, index) => ({
    name: String(index + 1),
    phase: t(lang, `phases.${phase.id}.subtitle`),
    completed: books.filter(book => book.currentPhase >= index + 1).length
  }))
  const scoreTrend = buildLibraryScoreTrend(books, lang)
  const learningBooks = books.filter(book => book.currentPhase > 0 || book.practiceRecords.length > 0 || book.qaPracticeRecords.length > 0)
  const practiceAttempts = books.reduce((sum, book) => sum + book.practiceRecords.length + book.qaPracticeRecords.length, 0)
  const passedAttempts = books.reduce((sum, book) => (
    sum +
    book.practiceRecords.filter(record => record.passed).length +
    book.qaPracticeRecords.filter(record => isQAPracticeRecordComplete(record)).length
  ), 0)
  const passRate = practiceAttempts > 0 ? Math.round((passedAttempts / practiceAttempts) * 100) : 0

  return (
    <div className="mt-4 space-y-4 animate-fade-in">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric label={lang === 'zh' ? '有学习记录' : 'With activity'} value={learningBooks.length} icon="bookOpen" tone="blue" />
        <Metric label={lang === 'zh' ? '练习次数' : 'Practice attempts'} value={practiceAttempts} icon="graduation" tone="violet" />
        <Metric label={lang === 'zh' ? '通过率' : 'Pass rate'} value={practiceAttempts > 0 ? `${passRate}%` : '-'} icon="target" tone="green" />
        <Metric label={lang === 'zh' ? '评分样本' : 'Score samples'} value={scoreTrend.length} icon="chart" tone="amber" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card p-4">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <AppIcon name="chart" tone="blue" size={17} />
            {lang === 'zh' ? '阅读状态分布' : 'Reading status'}
          </h3>
          <ResponsiveContainer width="100%" height={230}>
            <PieChart>
              <Pie data={statusData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={82} paddingAngle={3}>
                {statusData.map(item => <Cell key={item.name} fill={item.color} />)}
              </Pie>
              <Tooltip contentStyle={ChartTooltipStyle()} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        </section>

        <section className="card p-4">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <AppIcon name="route" tone="green" size={17} />
            {lang === 'zh' ? '六阶段完成人数' : 'Six-phase completion'}
          </h3>
          <ResponsiveContainer width="100%" height={230}>
            <BarChart data={phaseData}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} width={28} />
              <Tooltip contentStyle={ChartTooltipStyle()} labelFormatter={label => {
                const item = phaseData[Number(label) - 1]
                return item?.phase || label
              }} />
              <Bar dataKey="completed" name={lang === 'zh' ? '完成人数' : 'Completed'} fill={CHART_COLORS.green} radius={[5, 5, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </section>
      </div>

      <section className="card p-4">
        <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
          <AppIcon name="trendUp" tone="violet" size={17} />
          {lang === 'zh' ? '最近评分趋势' : 'Recent score trend'}
        </h3>
        {scoreTrend.length > 0 ? (
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={scoreTrend}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
              <XAxis dataKey="label" tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} />
              <YAxis domain={[0, 100]} tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} width={34} />
              <Tooltip contentStyle={ChartTooltipStyle()} />
              <Line type="monotone" dataKey="score" name={lang === 'zh' ? '评分' : 'Score'} stroke={CHART_COLORS.violet} strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <EmptyChart lang={lang} />
        )}
      </section>
    </div>
  )
}

export function BookLearningAnalytics({ book, lang }: { book: Book; lang: Language }) {
  const bestPractice = [...book.practiceRecords].sort((left, right) => right.scores.overall - left.scores.overall)[0]
  const allQuestions = book.qaPracticeRecords.flatMap(record => record.questions)
  const scoredQuestions = allQuestions.filter(question => typeof question.score === 'number')
  const passedQuestions = scoredQuestions.filter(question => (question.score || 0) >= 60)
  const qaMastery = scoredQuestions.length > 0 ? Math.round((passedQuestions.length / scoredQuestions.length) * 100) : 0
  const dimensionData = [
    { subject: lang === 'zh' ? '阶段完成' : 'Phases', value: Math.round((book.currentPhase / LEARNING_PHASES.length) * 100) },
    { subject: lang === 'zh' ? '准确度' : 'Accuracy', value: bestPractice?.scores.accuracy || 0 },
    { subject: lang === 'zh' ? '完整度' : 'Completeness', value: bestPractice?.scores.completeness || 0 },
    { subject: lang === 'zh' ? '清晰度' : 'Clarity', value: bestPractice?.scores.clarity || 0 },
    { subject: lang === 'zh' ? '问答通过' : 'Q&A pass', value: qaMastery }
  ]
  const scoreTrend = buildBookScoreTrend(book, lang)
  const totalAttempts = book.practiceRecords.length + book.qaPracticeRecords.length
  const passedAttempts = book.practiceRecords.filter(record => record.passed).length +
    book.qaPracticeRecords.filter(record => isQAPracticeRecordComplete(record)).length
  const passRate = totalAttempts > 0 ? Math.round((passedAttempts / totalAttempts) * 100) : 0

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric label={lang === 'zh' ? '已完成阶段' : 'Phases done'} value={`${book.currentPhase}/${LEARNING_PHASES.length}`} icon="route" tone="blue" />
        <Metric label={lang === 'zh' ? '教学练习' : 'Teaching'} value={book.practiceRecords.length} icon="graduation" tone="violet" />
        <Metric label={lang === 'zh' ? '角色问答' : 'Persona Q&A'} value={book.qaPracticeRecords.length} icon="message" tone="amber" />
        <Metric label={lang === 'zh' ? '练习通过率' : 'Practice pass'} value={totalAttempts > 0 ? `${passRate}%` : '-'} icon="target" tone="green" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card p-4">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <AppIcon name="brain" tone="violet" size={17} />
            {lang === 'zh' ? '学习维度' : 'Learning dimensions'}
          </h3>
          <ResponsiveContainer width="100%" height={260}>
            <RadarChart data={dimensionData}>
              <PolarGrid stroke="var(--border)" />
              <PolarAngleAxis dataKey="subject" tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} />
              <PolarRadiusAxis domain={[0, 100]} tick={{ fill: 'var(--text-secondary)', fontSize: 10 }} />
              <Radar dataKey="value" name={lang === 'zh' ? '掌握度' : 'Mastery'} stroke={CHART_COLORS.violet} fill={CHART_COLORS.violet} fillOpacity={0.25} strokeWidth={2} />
              <Tooltip contentStyle={ChartTooltipStyle()} />
            </RadarChart>
          </ResponsiveContainer>
        </section>

        <section className="card p-4">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <AppIcon name="trendUp" tone="blue" size={17} />
            {lang === 'zh' ? '练习评分变化' : 'Practice score trend'}
          </h3>
          {scoreTrend.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={scoreTrend}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                <XAxis dataKey="label" tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} />
                <YAxis domain={[0, 100]} tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} width={34} />
                <Tooltip contentStyle={ChartTooltipStyle()} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line connectNulls type="monotone" dataKey="teaching" name={lang === 'zh' ? '教学模拟' : 'Teaching'} stroke={CHART_COLORS.accent} strokeWidth={2.5} dot={{ r: 3 }} />
                <Line connectNulls type="monotone" dataKey="qa" name={lang === 'zh' ? '角色问答' : 'Persona Q&A'} stroke={CHART_COLORS.amber} strokeWidth={2.5} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart lang={lang} />
          )}
        </section>
      </div>
    </div>
  )
}

function Metric({
  label,
  value,
  icon,
  tone
}: {
  label: string
  value: string | number
  icon: 'bookOpen' | 'graduation' | 'target' | 'chart' | 'route' | 'message'
  tone: 'blue' | 'violet' | 'green' | 'amber'
}) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-3">
      <div className="mb-2 flex items-center gap-2 text-xs text-[var(--text-secondary)]">
        <AppIcon name={icon} tone={tone} size={16} />
        <span>{label}</span>
      </div>
      <div className="text-xl font-bold">{value}</div>
    </div>
  )
}

function EmptyChart({ lang }: { lang: Language }) {
  return (
    <div className="flex h-[220px] flex-col items-center justify-center text-center text-sm text-[var(--text-secondary)]">
      <AppIcon name="chart" tone="muted" size={30} className="mb-2" />
      <p>{lang === 'zh' ? '完成教学模拟或角色问答后，这里会显示真实评分趋势。' : 'Complete teaching or persona Q&A to see the real score trend.'}</p>
    </div>
  )
}
