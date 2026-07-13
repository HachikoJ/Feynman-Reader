'use client'

import { useState, useEffect } from 'react'
import { Language } from '@/lib/i18n'
import {
  getReadingOverview,
  getRecentStats,
  getPeriodStats,
  getReadingStreak,
  dailyCheckIn,
  needsCheckIn,
  getReadingGoal,
  setReadingGoal,
  clearReadingGoal,
  type DailyStats
} from '@/lib/readingProgress'
import AppIcon from './AppIcon'

interface Props {
  lang: Language
}

const messages = {
  zh: {
    title: '阅读统计',
    overview: '阅读总览',
    today: '今日进度',
    weekly: '本周统计',
    monthly: '本月统计',
    goal: '阅读目标',
    streak: '连续打卡',
    days: '天',
    books: '本',
    pages: '页',
    minutes: '分钟',
    sessions: '次学习',
    setGoal: '设置目标',
    checkIn: '每日打卡',
    checkedIn: '已打卡',
    totalBooks: '总书籍数',
    completedBooks: '已完成',
    totalPagesRead: '总阅读页数',
    totalMinutesRead: '总阅读时长',
    longestStreak: '最长连续',
    todayProgress: '今日目标进度',
    pagesGoal: '每日页数目标',
    minutesGoal: '每日分钟目标',
    save: '保存',
    cancel: '取消',
    clear: '清除目标',
    goalSetSuccess: '目标设置成功！',
    goalCleared: '目标已清除',
    checkInSuccess: '打卡成功！',
    alreadyCheckedIn: '今天已经打过卡了',
    avgPerDay: '日均',
    recent7Days: '最近7天',
    recent30Days: '最近30天',
    noData: '暂无数据',
    mon: '一',
    tue: '二',
    wed: '三',
    thu: '四',
    fri: '五',
    sat: '六',
    sun: '日'
  },
  en: {
    title: 'Reading Statistics',
    overview: 'Overview',
    today: 'Today\'s Progress',
    weekly: 'This Week',
    monthly: 'This Month',
    goal: 'Reading Goal',
    streak: 'Streak',
    days: 'days',
    books: 'books',
    pages: 'pages',
    minutes: 'minutes',
    sessions: 'sessions',
    setGoal: 'Set Goal',
    checkIn: 'Check In',
    checkedIn: 'Checked In',
    totalBooks: 'Total Books',
    completedBooks: 'Completed',
    totalPagesRead: 'Pages Read',
    totalMinutesRead: 'Reading Time',
    longestStreak: 'Longest Streak',
    todayProgress: 'Today\'s Goal Progress',
    pagesGoal: 'Daily Pages Goal',
    minutesGoal: 'Daily Minutes Goal',
    save: 'Save',
    cancel: 'Cancel',
    clear: 'Clear Goal',
    goalSetSuccess: 'Goal set successfully!',
    goalCleared: 'Goal cleared',
    checkInSuccess: 'Checked in successfully!',
    alreadyCheckedIn: 'Already checked in today',
    avgPerDay: 'Avg/Day',
    recent7Days: 'Recent 7 Days',
    recent30Days: 'Recent 30 Days',
    noData: 'No Data',
    mon: 'M',
    tue: 'T',
    wed: 'W',
    thu: 'T',
    fri: 'F',
    sat: 'S',
    sun: 'S'
  }
}

