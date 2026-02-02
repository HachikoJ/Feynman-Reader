'use client'

import { getBooks, getBook, updateBook } from './store'

// ========================================
// Types
// ========================================

export interface ReadingProgress {
  currentPage: number        // 当前页码
  totalPages: number         // 总页数
  percentage: number         // 阅读百分比 (0-100)
}

export interface ReadingSession {
  id: string
  bookId: string
  startTime: number          // 开始时间戳
  endTime?: number           // 结束时间戳
  duration: number           // 阅读时长（秒）
  pagesRead: number          // 阅读页数
  phase?: string             // 学习阶段
}

export interface ReadingGoal {
  id: string
  targetPagesPerDay: number  // 每日目标页数
  targetMinutesPerDay: number // 每日目标分钟数
  targetBooksPerMonth: number // 每月目标书籍数
  startDate: number          // 目标开始时间
  endDate?: number           // 目标结束时间
}

export interface DailyStats {
  date: string               // YYYY-MM-DD 格式
  pagesRead: number          // 当天阅读页数
  minutesRead: number        // 当天阅读分钟数
  booksRead: number          // 当天完成的书籍数
  sessionsCompleted: number  // 当天完成的学习会话数
}

export interface ReadingStreak {
  currentStreak: number      // 当前连续打卡天数
  longestStreak: number      // 最长连续打卡天数
  lastCheckInDate: string    // 最后一次打卡日期 (YYYY-MM-DD)
  totalCheckIns: number      // 总打卡次数
}

// ========================================
// Storage Keys
// ========================================

const READING_GOALS_KEY = 'feynman-reading-goals'
const DAILY_STATS_KEY = 'feynman-daily-stats'
const READING_STREAK_KEY = 'feynman-reading-streak'
const READING_SESSIONS_KEY = 'feynman-reading-sessions'

// ========================================
// Reading Progress
// ========================================

/**
 * 更新书籍阅读进度
 */
export function updateReadingProgress(
  bookId: string,
  currentPage: number,
  totalPages: number
): void {
  const book = getBook(bookId)
  if (!book) return

  const percentage = totalPages > 0 ? Math.round((currentPage / totalPages) * 100) : 0

  updateBook(bookId, {
    readingProgress: {
      currentPage,
      totalPages,
      percentage
    }
  })
}

/**
 * 获取书籍阅读进度
 */
export function getReadingProgress(bookId: string): ReadingProgress | null {
  const book = getBook(bookId)
  return book?.readingProgress || null
}

// ========================================
// Reading Sessions
// ========================================

/**
 * 开始阅读会话
 */
export function startReadingSession(bookId: string, phase?: string): string {
  const sessions = getReadingSessions()
  const session: ReadingSession = {
    id: Date.now().toString(),
    bookId,
    startTime: Date.now(),
    duration: 0,
    pagesRead: 0,
    phase
  }
  sessions.push(session)
  saveReadingSessions(sessions)

  // 更新每日统计 - 开始新的会话
  updateDailyStats({
    sessionsCompleted: 1
  })

  return session.id
}

/**
 * 结束阅读会话
 */
export function endReadingSession(
  sessionId: string,
  pagesRead: number
): ReadingSession | null {
  const sessions = getReadingSessions()
  const sessionIndex = sessions.findIndex(s => s.id === sessionId)

  if (sessionIndex === -1) return null

  const session = sessions[sessionIndex]
  const endTime = Date.now()
  const duration = Math.round((endTime - session.startTime) / 1000) // 秒

  sessions[sessionIndex] = {
    ...session,
    endTime,
    duration,
    pagesRead
  }

  saveReadingSessions(sessions)

  // 更新每日统计
  updateDailyStats({
    pagesRead,
    minutesRead: Math.round(duration / 60)
  })

  return sessions[sessionIndex]
}

/**
 * 获取所有阅读会话
 */
export function getReadingSessions(): ReadingSession[] {
  if (typeof window === 'undefined') return []
  const saved = localStorage.getItem(READING_SESSIONS_KEY)
  if (!saved) return []
  try {
    return JSON.parse(saved)
  } catch {
    return []
  }
}

/**
 * 获取书籍的阅读会话
 */
export function getBookReadingSessions(bookId: string): ReadingSession[] {
  const sessions = getReadingSessions()
  return sessions.filter(s => s.bookId === bookId).sort((a, b) => b.startTime - a.startTime)
}

/**
 * 保存阅读会话
 */
function saveReadingSessions(sessions: ReadingSession[]): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(READING_SESSIONS_KEY, JSON.stringify(sessions))
}

/**
 * 删除旧的阅读会话（超过30天）
 */
