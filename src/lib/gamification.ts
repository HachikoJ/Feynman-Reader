/**
 * 游戏化功能 (P3 修复)
 *
 * 成就系统、等级系统、挑战系统、学习激励
 */

import { Book } from './store'
import { logger } from './logger'

// ============================================================================
// 成就系统
// ============================================================================

/**
 * 成就类型
 */
export type AchievementType =
  | 'milestone'     // 里程碑
  | 'streak'        // 连续
  | 'explorer'      // 探索
  | 'master'       // 精通
  | 'social'       // 社交
  | 'special'      // 特殊

/**
 * 成就稀有度
 */
export type AchievementRarity =
  | 'common'       // 普通 (灰色)
  | 'uncommon'     // 罕见 (绿色)
  | 'rare'         // 稀有 (蓝色)
  | 'epic'         // 史诗 (紫色)
  | 'legendary'    // 传说 (橙色)

/**
 * 成就定义
 */
export interface Achievement {
  id: string
  name: string
  nameEn: string
  description: string
  icon: string
  type: AchievementType
  rarity: AchievementRarity
  xp: number           // 经验值奖励
  condition: (user: UserProgress) => boolean
  hidden?: boolean     // 是否隐藏成就
  secret?: string      // 隐藏成就的提示
}

/**
 * 用户已解锁的成就
 */
export interface UnlockedAchievement {
  achievementId: string
  unlockedAt: number
  progress?: number    // 进度成就的当前进度
  target?: number      // 进度成就的目标值
}

// ============================================================================
// 等级系统
// ============================================================================

/**
 * 等级配置
 */
export interface LevelConfig {
  level: number
  name: string
  nameEn: string
  icon: string
  minXP: number
  maxXP: number
  benefits: string[]
}

/**
 * 计算等级
 */
export function calculateLevel(xp: number): { level: number; progress: number; maxXp: number } {
  // 等级公式：level = floor(sqrt(xp / 100))
  const level = Math.floor(Math.sqrt(xp / 100)) + 1

  // 计算当前等级所需的总经验
  const prevLevelXP = Math.pow(level - 1, 2) * 100
  const nextLevelXP = Math.pow(level, 2) * 100

  // 计算当前等级的进度百分比
  const progress = xp - prevLevelXP
  const maxXp = nextLevelXP - prevLevelXP

  return { level, progress, maxXp }
}

/**
 * 获取等级信息
 */
export function getLevelInfo(level: number): LevelConfig {
  // 每10级一个称号
  const tiers = [
    { max: 10, name: '新手', nameEn: 'Novice', icon: '🌱' },
    { max: 20, name: '学徒', nameEn: 'Apprentice', icon: '📚' },
    { max: 30, name: '学者', nameEn: 'Scholar', icon: '🎓' },
    { max: 40, name: '研究员', nameEn: 'Researcher', icon: '🔬' },
    { max: 50, name: '专家', nameEn: 'Expert', icon: '💡' },
    { max: 60, name: '大师', nameEn: 'Master', icon: '🏆' },
    { max: 70, name: '宗师', nameEn: 'Grandmaster', icon: '👑' },
    { max: 80, name: '智者', nameEn: 'Sage', icon: '🌟' },
    { max: 90, name: '贤者', nameEn: 'Virtuoso', icon: '⭐' },
    { max: 100, name: '传奇', nameEn: 'Legend', icon: '👸‍♂️' }
  ]

  for (const tier of tiers) {
    if (level <= tier.max) {
      return {
        level,
        name: tier.name,
        nameEn: tier.nameEn,
        icon: tier.icon,
        minXP: Math.pow(level > 0 ? level - 1 : level, 2) * 100,
        maxXP: Math.pow(level, 2) * 100,
        benefits: getLevelBenefits(level)
      }
    }
  }

  return {
    level,
    name: '传奇',
    nameEn: 'Legend',
    icon: '👸‍♂️',
    minXP: Math.pow(99, 2) * 100,
    maxXP: Math.pow(100, 2) * 100,
    benefits: ['所有功能解锁', '专属徽章', '排行榜优先展示']
  }
}

/**
 * 获取等级特权
 */
