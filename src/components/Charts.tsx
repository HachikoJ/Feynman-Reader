'use client'

import { 
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  PieChart, Pie, Cell,
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer
} from 'recharts'
import { Language, t } from '@/lib/i18n'
import { LEARNING_PHASES } from '@/lib/feynman-prompts'

interface ProgressRadarProps {
  responses: Record<string, string>
  lang: Language
}

// 学习维度雷达图 - 展示各阶段的探索深度
export function ProgressRadar({ responses, lang }: ProgressRadarProps) {
  const data = LEARNING_PHASES.map(phase => {
    const phaseResponses = Object.keys(responses).filter(k => k.startsWith(phase.id))
    const totalPrompts = phase.promptCount
    const score = Math.min((phaseResponses.length / totalPrompts) * 100, 100)
    
    return {
      subject: t(lang, `phases.${phase.id}.subtitle`),
      value: score,
      fullMark: 100
    }
  })

  return (
    <div className="card">
      <h3 className="font-semibold mb-4 flex items-center gap-2">
        <span>📊</span>
        {lang === 'zh' ? '学习维度分析' : 'Learning Dimensions'}
      </h3>
      <ResponsiveContainer width="100%" height={280}>
        <RadarChart data={data}>
          <PolarGrid stroke="var(--border)" />
          <PolarAngleAxis 
            dataKey="subject" 
            tick={{ fill: 'var(--text-secondary)', fontSize: 12 }}
          />
          <PolarRadiusAxis 
            angle={30} 
            domain={[0, 100]} 
            tick={{ fill: 'var(--text-secondary)', fontSize: 10 }}
          />
          <Radar
            name="探索度"
            dataKey="value"
            stroke="var(--accent)"
            fill="var(--accent)"
            fillOpacity={0.3}
            strokeWidth={2}
          />
        </RadarChart>
      </ResponsiveContainer>
      <p className="text-center text-sm text-[var(--text-secondary)] mt-2">
        {lang === 'zh' ? '各维度探索完成度' : 'Exploration completion by dimension'}
      </p>
    </div>
  )
}

interface PhaseProgressProps {
  currentPhase: number
  totalPhases: number
  lang: Language
}