export function cleanupOldSessions(daysToKeep = 30): void {
  const sessions = getReadingSessions()
  const cutoffTime = Date.now() - (daysToKeep * 24 * 60 * 60 * 1000)
  const filtered = sessions.filter(s => s.startTime > cutoffTime)
  saveReadingSessions(filtered)
}

// ========================================
// Reading Goals
// ========================================

/**
 * 获取阅读目标
 */
export function getReadingGoal(): ReadingGoal | null {
  if (typeof window === 'undefined') return null
  const saved = localStorage.getItem(READING_GOALS_KEY)
  if (!saved) return null
  try {
    return JSON.parse(saved)
  } catch {
    return null
  }
}

/**
 * 设置阅读目标
 */
export function setReadingGoal(goal: Omit<ReadingGoal, 'id'>): ReadingGoal {
  const newGoal: ReadingGoal = {
    id: Date.now().toString(),
    ...goal
  }
  localStorage.setItem(READING_GOALS_KEY, JSON.stringify(newGoal))
  return newGoal
}

/**
 * 更新阅读目标
 */
export function updateReadingGoal(updates: Partial<ReadingGoal>): void {
  const goal = getReadingGoal()
  if (!goal) return
  const updated = { ...goal, ...updates }
  localStorage.setItem(READING_GOALS_KEY, JSON.stringify(updated))
}

/**
 * 清除阅读目标
 */
export function clearReadingGoal(): void {
  localStorage.removeItem(READING_GOALS_KEY)
}

/**
 * 检查今日目标完成情况
 */
export function checkDailyGoalProgress(): {
  pagesRead: number
  pagesGoal: number
  pagesProgress: number
  minutesRead: number
  minutesGoal: number
  minutesProgress: number
  allGoalsMet: boolean
} {
  const goal = getReadingGoal()
  const today = getTodayDateString()
  const stats = getDailyStats()

  const todayStats = stats[today] || { pagesRead: 0, minutesRead: 0 }

  const pagesGoal = goal?.targetPagesPerDay || 0
  const minutesGoal = goal?.targetMinutesPerDay || 0

  const pagesProgress = pagesGoal > 0 ? Math.min(todayStats.pagesRead / pagesGoal, 1) : 0
  const minutesProgress = minutesGoal > 0 ? Math.min(todayStats.minutesRead / minutesGoal, 1) : 0

  const allGoalsMet = pagesGoal > 0 && minutesGoal > 0 &&
    todayStats.pagesRead >= pagesGoal &&
    todayStats.minutesRead >= minutesGoal

  return {
    pagesRead: todayStats.pagesRead,
    pagesGoal,
    pagesProgress: Math.round(pagesProgress * 100),
    minutesRead: todayStats.minutesRead,
    minutesGoal,
    minutesProgress: Math.round(minutesProgress * 100),
    allGoalsMet
  }
}

// ========================================
// Daily Statistics
// ========================================

/**
 * 获取今日日期字符串 (YYYY-MM-DD)
 */
function getTodayDateString(): string {
  return new Date().toISOString().split('T')[0]
}

/**
 * 获取所有每日统计
 */
export function getDailyStats(): Record<string, DailyStats> {
  if (typeof window === 'undefined') return {}
  const saved = localStorage.getItem(DAILY_STATS_KEY)
  if (!saved) return {}
  try {
    return JSON.parse(saved)
  } catch {
    return {}
  }
}

/**
 * 获取今日统计
 */
export function getTodayStats(): DailyStats {
  const today = getTodayDateString()
  const stats = getDailyStats()
  return stats[today] || {
    date: today,
    pagesRead: 0,
    minutesRead: 0,
    booksRead: 0,
    sessionsCompleted: 0
  }
}

/**
 * 更新每日统计
 */
export function updateDailyStats(updates: Partial<DailyStats>): void {
  const today = getTodayDateString()
  const stats = getDailyStats()

  const current = stats[today] || {
    date: today,
    pagesRead: 0,
    minutesRead: 0,
    booksRead: 0,
    sessionsCompleted: 0
  }

  stats[today] = {
    ...current,
    pagesRead: current.pagesRead + (updates.pagesRead || 0),
    minutesRead: current.minutesRead + (updates.minutesRead || 0),
    booksRead: current.booksRead + (updates.booksRead || 0),
    sessionsCompleted: current.sessionsCompleted + (updates.sessionsCompleted || 0)
  }

  localStorage.setItem(DAILY_STATS_KEY, JSON.stringify(stats))
}

/**
 * 获取最近N天的统计数据
 */