function getLevelBenefits(level: number): string[] {
  const benefits: string[] = ['基础功能']

  if (level >= 5) benefits.push('自定义主题颜色')
  if (level >= 10) benefits.push('高级统计图表')
  if (level >= 20) benefits.push('学习数据分析')
  if (level >= 30) benefits.push('AI 学习建议')
  if (level >= 50) benefits.push('专属成就徽章')

  return benefits
}

// ============================================================================
// 用户进度
// ============================================================================

/**
 * 用户学习进度
 */
export interface UserProgress {
  userId: string
  totalXP: number
  level: number
  unlockedAchievements: UnlockedAchievement[]
  streak: {
    current: number           // 当前连续天数
    longest: number           // 最长连续天数
    lastStudyDate: number     // 最后学习日期
  }
  stats: {
    booksCompleted: number
    booksInProgress: number
    totalNotes: number
    totalPractices: number
    totalStudyMinutes: number
    averageScore: number
  }
  challenges: {
    active: string[]
    completed: string[]
  }
  preferences: {
    showCelebration: boolean
    showNotifications: boolean
  }
}

// ============================================================================
// 成就定义
// ============================================================================

/**
 * 所有成就列表
 */
export const achievements: Achievement[] = [
  // ========== 里程碑成就 ==========
  {
    id: 'first-book',
    name: '初次阅读',
    nameEn: 'First Book',
    description: '添加第一本书',
    icon: '📖',
    type: 'milestone',
    rarity: 'common',
    xp: 10,
    condition: (u) => u.stats.booksInProgress > 0 || u.stats.booksCompleted > 0
  },
  {
    id: 'first-note',
    name: '开始笔记',
    nameEn: 'First Note',
    description: '写下第一条笔记',
    icon: '✏️',
    type: 'milestone',
    rarity: 'common',
    xp: 10,
    condition: (u) => u.stats.totalNotes > 0
  },
  {
    id: 'first-practice',
    name: '费曼初体验',
    nameEn: 'First Feynman',
    description: '完成第一次费曼实践',
    icon: '🎓',
    type: 'milestone',
    rarity: 'common',
    xp: 20,
    condition: (u) => u.stats.totalPractices > 0
  },
  {
    id: 'perfect-score',
    name: '完美表现',
    nameEn: 'Perfect Score',
    description: '获得一次满分',
    icon: '💯',
    type: 'milestone',
    rarity: 'rare',
    xp: 50,
    condition: (u) => u.stats.averageScore === 100
  },
  {
    id: 'ten-books',
    name: '书海探索',
    nameEn: 'Book Explorer',
    description: '学习10本书',
    icon: '📚',
    type: 'milestone',
    rarity: 'uncommon',
    xp: 30,
    condition: (u) => u.stats.booksCompleted >= 10
  },

  // ========== 连续成就 ==========
  {
    id: 'streak-3',
    name: '坚持不懈',
    nameEn: 'Consistent Learner',
    description: '连续学习3天',
    icon: '🔥',
    type: 'streak',
    rarity: 'common',
    xp: 15,
    condition: (u) => u.streak.current >= 3
  },
  {
    id: 'streak-7',
    name: '学习达人',
    nameEn: 'Dedicated Learner',
    description: '连续学习7天',
    icon: '🔥🔥',
    type: 'streak',
    rarity: 'uncommon',
    xp: 30,
    condition: (u) => u.streak.current >= 7
  },
  {
    id: 'streak-30',
    name: '学习狂人',
    nameEn: 'Learning Maniac',
    description: '连续学习30天',
    icon: '🔥🔥🔥',
    type: 'streak',
    rarity: 'rare',
    xp: 100,
    condition: (u) => u.streak.current >= 30
  },
  {
    id: 'streak-100',
    name: '百日精进',
    nameEn: '100 Days of Learning',
    description: '连续学习100天',
    icon: '🏆',
    type: 'streak',
    rarity: 'epic',
    xp: 500,
    condition: (u) => u.streak.current >= 100
  },

  // ========== 探索成就 ==========
  {
    id: 'explorer-5',
    name: '阅读新手',
    nameEn: 'Reading Novice',
    description: '学习5种不同类型的书',
    icon: '🧭',
    type: 'explorer',
    rarity: 'common',
    xp: 20,
    condition: (u) => u.stats.booksCompleted >= 5
  },
  {
    id: 'night-owl',
    name: '夜猫子',
    nameEn: 'Night Owl',
    description: '在晚上10点后学习',
    icon: '🦉',
    type: 'explorer',
    rarity: 'uncommon',
    xp: 15,
    hidden: true,
    secret: '尝试在深夜学习吧',
    condition: () => {
      const hour = new Date().getHours()
      return hour >= 22 || hour <= 4
    }
  },

  // ========== 精通成就 ==========
  {
    id: 'master-80',
    name: '学习大师',
    nameEn: 'Learning Master',
    description: '所有书籍平均得分80+',
    icon: '🎓',
    type: 'master',
    rarity: 'epic',
    xp: 100,
    condition: (u) => u.stats.averageScore >= 80 && u.stats.booksCompleted >= 5
  },
  {
    id: 'perfectionist',
    name: '完美主义者',
    nameEn: 'Perfectionist',
    description: '5本书都获得满分',
    icon: '💎',
    type: 'master',
    rarity: 'legendary',
    xp: 200,
    condition: (u) => u.stats.averageScore === 100 && u.stats.booksCompleted >= 5
  },

  // ========== 特殊成就 ==========
  {
    id: 'early-bird',
    name: '早起鸟',
    nameEn: 'Early Bird',
    description: '在早上6点前学习',
    icon: '🐦',
    type: 'special',
    rarity: 'uncommon',
    xp: 15,
    hidden: true,
    secret: '尝试在清晨学习吧',
    condition: () => {
      const hour = new Date().getHours()
      return hour >= 5 && hour <= 6
    }
  },
  {
    id: 'speed-reader',
    name: '速读者',
    nameEn: 'Speed Reader',
    description: '一天内完成一本书',
    icon: '⚡',
    type: 'special',
    rarity: 'rare',
    xp: 50,
    hidden: true,
    secret: '挑战极限速度吧',
    condition: () => {
      // 需要跟踪每本书的完成时间
      return false // 需要额外实现
    }
  }
]

