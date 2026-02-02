'use client'

import { useRef, useState, useEffect, useCallback, useMemo } from 'react'

interface VirtualListProps<T> {
  items: T[]
  renderItem: (item: T, index: number) => React.ReactNode
  itemHeight: number | ((item: T, index: number) => number)
  height: number
  overscan?: number
  className?: string
  onEndReached?: () => void
  endReachedThreshold?: number
}

export function VirtualList<T>({
  items,
  renderItem,
  itemHeight,
  height,
  overscan = 3,
  className = '',
  onEndReached,
  endReachedThreshold = 200
}: VirtualListProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [containerHeight, setContainerHeight] = useState(height)

  // 计算每个项目的高度
  const getItemHeight = useCallback((item: T, index: number) => {
    return typeof itemHeight === 'function' ? itemHeight(item, index) : itemHeight
  }, [itemHeight])

  // 计算所有项目的位置信息
  const itemPositions = useMemo(() => {
    let currentOffset = 0
    return items.map((item, index) => {
      const height = getItemHeight(item, index)
      const position = { offset: currentOffset, height }
      currentOffset += height
      return position
    })
  }, [items, getItemHeight])

  // 总高度
  const totalHeight = itemPositions[itemPositions.length - 1]?.offset +
                      itemPositions[itemPositions.length - 1]?.height || 0

  // 计算可见范围
  const { startIndex, endIndex, offsetY } = useMemo(() => {
    let start = 0
    let end = items.length - 1
    let offset = 0

    for (let i = 0; i < items.length; i++) {
      const itemBottom = itemPositions[i].offset + itemPositions[i].height

      if (itemBottom <= scrollTop) {
        start = i + 1
        offset = itemBottom
      } else if (itemPositions[i].offset < scrollTop + containerHeight) {
        end = i
      } else {
        break
      }
    }

    // 添加 overscan
    start = Math.max(0, start - overscan)
    end = Math.min(items.length - 1, end + overscan)

    return { startIndex: start, endIndex: end, offsetY: offset }
  }, [scrollTop, itemPositions, items.length, containerHeight, overscan])

  // 检查是否滚动到底部
  useEffect(() => {
    if (!onEndReached) return

    const isNearBottom = totalHeight - scrollTop - containerHeight < endReachedThreshold
    if (isNearBottom && items.length > 0) {
      onEndReached()
    }
  }, [scrollTop, totalHeight, containerHeight, onEndReached, endReachedThreshold, items.length])

  // 处理滚动
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop)
  }, [])

  // 可见项目
  const visibleItems = items.slice(startIndex, endIndex + 1)

  return (
    <div
      ref={containerRef}
      className={`overflow-auto ${className}`}
      style={{ height: containerHeight }}
      onScroll={handleScroll}
    >
      <div
        style={{
          height: totalHeight,
          position: 'relative'
        }}
      >
        {visibleItems.map((item, i) => {
          const actualIndex = startIndex + i
          const position = itemPositions[actualIndex]

          return (
            <div
              key={actualIndex}
              style={{
                position: 'absolute',
                top: position.offset,
                left: 0,
                right: 0,
                height: position.height
              }}
            >
              {renderItem(item, actualIndex)}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/**
 * 简化版本的虚拟列表（适用于固定高度）
 */
interface SimpleVirtualListProps<T> {
  items: T[]
  renderItem: (item: T, index: number) => React.ReactNode
  itemHeight: number
  visibleCount: number
  className?: string
}

export function SimpleVirtualList<T>({
  items,
  renderItem,
  itemHeight,
  visibleCount,
  className = ''
}: SimpleVirtualListProps<T>) {
  const [scrollTop, setScrollTop] = useState(0)

  const totalHeight = items.length * itemHeight
  const containerHeight = visibleCount * itemHeight

  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - 1)
  const endIndex = Math.min(
    items.length - 1,
    startIndex + visibleCount + 2
  )

  const offsetY = startIndex * itemHeight

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop)
  }, [])

  return (
    <div
      className={`overflow-auto ${className}`}
      style={{ height: containerHeight }}
      onScroll={handleScroll}
    >
      <div
        style={{
          height: totalHeight,
          position: 'relative'
        }}
      >
        {items.slice(startIndex, endIndex + 1).map((item, i) => (
          <div
            key={startIndex + i}
            style={{
              position: 'absolute',
              top: (startIndex + i) * itemHeight - offsetY,
              left: 0,
              right: 0,
              height: itemHeight
            }}
          >
            {renderItem(item, startIndex + i)}
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * Hook: 虚拟滚动状态
 */
export function useVirtualScroll(options: {
  itemCount: number
  itemHeight: number
  containerHeight: number
  overscan?: number
}) {
  const { itemCount, itemHeight, containerHeight, overscan = 3 } = options
  const [scrollTop, setScrollTop] = useState(0)

  const totalHeight = itemCount * itemHeight

  const visibleRange = useMemo(() => {
    const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan)
    const endIndex = Math.min(
      itemCount - 1,
      Math.ceil((scrollTop + containerHeight) / itemHeight) + overscan
    )

    return { startIndex, endIndex, visibleCount: endIndex - startIndex + 1 }
  }, [scrollTop, itemHeight, containerHeight, itemCount, overscan])

  return {
    scrollTop,
    setScrollTop,
    totalHeight,
    ...visibleRange
  }
}