export function getRecentStats(days = 7): DailyStats[] {
  const stats = getDailyStats()
  const result: DailyStats[] = []

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date()
    date.setDate(date.getDate() - i)
    const dateStr = date.toISOString().split('T')[0]
    result.push(stats[dateStr] || {
      date: dateStr,
      pagesRead: 0,
      minutesRead: 0,
      booksRead: 0,
      sessionsCompleted: 0
    })
  }

  return result
}

/**
 * 获取周/月汇总统计
 */
export function getPeriodStats(period: 'week' | 'month'): {
  totalPages: number
  totalMinutes: number
  totalBooks: number
  totalSessions: number
  avgPagesPerDay: number
  avgMinutesPerDay: number
} {
  const days = period === 'week' ? 7 : 30
  const recentStats = getRecentStats(days)

  const totalPages = recentStats.reduce((sum, s) => sum + s.pagesRead, 0)
  const totalMinutes = recentStats.reduce((sum, s) => sum + s.minutesRead, 0)
  const totalBooks = recentStats.reduce((sum, s) => sum + s.booksRead, 0)
  const totalSessions = recentStats.reduce((sum, s) => sum + s.sessionsCompleted, 0)

  return {
    totalPages,
    totalMinutes,
    totalBooks,
    totalSessions,
    avgPagesPerDay: Math.round(totalPages / days),
    avgMinutesPerDay: Math.round(totalMinutes / days)
  }
}

// ========================================
// Reading Streak
// ========================================

/**
 * 获取阅读连续打卡记录
 */
export function getReadingStreak(): ReadingStreak {
  const defaultStreak: ReadingStreak = {
    currentStreak: 0,
    longestStreak: 0,
    lastCheckInDate: '',
    totalCheckIns: 0
  }

  if (typeof window === 'undefined') return defaultStreak

  const saved = localStorage.getItem(READING_STREAK_KEY)
  if (!saved) return defaultStreak

  try {
    return JSON.parse(saved)
  } catch {
    return defaultStreak
  }
}

/**
 * 保存阅读连续打卡记录
 */
function saveReadingStreak(streak: ReadingStreak): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(READING_STREAK_KEY, JSON.stringify(streak))
}

/**
 * 每日打卡
 */
export function dailyCheckIn(): {
  streak: number
  isNewRecord: boolean
  message: string
} {
  const streak = getReadingStreak()
  const today = getTodayDateString()
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  const yesterdayStr = yesterday.toISOString().split('T')[0]

  let newStreak = streak.currentStreak
  let isNewRecord = false

  if (streak.lastCheckInDate === today) {
    // 今天已经打过卡了
    return {
      streak: newStreak,
      isNewRecord: false,
      message: '今天已经打过卡了！'
    }
  }

  if (streak.lastCheckInDate === yesterdayStr) {
    // 连续打卡
    newStreak = streak.currentStreak + 1
  } else {
    // 中断了，重新开始
    newStreak = 1
  }

  if (newStreak > streak.longestStreak) {
    streak.longestStreak = newStreak
    isNewRecord = true
  }

  streak.currentStreak = newStreak
  streak.lastCheckInDate = today
  streak.totalCheckIns += 1

  saveReadingStreak(streak)

  const message = isNewRecord
    ? `打卡成功！新纪录：连续 ${newStreak} 天！`
    : `打卡成功！已连续 ${newStreak} 天`

  return {
    streak: newStreak,
    isNewRecord,
    message
  }
}

/**
 * 检查是否需要打卡（今天是否已打卡）
 */
export function needsCheckIn(): boolean {
  const streak = getReadingStreak()
  const today = getTodayDateString()
  return streak.lastCheckInDate !== today
}

/**
 * 重置打卡记录
 */
export function resetStreak(): void {
  localStorage.removeItem(READING_STREAK_KEY)
}

// ========================================
// Overview Statistics
// ========================================

/**
 * 获取阅读总览统计
 */
export function getReadingOverview(): {
  totalBooks: number
  completedBooks: number
  totalPagesRead: number
  totalMinutesRead: number
  currentStreak: number
  longestStreak: number
  todayProgress: ReturnType<typeof checkDailyGoalProgress>
} {
  const books = getBooks()
  const sessions = getReadingSessions()
  const streak = getReadingStreak()
  const todayProgress = checkDailyGoalProgress()

  const completedBooks = books.filter(b => b.status === 'finished').length
  const totalPagesRead = sessions.reduce((sum, s) => sum + s.pagesRead, 0)
  const totalMinutesRead = sessions.reduce((sum, s) => sum + Math.round(s.duration / 60), 0)

  return {
    totalBooks: books.length,
    completedBooks,
    totalPagesRead,
    totalMinutesRead,
    currentStreak: streak.currentStreak,
    longestStreak: streak.longestStreak,
    todayProgress
  }
}