// ============================================================================
// 挑战系统
// ============================================================================

/**
 * 挑战定义
 */
export interface Challenge {
  id: string
  name: string
  nameEn: string
  description: string
  icon: string
  type: 'daily' | 'weekly' | 'monthly' | 'special'
  xp: number
  target: number
  progress: number
  startDate: number
  endDate: number
  completed: boolean
}

/**
 * 创建每日挑战
 */
export function createDailyChallenges(): Challenge[] {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)

  return [
    {
      id: `daily-read-${today.getTime()}`,
      name: '每日阅读',
      nameEn: 'Daily Reading',
      description: '今天阅读至少30分钟',
      icon: '📖',
      type: 'daily',
      xp: 20,
      target: 30,
      progress: 0,
      startDate: today.getTime(),
      endDate: tomorrow.getTime(),
      completed: false
    },
    {
      id: `daily-note-${today.getTime()}`,
      name: '每日笔记',
      nameEn: 'Daily Note',
      description: '今天写一条笔记',
      icon: '✏️',
      type: 'daily',
      xp: 15,
      target: 1,
      progress: 0,
      startDate: today.getTime(),
      endDate: tomorrow.getTime(),
      completed: false
    },
    {
      id: `daily-practice-${today.getTime()}`,
      name: '每日实践',
      nameEn: 'Daily Practice',
      description: '今天完成一次费曼实践',
      icon: '🎓',
      type: 'daily',
      xp: 25,
      target: 1,
      progress: 0,
      startDate: today.getTime(),
      endDate: tomorrow.getTime(),
      completed: false
    }
  ]
}

/**
 * 创建每周挑战
 */
export function createWeeklyChallenges(): Challenge[] {
  const now = new Date()
  const startOfWeek = new Date(now)
  startOfWeek.setDate(now.getDate() - now.getDay()) // 周日
  startOfWeek.setHours(0, 0, 0, 0)

  const endOfWeek = new Date(startOfWeek)
  endOfWeek.setDate(startOfWeek.getDate() + 7)

  return [
    {
      id: `weekly-books-${startOfWeek.getTime()}`,
      name: '本周阅读',
      nameEn: 'Weekly Reading',
      description: '本周学习3本书',
      icon: '📚',
      type: 'weekly',
      xp: 50,
      target: 3,
      progress: 0,
      startDate: startOfWeek.getTime(),
      endDate: endOfWeek.getTime(),
      completed: false
    },
    {
      id: `weekly-streak-${startOfWeek.getTime()}`,
      name: '本周连续',
      nameEn: 'Weekly Streak',
      description: '本周连续学习7天',
      icon: '🔥',
      type: 'weekly',
      xp: 100,
      target: 7,
      progress: 0,
      startDate: startOfWeek.getTime(),
      endDate: endOfWeek.getTime(),
      completed: false
    }
  ]
}

