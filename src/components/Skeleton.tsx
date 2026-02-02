'use client'

import { Language } from '@/lib/i18n'

interface BaseProps {
  className?: string
  style?: React.CSSProperties
}

// 基础骨架屏
export function Skeleton({ className = '', style }: BaseProps) {
  return (
    <div
      className={`bg-[var(--bg-secondary)] rounded animate-pulse ${className}`}
      style={style}
    />
  )
}

// 书籍卡片骨架屏
interface BookCardSkeletonProps {
  lang?: Language
}

export function BookCardSkeleton({ lang }: BookCardSkeletonProps) {
  return (
    <div className="card p-0 overflow-hidden">
      {/* 封面区域 */}
      <div className="aspect-[3/4] bg-[var(--bg-secondary)] animate-pulse relative">
        {/* 状态标签 */}
        <div className="absolute top-2 left-2 px-3 py-1 rounded-lg bg-gray-600 w-16 h-6" />
        {/* 得分标签 */}
        <div className="absolute top-12 left-2 w-10 h-10 rounded-full bg-gray-600" />
      </div>

      {/* 信息区域 */}
      <div className="p-3 space-y-2">
        {/* 标题 */}
        <Skeleton className="h-4 w-3/4" />
        {/* 作者 */}
        <Skeleton className="h-3 w-1/2" />
        {/* 描述 */}
        <Skeleton className="h-3 w-full" />
        {/* 标签 */}
        <div className="flex gap-2 mt-2">
          <Skeleton className="h-5 w-12 rounded-full" />
          <Skeleton className="h-5 w-12 rounded-full" />
        </div>
        {/* 进度条 */}
        <div className="mt-2">
          <Skeleton className="h-1 w-full rounded" />
        </div>
      </div>
    </div>
  )
}

// 书架骨架屏（网格视图）
export function BookshelfGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <BookCardSkeleton key={i} />
      ))}
    </div>
  )
}

// 书架骨架屏（列表视图）
export function BookshelfListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card flex gap-4 p-3">
          {/* 封面缩略图 */}
          <Skeleton className="w-20 h-28 rounded-lg flex-shrink-0" />

          {/* 信息 */}
          <div className="flex-1 space-y-3">
            <div className="flex items-start justify-between">
              <div className="space-y-2 flex-1">
                <Skeleton className="h-5 w-48" />
                <Skeleton className="h-4 w-32" />
              </div>
              <Skeleton className="h-6 w-16 rounded-lg" />
            </div>

            <Skeleton className="h-4 w-full" />

            {/* 标签 */}
            <div className="flex gap-2">
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>

            {/* 进度 */}
            <div className="flex items-center gap-4">
              <div className="flex-1 space-y-1">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-1 w-full" />
              </div>
              <Skeleton className="h-5 w-12" />
            </div>

            {/* 按钮 */}
            <div className="flex gap-2 mt-2">
              <Skeleton className="h-8 w-20 rounded-lg" />
              <Skeleton className="h-8 w-16 rounded-lg" />
              <Skeleton className="h-8 w-16 rounded-lg" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// 统计卡片骨架屏
export function StatsSkeleton() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="card p-4 text-center">
          <div className="text-3xl mb-1 bg-[var(--bg-secondary)] w-12 h-12 mx-auto rounded animate-pulse" />
          <Skeleton className="h-7 w-16 mx-auto" />
          <Skeleton className="h-3 w-12 mx-auto mt-1" />
        </div>
      ))}
    </div>
  )
}

// 设置页面骨架屏
export function SettingsSkeleton() {
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* 标题 */}
      <Skeleton className="h-9 w-40" />

      {/* API Key */}
      <div className="card space-y-4">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-32" />
      </div>

      {/* 语言 */}
      <div className="card space-y-4">
        <Skeleton className="h-5 w-20" />
        <div className="flex gap-3">
          <Skeleton className="h-12 w-24 rounded-xl" />
          <Skeleton className="h-12 w-24 rounded-xl" />
        </div>
      </div>

      {/* 主题 */}
      <div className="card space-y-4">
        <Skeleton className="h-5 w-16" />
        <div className="flex gap-3">
          <Skeleton className="h-12 w-28 rounded-xl" />
          <Skeleton className="h-12 w-28 rounded-xl" />
          <Skeleton className="h-12 w-28 rounded-xl" />
        </div>
      </div>

      {/* 保存按钮 */}
      <Skeleton className="h-12 w-full" />
    </div>
  )
}

