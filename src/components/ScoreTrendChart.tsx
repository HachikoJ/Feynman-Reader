'use client'

import { useMemo } from 'react'
import { Language } from '@/lib/i18n'
import { calculateScoreTrend, getTrendDescription, ProgressRecord } from '@/lib/practiceEnhancement'

interface Props {
  records: ProgressRecord[]
  lang: Language
  compact?: boolean
}

export default function ScoreTrendChart({ records, lang, compact = false }: Props) {
  const trend = useMemo(() => calculateScoreTrend(records), [records])

  if (records.length === 0) {
    return (
      <div className={`bg-[var(--bg-secondary)] rounded-xl p-4 text-center ${compact ? '' : 'card'}`}>
        <div className="text-4xl mb-2">📊</div>
        <p className="text-[var(--text-secondary)]">
          {lang === 'zh' ? '暂无练习记录' : 'No practice records yet'}
        </p>
      </div>
    )
  }

  const scores = records
    .filter(r => r.scores?.overall)
    .map(r => r.scores!.overall)

  const maxScore = 100
  const minScore = Math.min(...scores, 0)
  const range = maxScore - minScore || 1

  // 计算图表尺寸
  const chartHeight = compact ? 80 : 150
  const chartWidth = '100%'

  // 生成 SVG 路径
  const generatePath = () => {
    if (scores.length === 0) return ''

    const points = scores.map((score, idx) => {
      const x = (idx / (scores.length - 1 || 1)) * 100
      const y = chartHeight - ((score - minScore) / range) * chartHeight
      return `${x},${y}`
    })

    return `M ${points.join(' L ')}`
  }

  // 生成填充区域
  const generateAreaPath = () => {
    const linePath = generatePath()
    if (!linePath) return ''
    return `${linePath} L 100,${chartHeight} L 0,${chartHeight} Z`
  }

  // 获取趋势颜色
  const getTrendColor = () => {
    if (trend.improvement > 20) return '#22c55e' // green
    if (trend.improvement > 0) return '#3b82f6' // blue
    if (trend.improvement < -10) return '#ef4444' // red
    return '#f59e0b' // yellow
  }

  // 获取趋势图标
  const getTrendIcon = () => {
    if (trend.improvement > 20) return '🚀'
    if (trend.improvement > 0) return '📈'
    if (trend.improvement < -10) return '📉'
    return '➡️'
  }

  const trendColor = getTrendColor()

  if (compact) {
    return (
      <div className="bg-[var(--bg-secondary)] rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="font-semibold text-sm">
            {lang === 'zh' ? '📊 进步追踪' : '📊 Progress'}
          </h4>
          <div className="flex items-center gap-1 text-sm">
            <span>{getTrendIcon()}</span>
            <span className={trend.improvement > 0 ? 'text-green-400' : trend.improvement < -10 ? 'text-red-400' : ''}>
              {trend.current.toFixed(0)}
            </span>
            <span className="text-[var(--text-secondary)]">/ 100</span>
          </div>
        </div>

        {/* 紧凑型图表 */}
        <div className="flex items-end gap-1 h-12">
          {scores.map((score, idx) => {
            const height = ((score - minScore) / range) * 100
            const isBest = score === trend.best
            return (
              <div
                key={idx}
                className="flex-1 rounded-t transition-all hover:opacity-80"
                style={{
                  height: `${height}%`,
                  backgroundColor: isBest ? '#22c55e' : trendColor,
                  opacity: idx === scores.length - 1 ? 1 : 0.7
                }}
                title={`#${idx + 1}: ${score}分`}
              />
            )
          })}
        </div>

        <div className="flex justify-between mt-2 text-xs text-[var(--text-secondary)]">
          <span>{lang === 'zh' ? '首次' : 'First'}</span>
          <span>{lang === 'zh' ? '最近' : 'Latest'}</span>
        </div>
      </div>
    )
  }

  return (
    <div className="card">
      <h3 className="text-xl font-bold mb-4">
        {lang === 'zh' ? '📊 进步追踪' : '📊 Progress Tracking'}
      </h3>

      {/* 统计概览 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="bg-[var(--bg-secondary)] rounded-lg p-3 text-center">
          <div className={`text-2xl font-bold ${trend.improvement > 0 ? 'text-green-400' : ''}`}>
            {trend.current.toFixed(0)}
          </div>
          <div className="text-xs text-[var(--text-secondary)]">
            {lang === 'zh' ? '当前得分' : 'Current'}
          </div>
        </div>
        <div className="bg-[var(--bg-secondary)] rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-blue-400">
            {trend.best.toFixed(0)}
          </div>
          <div className="text-xs text-[var(--text-secondary)]">
            {lang === 'zh' ? '最高得分' : 'Best'}
          </div>
        </div>
        <div className="bg-[var(--bg-secondary)] rounded-lg p-3 text-center">
          <div className="text-2xl font-bold">
            {trend.average.toFixed(1)}
          </div>
          <div className="text-xs text-[var(--text-secondary)]">
            {lang === 'zh' ? '平均得分' : 'Average'}
          </div>
        </div>
        <div className="bg-[var(--bg-secondary)] rounded-lg p-3 text-center">
          <div className="text-2xl font-bold">
            {getTrendIcon()}
          </div>
          <div className="text-xs text-[var(--text-secondary)]">
            {trend.trend === 'improving' ? (lang === 'zh' ? '上升趋势' : 'Improving') :
             trend.trend === 'declining' ? (lang === 'zh' ? '下降趋势' : 'Declining') :
             (lang === 'zh' ? '保持稳定' : 'Stable')}
          </div>
        </div>
      </div>

      {/* 趋势图表 */}
      <div className="bg-[var(--bg-secondary)] rounded-xl p-4 mb-4">
        <svg
          viewBox={`0 0 100 ${chartHeight}`}
          preserveAspectRatio="none"
          style={{ width: chartWidth, height: chartHeight }}
          className="overflow-visible"
        >
          {/* 网格线 */}
          {[0, 25, 50, 75, 100].map(level => (
            <line
              key={level}
              x1="0"
              y1={chartHeight - ((level - minScore) / range) * chartHeight}
              x2="100"
              y2={chartHeight - ((level - minScore) / range) * chartHeight}
              stroke="var(--border)"
              strokeWidth="0.5"
              strokeDasharray="2,2"
            />
          ))}

          {/* 填充区域 */}
          <path
            d={generateAreaPath()}
            fill={trendColor}
            opacity="0.2"
          />

          {/* 趋势线 */}
          <path
            d={generatePath()}
            fill="none"
            stroke={trendColor}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* 数据点 */}
          {scores.map((score, idx) => {
            const x = (idx / (scores.length - 1 || 1)) * 100
            const y = chartHeight - ((score - minScore) / range) * chartHeight
            const isLast = idx === scores.length - 1
            const isBest = score === trend.best

            return (
              <g key={idx}>
                <circle
                  cx={x}
                  cy={y}
                  r={isLast ? 4 : isBest ? 3 : 2}
                  fill={isBest ? '#22c55e' : isLast ? trendColor : 'var(--text-secondary)'}
                  className="cursor-pointer hover:r-5 transition-all"
                />
                {/* 显示分数标签 */}
                {isLast && (
                  <text
                    x={x}
                    y={y - 8}
                    textAnchor="middle"
                    fontSize="8"
                    fill="var(--text-primary)"
                    fontWeight="bold"
                  >
                    {score}
                  </text>
                )}
              </g>
            )
          })}
        </svg>

        {/* X轴标签 */}
        <div className="flex justify-between mt-2 text-xs text-[var(--text-secondary)]">
          <span>{lang === 'zh' ? '第1次' : '1st'}</span>
          <span>{lang === 'zh' ? `第${scores.length}次` : `#${scores.length}`}</span>
        </div>
      </div>

      {/* 趋势描述 */}
      <div className={`rounded-lg p-4 border-2 ${
        trend.improvement > 20 ? 'border-green-500/30 bg-green-500/5' :
        trend.improvement > 0 ? 'border-blue-500/30 bg-blue-500/5' :
        trend.improvement < -10 ? 'border-red-500/30 bg-red-500/5' :
        'border-[var(--border)] bg-[var(--bg-secondary)]'
      }`}>
        <pre className="text-sm whitespace-pre-wrap font-sans">
          {getTrendDescription(trend, lang)}
        </pre>
      </div>

      {/* 练习记录列表 */}
      {records.length > 1 && (
        <details className="mt-4">
          <summary className="cursor-pointer text-sm text-[var(--accent)]">
            {lang === 'zh' ? '📋 查看所有记录' : '📋 View all records'}
          </summary>
          <div className="mt-3 space-y-2">
            {records.slice().reverse().map((record, idx) => (
              <div
                key={record.id}
                className="flex items-center justify-between bg-[var(--bg-secondary)] rounded-lg p-3"
              >
                <div className="flex items-center gap-3">
                  <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                    record.passed ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'
                  }`}>
                    {records.length - idx}
                  </span>
                  <span className="text-sm text-[var(--text-secondary)]">
                    {new Date(record.timestamp).toLocaleDateString()}
                  </span>
                </div>
                <div className="flex items-center gap-4">
                  {record.scores && (
                    <div className="flex gap-3 text-sm">
                      <span title={lang === 'zh' ? '准确度' : 'Accuracy'}>
                        🎯 {record.scores.accuracy}
                      </span>
                      <span title={lang === 'zh' ? '完整度' : 'Completeness'}>
                        📝 {record.scores.completeness}
                      </span>
                      <span title={lang === 'zh' ? '清晰度' : 'Clarity'}>
                        💬 {record.scores.clarity}
                      </span>
                    </div>
                  )}
                  <div className={`font-bold ${record.scores?.overall && record.scores.overall >= 60 ? 'text-green-400' : 'text-yellow-400'}`}>
                    {record.scores?.overall || 0}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  )
}