// ============================================================================
// 存储键
// ============================================================================

const USER_PROGRESS_KEY = 'feynman-user-progress'
const UNLOCKED_ACHIEVEMENTS_KEY = 'feynman-unlocked-achievements'

// ============================================================================
// 用户进度管理
// ============================================================================

/**
 * 获取用户进度
 */
export function getUserProgress(): UserProgress {
  const saved = localStorage.getItem(USER_PROGRESS_KEY)
  if (saved) {
    try {
      const parsed = JSON.parse(saved)
      // 确保字段完整
      return {
        userId: parsed.userId || 'default',
        totalXP: parsed.totalXP || 0,
        level: parsed.level || 1,
        unlockedAchievements: parsed.unlockedAchievements || [],
        streak: parsed.streak || { current: 0, longest: 0, lastStudyDate: 0 },
        stats: parsed.stats || {
          booksCompleted: 0,
          booksInProgress: 0,
          totalNotes: 0,
          totalPractices: 0,
          totalStudyMinutes: 0,
          averageScore: 0
        },
        challenges: parsed.challenges || { active: [], completed: [] },
        preferences: parsed.preferences || {
          showCelebration: true,
          showNotifications: true
        }
      }
    } catch (e) {
      logger.error('Failed to parse user progress:', e)
    }
  }

  // 返回默认进度
  return {
    userId: 'default',
    totalXP: 0,
    level: 1,
    unlockedAchievements: [],
    streak: {
      current: 0,
      longest: 0,
      lastStudyDate: 0
    },
    stats: {
      booksCompleted: 0,
      booksInProgress: 0,
      totalNotes: 0,
      totalPractices: 0,
      totalStudyMinutes: 0,
      averageScore: 0
    },
    challenges: {
      active: [],
      completed: []
    },
    preferences: {
      showCelebration: true,
      showNotifications: true
    }
  }
}

/**
 * 保存用户进度
 */
export function saveUserProgress(progress: UserProgress): void {
  localStorage.setItem(USER_PROGRESS_KEY, JSON.stringify(progress))
}

/**
 * 添加经验值
 */
export function addXP(amount: number, source: string): { levelUp: boolean; newLevel: number } {
  const progress = getUserProgress()
  const oldLevel = progress.level

  progress.totalXP += amount

  // 重新计算等级
  const levelInfo = calculateLevel(progress.totalXP)
  progress.level = levelInfo.level

  saveUserProgress(progress)

  const levelUp = progress.level > oldLevel

  if (levelUp && progress.preferences.showCelebration) {
    showLevelUpCelebration(progress.level)
  }

  return {
    levelUp,
    newLevel: progress.level
  }
}

/**
 * 检查和解锁成就
 */
export function checkAndUnlockAchievements(): UnlockedAchievement[] {
  const progress = getUserProgress()
  const unlockedIds = new Set(progress.unlockedAchievements.map(a => a.achievementId))
  const newUnlocks: UnlockedAchievement[] = []

  for (const achievement of achievements) {
    // 跳过已解锁的
    if (unlockedIds.has(achievement.id)) continue

    // 跳过隐藏成就（特殊条件触发）
    if (achievement.hidden) continue

    // 检查条件
    try {
      if (achievement.condition(progress)) {
        const unlocked: UnlockedAchievement = {
          achievementId: achievement.id,
          unlockedAt: Date.now()
        }
        newUnlocks.push(unlocked)
        progress.unlockedAchievements.push(unlocked)
        unlockedIds.add(achievement.id)

        // 添加经验值
        addXP(achievement.xp, `achievement:${achievement.id}`)

        // 显示成就解锁通知
        if (progress.preferences.showNotifications) {
          showAchievementNotification(achievement)
        }
      }
    } catch (e) {
      logger.error(`Error checking achievement ${achievement.id}:`, e)
    }
  }

  saveUserProgress(progress)
  return newUnlocks
}

