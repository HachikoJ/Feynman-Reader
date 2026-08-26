'use client'

import { useMemo } from 'react'
import { Language } from '@/lib/i18n'
import { calculateScoreTrend, getTrendDescription, ProgressRecord } from '@/lib/practiceEnhancement'
import AppIcon, { AppIconName, AppIconTone } from './AppIcon'

interface Props {
  records: ProgressRecord[]
  lang: Language
  compact?: boolean
  embedded?: boolean
}

export default function ScoreTrendChart({ records, lang, compact = false, embedded = false }: Props) {
  const trend = useMemo(() => calculateScoreTrend(records), [records])

  if (records.length === 0) {
    return (
      <div className={`bg-[var(--bg-secondary)] rounded-xl p-4 text-center ${compact || embedded ? '' : 'card'}`}>
        <AppIcon name="chart" tone="blue" size={36} className="mx-auto mb-2" />
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
  const chartXPadding = 4
  const chartTopPadding = 18
  const chartBottomPadding = 6
  const plotHeight = chartHeight - chartTopPadding - chartBottomPadding
  const chartBottom = chartHeight - chartBottomPadding

  const getPointX = (idx: number) => {
    if (scores.length === 1) return 50
    return chartXPadding + (idx / (scores.length - 1)) * (100 - chartXPadding * 2)
  }

  const getPointY = (score: number) => {
    return chartTopPadding + (1 - (score - minScore) / range) * plotHeight
  }

  // 生成 SVG 路径
  const generatePath = () => {
    if (scores.length === 0) return ''

    const points = scores.map((score, idx) => {
      const x = getPointX(idx)
      const y = getPointY(score)
      return `${x},${y}`
    })

    return `M ${points.join(' L ')}`
  }

  // 生成填充区域
  const generateAreaPath = () => {
    const linePath = generatePath()
    if (!linePath) return ''
    return `${linePath} L ${getPointX(scores.length - 1)},${chartBottom} L ${getPointX(0)},${chartBottom} Z`
  }

  // 获取趋势颜色
  const getTrendColor = () => {
    if (trend.improvement > 20) return '#22c55e' // green
    if (trend.improvement > 0) return '#3b82f6' // blue
    if (trend.improvement < -10) return '#ef4444' // red
    return '#f59e0b' // yellow
  }

  // 获取趋势图标
  const getTrendIcon = (): { name: AppIconName; tone: AppIconTone } => {
    if (trend.improvement > 20) return { name: 'rocket', tone: 'green' }
    if (trend.improvement > 0) return { name: 'trendUp', tone: 'blue' }
    if (trend.improvement < -10) return { name: 'trendDown', tone: 'red' }
    return { name: 'arrowRight', tone: 'amber' }
  }

  const trendColor = getTrendColor()

  if (compact) {
    return (
      <div className="bg-[var(--bg-secondary)] rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="flex items-center gap-2 font-semibold text-sm">
            <AppIcon name="chart" tone="blue" size={16} />
            {lang === 'zh' ? '进步追踪' : 'Progress'}
          </h4>
          <div className="flex items-center gap-1 text-sm">
            <AppIcon {...getTrendIcon()} size={16} />
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
    <div className={embedded ? '' : 'card'}>
      <h3 className="flex items-center gap-2 text-xl font-bold mb-4">
        <AppIcon name="chart" tone="blue" size={22} />
        {lang === 'zh' ? '进步追踪' : 'Progress Tracking'}
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
          <div className="flex h-8 items-center justify-center">
            <AppIcon {...getTrendIcon()} size={24} />
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
        <div data-testid="score-trend-plot" className="relative" style={{ height: chartHeight }}>
          <svg
            viewBox={`0 0 100 ${chartHeight}`}
            preserveAspectRatio="none"
            className="absolute inset-0 h-full w-full overflow-visible"
          >
            {/* 网格线 */}
            {[0, 25, 50, 75, 100].map(level => (
              <line
                key={level}
                x1={chartXPadding}
                y1={getPointY(level)}
                x2={100 - chartXPadding}
                y2={getPointY(level)}
                stroke="var(--border)"
                strokeWidth="0.5"
                strokeDasharray="4,4"
                vectorEffect="non-scaling-stroke"
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
              vectorEffect="non-scaling-stroke"
            />
          </svg>

          {/* Keep labels and markers outside the non-uniformly scaled SVG. */}
          {scores.map((score, idx) => {
            const x = getPointX(idx)
            const y = getPointY(score)
            const isLast = idx === scores.length - 1
            const isBest = score === trend.best
            const markerSize = isLast ? 8 : isBest ? 6 : 4

            return (
              <div
                key={idx}
                data-testid="score-point"
                className="pointer-events-none absolute"
                style={{ left: `${x}%`, top: y, transform: 'translate(-50%, -50%)' }}
              >
                {isLast && (
                  <span
                    data-testid="latest-score-label"
                    className="absolute bottom-full left-1/2 mb-1 -translate-x-1/2 whitespace-nowrap text-sm font-bold leading-none text-[var(--text-primary)]"
                  >
                    {score}
                  </span>
                )}
                <span
                  className="block rounded-full"
                  style={{
                    width: markerSize,
                    height: markerSize,
                    backgroundColor: isBest ? '#22c55e' : isLast ? trendColor : 'var(--text-secondary)'
                  }}
                />
              </div>
            )
          })}
        </div>

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
        <div className="flex items-start gap-3">
          <AppIcon {...getTrendIcon()} size={20} />
          <pre className="text-sm whitespace-pre-wrap font-sans">
            {getTrendDescription(trend, lang)}
          </pre>
        </div>
      </div>

      {/* 练习记录列表 */}
      {records.length > 1 && (
        <details className="mt-4">
          <summary className="cursor-pointer text-sm text-[var(--accent)]">
            <span className="inline-flex items-center gap-2">
              <AppIcon name="clipboard" tone="accent" size={16} />
              {lang === 'zh' ? '查看所有记录' : 'View all records'}
            </span>
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
                      <span className="inline-flex items-center gap-1" title={lang === 'zh' ? '准确度' : 'Accuracy'}>
                        <AppIcon name="target" tone="blue" size={14} /> {record.scores.accuracy}
                      </span>
                      <span className="inline-flex items-center gap-1" title={lang === 'zh' ? '完整度' : 'Completeness'}>
                        <AppIcon name="note" tone="green" size={14} /> {record.scores.completeness}
                      </span>
                      <span className="inline-flex items-center gap-1" title={lang === 'zh' ? '清晰度' : 'Clarity'}>
                        <AppIcon name="message" tone="violet" size={14} /> {record.scores.clarity}
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