export default function ReadingProgressPanel({ lang }: Props) {
  const t = messages[lang] || messages.zh
  const [mounted, setMounted] = useState(false)
  const [showGoalModal, setShowGoalModal] = useState(false)
  const [pagesGoal, setPagesGoal] = useState(30)
  const [minutesGoal, setMinutesGoal] = useState(60)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)

  // Statistics
  const [overview, setOverview] = useState(getReadingOverview())
  const [streak, setStreak] = useState(getReadingStreak())
  const [recentStats, setRecentStats] = useState<DailyStats[]>([])
  const [weeklyStats, setWeeklyStats] = useState(getPeriodStats('week'))
  const [monthlyStats, setMonthlyStats] = useState(getPeriodStats('month'))
  const [needsCheckInToday, setNeedsCheckInToday] = useState(needsCheckIn())
  const [currentGoal, setCurrentGoal] = useState(getReadingGoal())

  useEffect(() => {
    setMounted(true)
    loadData()
  }, [])

  const loadData = () => {
    setOverview(getReadingOverview())
    setStreak(getReadingStreak())
    setRecentStats(getRecentStats(7))
    setWeeklyStats(getPeriodStats('week'))
    setMonthlyStats(getPeriodStats('month'))
    setNeedsCheckInToday(needsCheckIn())
    setCurrentGoal(getReadingGoal())
  }

  const handleCheckIn = () => {
    const result = dailyCheckIn()
    setStatusMessage(result.message)
    setNeedsCheckInToday(false)
    loadData()
    setTimeout(() => setStatusMessage(null), 3000)
  }

  const handleSaveGoal = () => {
    setReadingGoal({
      targetPagesPerDay: pagesGoal,
      targetMinutesPerDay: minutesGoal,
      targetBooksPerMonth: 2,
      startDate: Date.now()
    })
    setStatusMessage(t.goalSetSuccess)
    setShowGoalModal(false)
    loadData()
    setTimeout(() => setStatusMessage(null), 3000)
  }

  const handleClearGoal = () => {
    clearReadingGoal()
    setStatusMessage(t.goalCleared)
    setShowGoalModal(false)
    loadData()
    setTimeout(() => setStatusMessage(null), 3000)
  }

  if (!mounted) return null

  // Calculate max value for chart scaling
  const maxPages = Math.max(...recentStats.map(s => s.pagesRead), 10)
  const maxMinutes = Math.max(...recentStats.map(s => s.minutesRead), 60)

  // Get weekday labels
  const weekDays = [t.sun, t.mon, t.tue, t.wed, t.thu, t.fri, t.sat]
  const getWeekDay = (dateStr: string) => {
    const date = new Date(dateStr)
    return weekDays[date.getDay()]
  }

  return (
    <div className="space-y-6">
      {statusMessage && (
        <div role="status" className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300 animate-fade-in">
          {statusMessage}
        </div>
      )}

      {/* Overview Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card p-4 text-center">
          <div className="text-3xl mb-2">{overview.totalBooks}</div>
          <div className="text-xs text-[var(--text-secondary)]">{t.totalBooks}</div>
        </div>
        <div className="card p-4 text-center">
          <div className="text-3xl mb-2 text-green-400">{overview.completedBooks}</div>
          <div className="text-xs text-[var(--text-secondary)]">{t.completedBooks}</div>
        </div>
        <div className="card p-4 text-center">
          <div className="text-3xl mb-2 text-blue-400">{overview.totalPagesRead}</div>
          <div className="text-xs text-[var(--text-secondary)]">{t.pages}</div>
        </div>
        <div className="card p-4 text-center">
          <div className="text-3xl mb-2 text-purple-400">
            {Math.round(overview.totalMinutesRead / 60)}h
          </div>
          <div className="text-xs text-[var(--text-secondary)]">{t.totalMinutesRead}</div>
        </div>
      </div>

      {/* Streak Card */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold">{t.streak}</h3>
          {!needsCheckInToday ? (
            <span className="inline-flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400">
              <AppIcon name="success" tone="green" size={16} />
              {t.checkedIn}
            </span>
          ) : (
            <button onClick={handleCheckIn} className="btn-primary text-sm py-2 px-4">
              <AppIcon name="flame" size={16} />
              {t.checkIn}
            </button>
          )}
        </div>
        <div className="flex items-center gap-6">
          <div>
            <div className="text-4xl font-bold text-[var(--accent)]">{streak.currentStreak}</div>
            <div className="text-sm text-[var(--text-secondary)]">{t.days}</div>
          </div>
          <div className="flex-1">
            <div className="flex justify-between text-sm mb-2">
              <span className="text-[var(--text-secondary)]">{t.longestStreak}</span>
              <span className="font-medium">{streak.longestStreak} {t.days}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-[var(--text-secondary)]">{t.totalBooks}</span>
              <span className="font-medium">{streak.totalCheckIns} {t.days}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Today's Goal Progress */}
      {currentGoal && (
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold">{t.todayProgress}</h3>
            <button onClick={() => setShowGoalModal(true)} className="text-sm text-[var(--accent)] hover:underline">
              {t.setGoal}
            </button>
          </div>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-[var(--text-secondary)]">{t.pages}</span>
                <span>{overview.todayProgress.pagesRead} / {overview.todayProgress.pagesGoal}</span>
              </div>
              <div className="h-2 bg-[var(--bg-secondary)] rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 transition-all duration-500"
                  style={{ width: `${overview.todayProgress.pagesProgress}%` }}
                />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-[var(--text-secondary)]">{t.minutes}</span>
                <span>{overview.todayProgress.minutesRead} / {overview.todayProgress.minutesGoal}</span>
              </div>
              <div className="h-2 bg-[var(--bg-secondary)] rounded-full overflow-hidden">
                <div
                  className="h-full bg-purple-500 transition-all duration-500"
                  style={{ width: `${overview.todayProgress.minutesProgress}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Set Goal Button (when no goal) */}
      {!currentGoal && (
        <div className="card p-6 text-center">
          <p className="text-[var(--text-secondary)] mb-4">{lang === 'zh' ? '设置每日阅读目标，培养阅读习惯' : 'Set daily reading goals to build a reading habit'}</p>
          <button onClick={() => setShowGoalModal(true)} className="btn-primary">
            {t.setGoal}
          </button>
        </div>
      )}

      {/* Weekly/Monthly Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card p-4">
          <h4 className="font-medium mb-3">{t.weekly}</h4>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-[var(--text-secondary)]">{t.pages}</span>
              <span>{weeklyStats.totalPages}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-secondary)]">{t.minutes}</span>
              <span>{weeklyStats.totalMinutes}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-secondary)]">{t.avgPerDay}</span>
              <span>{weeklyStats.avgPagesPerDay} {t.pages} / {weeklyStats.avgMinutesPerDay} {t.minutes}</span>
            </div>
          </div>
        </div>
        <div className="card p-4">
          <h4 className="font-medium mb-3">{t.monthly}</h4>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-[var(--text-secondary)]">{t.pages}</span>
              <span>{monthlyStats.totalPages}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-secondary)]">{t.minutes}</span>
              <span>{monthlyStats.totalMinutes}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-secondary)]">{t.avgPerDay}</span>
              <span>{monthlyStats.avgPagesPerDay} {t.pages} / {monthlyStats.avgMinutesPerDay} {t.minutes}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Recent 7 Days Chart */}
      <div className="card p-6">
        <h4 className="font-medium mb-4">{t.recent7Days}</h4>
        <div className="flex items-end justify-between gap-2 h-32">
          {recentStats.map((stat, idx) => {
            const pagesHeight = stat.pagesRead > 0 ? Math.max((stat.pagesRead / maxPages) * 80, 5) : 2
            const minutesHeight = stat.minutesRead > 0 ? Math.max((stat.minutesRead / maxMinutes) * 80, 5) : 2
            const isToday = stat.date === new Date().toISOString().split('T')[0]

            return (
              <div key={stat.date} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full flex flex-col items-center">
                  {/* Pages bar */}
                  <div
                    className={`w-full rounded-t transition-all duration-300 ${isToday ? 'bg-blue-500' : 'bg-blue-500/50'}`}
                    style={{ height: `${pagesHeight}%` }}
                    title={`${stat.pagesRead} ${t.pages}`}
                  />
                  {/* Minutes bar */}
                  <div
                    className={`w-full rounded-b transition-all duration-300 ${isToday ? 'bg-purple-500' : 'bg-purple-500/50'}`}
                    style={{ height: `${minutesHeight}%` }}
                    title={`${stat.minutesRead} ${t.minutes}`}
                  />
                </div>
                <span className={`text-xs ${isToday ? 'text-[var(--accent)] font-medium' : 'text-[var(--text-secondary)]'}`}>
                  {getWeekDay(stat.date)}
                </span>
              </div>
            )
          })}
        </div>
        <div className="flex items-center justify-center gap-6 mt-4 text-xs text-[var(--text-secondary)]">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-blue-500 rounded" />
            <span>{t.pages}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-purple-500 rounded" />
            <span>{t.minutes}</span>
          </div>
        </div>
      </div>

      {/* Goal Setting Modal */}
      {showGoalModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="card max-w-md w-full p-6">
            <h3 className="text-xl font-bold mb-4">{t.setGoal}</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-[var(--text-secondary)] mb-2">
                  {t.pagesGoal}
                </label>
                <input
                  type="number"
                  value={pagesGoal}
                  onChange={(e) => setPagesGoal(Number(e.target.value))}
                  className="w-full px-4 py-2 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)] focus:outline-none focus:border-[var(--accent)]"
                  min={1}
                  max={1000}
                />
              </div>
              <div>
                <label className="block text-sm text-[var(--text-secondary)] mb-2">
                  {t.minutesGoal}
                </label>
                <input
                  type="number"
                  value={minutesGoal}
                  onChange={(e) => setMinutesGoal(Number(e.target.value))}
                  className="w-full px-4 py-2 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)] focus:outline-none focus:border-[var(--accent)]"
                  min={1}
                  max={480}
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              {currentGoal && (
                <button onClick={handleClearGoal} className="btn-secondary flex-1">
                  {t.clear}
                </button>
              )}
              <button onClick={() => setShowGoalModal(false)} className="btn-secondary flex-1">
                {t.cancel}
              </button>
              <button onClick={handleSaveGoal} className="btn-primary flex-1">
                {t.save}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