/**
 * 解锁指定成就
 */
export function unlockAchievement(achievementId: string): boolean {
  const progress = getUserProgress()
  const alreadyUnlocked = progress.unlockedAchievements.some(a => a.achievementId === achievementId)

  if (alreadyUnlocked) return false

  const achievement = achievements.find(a => a.id === achievementId)
  if (!achievement) return false

  const unlocked: UnlockedAchievement = {
    achievementId,
    unlockedAt: Date.now()
  }
  progress.unlockedAchievements.push(unlocked)

  addXP(achievement.xp, `achievement:${achievementId}`)

  if (progress.preferences.showNotifications) {
    showAchievementNotification(achievement)
  }

  saveUserProgress(progress)
  return true
}

/**
 * 获取已解锁的成就详情
 */
export function getUnlockedAchievements(): Achievement[] {
  const progress = getUserProgress()
  const unlockedIds = new Set(progress.unlockedAchievements.map(a => a.achievementId))

  return achievements.filter(a => unlockedIds.has(a.id))
}

// ============================================================================
// UI 通知函数
// ============================================================================

/**
 * 显示升级庆祝
 */
function showLevelUpCelebration(level: number): void {
  const levelInfo = getLevelInfo(level)

  // 触发自定义事件
  window.dispatchEvent(new CustomEvent('level-up', {
    detail: { level, levelInfo }
  }))
}

/**
 * 显示成就通知
 */
function showAchievementNotification(achievement: Achievement): void {
  // 触发自定义事件
  window.dispatchEvent(new CustomEvent('achievement-unlocked', {
    detail: { achievement }
  }))
}

/**
 * 获取稀有度颜色
 */
export function getRarityColor(rarity: AchievementRarity): string {
  const colors = {
    common: '#9e9e9e',
    uncommon: '#4caf50',
    rare: '#2196f3',
    epic: '#9c27b0',
    legendary: '#ff9800'
  }
  return colors[rarity]
}

/**
 * 获取稀有度名称
 */
export function getRarityName(rarity: AchievementRarity, lang: 'zh' | 'en' = 'zh'): string {
  const names = {
    zh: {
      common: '普通',
      uncommon: '罕见',
      rare: '稀有',
      epic: '史诗',
      legendary: '传说'
    },
    en: {
      common: 'Common',
      uncommon: 'Uncommon',
      rare: 'Rare',
      epic: 'Epic',
      legendary: 'Legendary'
    }
  }
  return names[lang][rarity]
}

// ============================================================================
// 活动跟踪
// ============================================================================

/**
 * 记录学习活动
 */
export function trackActivity(type: 'note' | 'practice' | 'read', duration?: number): void {
  const progress = getUserProgress()
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // 更新统计
  switch (type) {
    case 'note':
      progress.stats.totalNotes++
      break
    case 'practice':
      progress.stats.totalPractices++
      break
    case 'read':
      if (duration) {
        progress.stats.totalStudyMinutes += duration
      }
      break
  }

  // 更新连续学习
  if (progress.streak.lastStudyDate < today.getTime()) {
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)

    if (progress.streak.lastStudyDate >= yesterday.getTime()) {
      progress.streak.current++
    } else {
      progress.streak.current = 1
    }

    progress.streak.lastStudyDate = today.getTime()

    // 更新最长记录
    if (progress.streak.current > progress.streak.longest) {
      progress.streak.longest = progress.streak.current
    }
  }

  saveUserProgress(progress)

  // 检查成就
  checkAndUnlockAchievements()
}

/**
 * 获取成就进度
 */
export function getAchievementProgress(achievementId: string): { current: number; target: number; percentage: number } | null {
  const progress = getUserProgress()

  switch (achievementId) {
    case 'ten-books':
      return {
        current: progress.stats.booksCompleted,
        target: 10,
        percentage: Math.min(100, (progress.stats.booksCompleted / 10) * 100)
      }
    case 'streak-3':
      return {
        current: progress.streak.current,
        target: 3,
        percentage: Math.min(100, (progress.streak.current / 3) * 100)
      }
    case 'streak-7':
      return {
        current: progress.streak.current,
        target: 7,
        percentage: Math.min(100, (progress.streak.current / 7) * 100)
      }
    default:
      return null
  }
}