// 阅读页面骨架屏
export function ReadingViewSkeleton() {
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* 头部 */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-10 w-24" />
        <div className="flex gap-2">
          <Skeleton className="h-10 w-10 rounded-lg" />
          <Skeleton className="h-10 w-10 rounded-lg" />
        </div>
      </div>

      {/* 书名和作者 */}
      <div className="text-center space-y-3">
        <Skeleton className="h-8 w-64 mx-auto" />
        <Skeleton className="h-5 w-40 mx-auto" />
      </div>

      {/* 进度 */}
      <div className="card p-4 space-y-3">
        <div className="flex justify-between">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-16" />
        </div>
        <Skeleton className="h-2 w-full" />
      </div>

      {/* 阶段卡片 */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="card p-4 text-center">
            <Skeleton className="h-8 w-8 mx-auto mb-2" />
            <Skeleton className="h-4 w-16 mx-auto" />
          </div>
        ))}
      </div>

      {/* 内容区域 */}
      <div className="card p-6 space-y-4">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-1/2" />
      </div>
    </div>
  )
}

// 加载状态组件（带骨架屏）
interface LoadingStateProps {
  type: 'bookshelf' | 'settings' | 'reading' | 'stats' | 'card-grid' | 'card-list'
  count?: number
  lang?: Language
}

export function LoadingState({ type, count, lang }: LoadingStateProps) {
  switch (type) {
    case 'bookshelf':
      return (
        <>
          <StatsSkeleton />
          <BookshelfGridSkeleton count={count} />
        </>
      )
    case 'settings':
      return <SettingsSkeleton />
    case 'reading':
      return <ReadingViewSkeleton />
    case 'stats':
      return <StatsSkeleton />
    case 'card-grid':
      return <BookshelfGridSkeleton count={count} />
    case 'card-list':
      return <BookshelfListSkeleton count={count} />
    default:
      return (
        <div className="card text-center py-12">
          <div className="animate-spin text-4xl mb-4">⏳</div>
          <p className="text-[var(--text-secondary)]">加载中...</p>
        </div>
      )
  }
}

// 文本骨架屏
export function TextSkeleton({ lines = 3, className = '' }: { lines?: number; className?: string }) {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className="h-4"
          style={{ width: `${Math.max(60, 100 - i * 10)}%` }}
        />
      ))}
    </div>
  )
}

// 圆形头像骨架屏
export function AvatarSkeleton({ size = 40 }: { size?: number }) {
  return (
    <Skeleton
      className="rounded-full"
      style={{ width: size, height: size }}
    />
  )
}

// 图片骨架屏
export function ImageSkeleton({ aspectRatio = 'aspect-[3/4]', className = '' }: { aspectRatio?: string; className?: string }) {
  return (
    <div className={`bg-[var(--bg-secondary)] rounded-lg animate-pulse ${aspectRatio} ${className}`} />
  )
}

// 表格行骨架屏
export function TableRowSkeleton({ cells = 5 }: { cells?: number }) {
  return (
    <div className="flex gap-4 p-3 border-b border-[var(--border)]">
      {Array.from({ length: cells }).map((_, i) => (
        <Skeleton key={i} className="h-4 flex-1" />
      ))}
    </div>
  )
}

// 表格骨架屏
export function TableSkeleton({ rows = 5, cells = 5 }: { rows?: number; cells?: number }) {
  return (
    <div className="card p-0 overflow-hidden">
      {/* 表头 */}
      <div className="flex gap-4 p-3 bg-[var(--bg-secondary)] font-medium border-b border-[var(--border)]">
        {Array.from({ length: cells }).map((_, i) => (
          <Skeleton key={i} className="h-4 flex-1" />
        ))}
      </div>
      {/* 表格内容 */}
      <div>
        {Array.from({ length: rows }).map((_, i) => (
          <TableRowSkeleton key={i} cells={cells} />
        ))}
      </div>
    </div>
  )
}