// 阶段进度环形图
export function PhaseProgress({ currentPhase, totalPhases, lang }: PhaseProgressProps) {
  const percentage = Math.round(((currentPhase + 1) / totalPhases) * 100)
  
  const data = [
    { name: 'completed', value: currentPhase + 1 },
    { name: 'remaining', value: totalPhases - currentPhase - 1 }
  ]
  
  const COLORS = ['var(--accent)', 'var(--bg-secondary)']

  return (
    <div className="card text-center">
      <h3 className="font-semibold mb-2 flex items-center justify-center gap-2">
        <span>🎯</span>
        {lang === 'zh' ? '总体进度' : 'Overall Progress'}
      </h3>
      <div className="relative">
        <ResponsiveContainer width="100%" height={160}>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={50}
              outerRadius={70}
              paddingAngle={2}
              dataKey="value"
              startAngle={90}
              endAngle={-270}
            >
              {data.map((_, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index]} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex items-center justify-center">
          <div>
            <div className="text-3xl font-bold text-gradient">{percentage}%</div>
            <div className="text-xs text-[var(--text-secondary)]">
              {currentPhase + 1}/{totalPhases}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

interface KnowledgeGaugeProps {
  responses: Record<string, string>
  lang: Language
}

// 知识掌握度仪表盘
export function KnowledgeGauge({ responses, lang }: KnowledgeGaugeProps) {
  const totalQuestions = LEARNING_PHASES.reduce((sum, p) => sum + p.promptCount, 0)
  const answeredQuestions = Object.keys(responses).filter(k => !k.includes('custom')).length
  const percentage = Math.round((answeredQuestions / totalQuestions) * 100)
  
  // 根据百分比确定等级
  const getLevel = (pct: number) => {
    if (pct >= 80) return { label: lang === 'zh' ? '精通' : 'Master', color: '#22c55e' }
    if (pct >= 60) return { label: lang === 'zh' ? '熟练' : 'Proficient', color: '#3b82f6' }
    if (pct >= 40) return { label: lang === 'zh' ? '理解' : 'Understanding', color: '#eab308' }
    if (pct >= 20) return { label: lang === 'zh' ? '入门' : 'Beginner', color: '#f97316' }
    return { label: lang === 'zh' ? '起步' : 'Starting', color: '#94a3b8' }
  }
  
  const level = getLevel(percentage)
  
  const gaugeData = [
    { name: 'value', value: percentage },
    { name: 'empty', value: 100 - percentage }
  ]

  return (
    <div className="card text-center">
      <h3 className="font-semibold mb-2 flex items-center justify-center gap-2">
        <span>🧠</span>
        {lang === 'zh' ? '理解深度' : 'Understanding Depth'}
      </h3>
      <div className="relative">
        <ResponsiveContainer width="100%" height={120}>
          <PieChart>
            <Pie
              data={gaugeData}
              cx="50%"
              cy="100%"
              startAngle={180}
              endAngle={0}
              innerRadius={60}
              outerRadius={80}
              paddingAngle={0}
              dataKey="value"
            >
              <Cell fill={level.color} />
              <Cell fill="var(--bg-secondary)" />
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2">
          <div className="text-2xl font-bold" style={{ color: level.color }}>{percentage}%</div>
          <div className="text-sm font-medium" style={{ color: level.color }}>{level.label}</div>
        </div>
      </div>
      <p className="text-xs text-[var(--text-secondary)] mt-2">
        {lang === 'zh' 
          ? `已探索 ${answeredQuestions}/${totalQuestions} 个问题` 
          : `Explored ${answeredQuestions}/${totalQuestions} questions`}
      </p>
    </div>
  )
}

interface PhaseBarChartProps {
  responses: Record<string, string>
  currentPhase: number
  lang: Language
}

// 各阶段完成度柱状图
export function PhaseBarChart({ responses, currentPhase, lang }: PhaseBarChartProps) {
  const data = LEARNING_PHASES.map((phase, idx) => {
    const phaseResponses = Object.keys(responses).filter(k => k.startsWith(phase.id))
    const totalPrompts = phase.promptCount
    const completed = Math.min(phaseResponses.length, totalPrompts)
    
    return {
      name: phase.icon,
      fullName: t(lang, `phases.${phase.id}.subtitle`),
      completed,
      total: totalPrompts,
      isCurrent: idx === currentPhase
    }
  })

  return (
    <div className="card">
      <h3 className="font-semibold mb-4 flex items-center gap-2">
        <span>📈</span>
        {lang === 'zh' ? '阶段完成度' : 'Phase Completion'}
      </h3>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data} layout="vertical">
          <XAxis type="number" domain={[0, 4]} tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} />
          <YAxis 
            type="category" 
            dataKey="name" 
            tick={{ fontSize: 16 }}
            width={30}
          />
          <Tooltip 
            content={({ active, payload }) => {
              if (active && payload && payload.length) {
                const data = payload[0].payload
                return (
                  <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-2 text-sm">
                    <p className="font-medium">{data.fullName}</p>
                    <p className="text-[var(--text-secondary)]">
                      {data.completed}/{data.total} {lang === 'zh' ? '已完成' : 'completed'}
                    </p>
                  </div>
                )
              }
              return null
            }}
          />
          <Bar 
            dataKey="completed" 
            fill="var(--accent)"
            radius={[0, 4, 4, 0]}
            background={{ fill: 'var(--bg-secondary)' }}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

interface LearningStatsProps {
  responses: Record<string, string>
  currentPhase: number
  lang: Language
}

// 统计卡片组
export function LearningStats({ responses, currentPhase, lang }: LearningStatsProps) {
  const totalQuestions = LEARNING_PHASES.reduce((sum, p) => sum + p.promptCount, 0)
  const answeredQuestions = Object.keys(responses).filter(k => !k.includes('custom')).length
  const customQuestions = Object.keys(responses).filter(k => k.includes('custom')).length
  const completedPhases = currentPhase

  const stats = [
    {
      icon: '📚',
      value: completedPhases,
      label: lang === 'zh' ? '已完成阶段' : 'Phases Done',
      color: '#22c55e'
    },
    {
      icon: '💡',
      value: answeredQuestions,
      label: lang === 'zh' ? '探索问题数' : 'Questions Explored',
      color: '#3b82f6'
    },
    {
      icon: '❓',
      value: customQuestions,
      label: lang === 'zh' ? '自定义提问' : 'Custom Questions',
      color: '#8b5cf6'
    },
    {
      icon: '🎯',
      value: `${Math.round((answeredQuestions / totalQuestions) * 100)}%`,
      label: lang === 'zh' ? '完成率' : 'Completion',
      color: '#f59e0b'
    }
  ]

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
      {stats.map((stat, idx) => (
        <div key={idx} className="card text-center py-4">
          <div className="text-2xl mb-1">{stat.icon}</div>
          <div className="text-2xl font-bold" style={{ color: stat.color }}>{stat.value}</div>
          <div className="text-xs text-[var(--text-secondary)]">{stat.label}</div>
        </div>
      ))}
    </div>
  )
}
