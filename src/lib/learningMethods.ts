/**
 * 多学习方法支持 (P2 修复)
 *
 * 支持康奈尔笔记法、SQ3R阅读法、思维导图法等多种学习方法
 */

import { Book } from './store'

// ============================================================================
// 学习方法类型定义
// ============================================================================

/**
 * 支持的学习方法
 */
export type LearningMethod =
  | 'feynman'        // 费曼学习法
  | 'cornell'        // 康奈尔笔记法
  | 'sq3r'           // SQ3R 阅读法
  | 'mindmap'        // 思维导图法
  | 'pomodoro'       // 番茄工作法
  | 'spaced'         // 间隔重复法

/**
 * 学习方法配置
 */
export interface LearningMethodConfig {
  id: LearningMethod
  name: string
  nameEn: string
  description: string
  icon: string
  phases: string[]
  enabled: boolean
}

/**
 * 康奈尔笔记结构
 */
export interface CornellNote {
  cues: string      // 线索/问题
  notes: string     // 笔记
  summary: string   // 总结
}

/**
 * SQ3R 阶段
 */
export interface SQ3RStage {
  survey: string    // 浏览
  question: string  // 提问
  read: string      // 阅读
  recite: string    // 复述
  review: string    // 复习
}

/**
 * 思维导图节点
 */
export interface MindMapNode {
  id: string
  content: string
  children: MindMapNode[]
  color?: string
  icon?: string
}

/**
 * 番茄工作记录
 */
export interface PomodoroSession {
  id: string
  bookId: string
  duration: number  // 分钟
  type: 'focus' | 'break'
  startTime: number
  endTime?: number
  completed: boolean
}

// ============================================================================
// 学习方法配置
// ============================================================================

export const learningMethods: Record<LearningMethod, LearningMethodConfig> = {
  feynman: {
    id: 'feynman',
    name: '费曼学习法',
    nameEn: 'Feynman Technique',
    description: '通过"以教代学"的方式深度理解知识',
    icon: '🎓',
    phases: ['选择概念', '教给小白', '发现盲点', '简化语言', '类比讲解', '实践验证'],
    enabled: true
  },
  cornell: {
    id: 'cornell',
    name: '康奈尔笔记法',
    nameEn: 'Cornell Notes',
    description: '系统化笔记方法，包含线索、笔记和总结三个区域',
    icon: '📝',
    phases: ['记录笔记', '提炼线索', '编写总结', '复习回顾'],
    enabled: true
  },
  sq3r: {
    id: 'sq3r',
    name: 'SQ3R 阅读法',
    nameEn: 'SQ3R Reading Method',
    description: '浏览、提问、阅读、复述、复习五步阅读法',
    icon: '📖',
    phases: ['Survey 浏览', 'Question 提问', 'Read 阅读', 'Recite 复述', 'Review 复习'],
    enabled: true
  },
  mindmap: {
    id: 'mindmap',
    name: '思维导图法',
    nameEn: 'Mind Mapping',
    description: '可视化知识结构，建立概念关联',
    icon: '🧠',
    phases: ['中心主题', '主要分支', '次要分支', '细节补充', '关联建立'],
    enabled: true
  },
  pomodoro: {
    id: 'pomodoro',
    name: '番茄工作法',
    nameEn: 'Pomodoro Technique',
    description: '25分钟专注 + 5分钟休息的工作节奏',
    icon: '🍅',
    phases: ['选择任务', '设定番茄', '专注工作', '短暂休息', '循环重复'],
    enabled: true
  },
  spaced: {
    id: 'spaced',
    name: '间隔重复法',
    nameEn: 'Spaced Repetition',
    description: '基于遗忘曲线的科学复习方法',
    icon: '🔄',
    phases: ['初次学习', '1天后', '3天后', '7天后', '14天后', '30天后'],
    enabled: true
  }
}

// ============================================================================
// 康奈尔笔记法实现
// ============================================================================

/**
 * 创建康奈尔笔记模板
 */
export function createCornellTemplate(): CornellNote {
  return {
    cues: '',
    notes: '',
    summary: ''
  }
}

/**
 * 康奈尔笔记转 Markdown
 */
export function cornellToMarkdown(note: CornellNote, bookName: string): string {
  let md = `# ${bookName} - 康奈尔笔记\n\n`
  md += `日期: ${new Date().toLocaleDateString()}\n\n`
  md += `| 线索/问题 | 笔记 |\n`
  md += `|---|---|\n`

  const cueLines = note.cues.split('\n')
  const noteLines = note.notes.split('\n')
  const maxLines = Math.max(cueLines.length, noteLines.length)

  for (let i = 0; i < maxLines; i++) {
    const cue = cueLines[i] || ''
    const note = noteLines[i] || ''
    md += `| ${cue} | ${note} |\n`
  }

  md += `\n## 总结\n\n${note.summary}\n`

  return md
}

/**
 * 解析 Markdown 为康奈尔笔记
 */
export function markdownToCornell(markdown: string): CornellNote {
  const note: CornellNote = {
    cues: '',
    notes: '',
    summary: ''
  }

  const lines = markdown.split('\n')
  let inSummary = false
  let summaryLines: string[] = []

  for (const line of lines) {
    if (line.startsWith('## 总结')) {
      inSummary = true
      continue
    }

    if (inSummary) {
      summaryLines.push(line)
    } else if (line.startsWith('|')) {
      const parts = line.split('|').filter(p => p.trim())
      if (parts.length >= 2) {
        const cue = parts[0].trim()
        const noteContent = parts[1].trim()
        if (cue) note.cues += cue + '\n'
        if (noteContent) note.notes += noteContent + '\n'
      }
    }
  }

  note.summary = summaryLines.join('\n').trim()

  return note
}

// ============================================================================
// SQ3R 方法实现
// ============================================================================

/**
 * 创建 SQ3R 模板
 */
export function createSQ3RTemplate(): SQ3RStage {
  return {
    survey: '',
    question: '',
    read: '',
    recite: '',
    review: ''
  }
}

/**
 * SQ3R 转 Markdown
 */
export function sq3rToMarkdown(stage: SQ3RStage, bookName: string): string {
  let md = `# ${bookName} - SQ3R 阅读笔记\n\n`
  md += `日期: ${new Date().toLocaleDateString()}\n\n`

  md += `## 1️⃣ Survey 浏览\n\n${stage.survey || '_待填写_'}\n\n`
  md += `## 2️⃣ Question 提问\n\n${stage.question || '_待填写_'}\n\n`
  md += `## 3️⃣ Read 阅读\n\n${stage.read || '_待填写_'}\n\n`
  md += `## 4️⃣ Recite 复述\n\n${stage.recite || '_待填写_'}\n\n`
  md += `## 5️⃣ Review 复习\n\n${stage.review || '_待填写_'}\n\n`

  return md
}

/**
 * 生成 SQ3R 阅读指导问题
 */
export function generateSQ3RQuestions(bookName: string, content?: string): string[] {
  const questions: string[] = []

  // Survey 阶段问题
  questions.push(`《${bookName}》的目录结构是怎样的？`)
  questions.push(`这本书的核心主题是什么？`)
  questions.push(`作者的写作目的是什么？`)

  // Question 阶段问题
  questions.push(`我想从这本书中学到什么？`)
  questions.push(`这本书的哪些章节最吸引我？`)
  questions.push(`我对这本书有哪些疑问？`)

  // Read 阶段问题
  questions.push(`这段话的核心观点是什么？`)
  questions.push(`作者用了哪些例子来支持观点？`)
  questions.push(`这些内容与我的经验有什么联系？`)

  // Recite 阶段问题
  questions.push(`用自己的话总结这段内容`)
  questions.push(`关键要点有哪些？`)
  questions.push(`我能用简单的比喻解释这个概念吗？`)

  // Review 阶段问题
  questions.push(`我学到了什么新知识？`)
  questions.push(`哪些内容还需要进一步探索？`)
  questions.push(`如何将所学应用到实践中？`)

  return questions
}

// ============================================================================
// 思维导图方法实现
// ============================================================================

/**
 * 创建基础思维导图节点
 */
export function createMindMapRoot(title: string): MindMapNode {
  return {
    id: 'root',
    content: title,
    children: [],
    color: '#667eea',
    icon: '📚'
  }
}

/**
 * 添加子节点
 */
export function addMindMapNode(parent: MindMapNode, content: string, options?: Partial<MindMapNode>): MindMapNode {
  const newNode: MindMapNode = {
    id: `node-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    content,
    children: [],
    color: options?.color,
    icon: options?.icon
  }

  parent.children.push(newNode)
  return newNode
}

/**
 * 从书籍生成思维导图
 */
export function bookToMindMap(book: Book): MindMapNode {
  const root = createMindMapRoot(book.name)

  // 添加基本信息分支
  const infoBranch = addMindMapNode(root, '基本信息', { icon: 'ℹ️' })
  if (book.author) {
    addMindMapNode(infoBranch, `作者: ${book.author}`)
  }
  if (book.description) {
    addMindMapNode(infoBranch, `简介: ${book.description.substring(0, 50)}...`)
  }

  // 添加学习阶段分支
  if (Object.keys(book.responses).length > 0) {
    const phaseBranch = addMindMapNode(root, '学习阶段', { icon: '📝' })
    Object.entries(book.responses).forEach(([phase, response]) => {
      const summary = response.substring(0, 30)
      addMindMapNode(phaseBranch, `${phase}: ${summary}...`)
    })
  }

  // 添加笔记分支
  if (book.noteRecords && book.noteRecords.length > 0) {
    const noteBranch = addMindMapNode(root, '笔记', { icon: '📖' })
    book.noteRecords.forEach(note => {
      const summary = note.content.substring(0, 30)
      addMindMapNode(noteBranch, summary)
    })
  }

  // 添加实践分支
  if (book.practiceRecords && book.practiceRecords.length > 0) {
    const practiceBranch = addMindMapNode(root, '费曼实践', { icon: '🎓' })
    book.practiceRecords.forEach(practice => {
      const score = practice.scores.overall
      addMindMapNode(practiceBranch, `得分: ${score}`, {
        color: score >= 60 ? '#4caf50' : '#f44336'
      })
    })
  }

  return root
}

/**
 * 思维导图转 Mermaid 语法
 */
export function mindMapToMermaid(node: MindMapNode): string {
  let mermaid = 'mindmap\n'
  mermaid += `  root((${node.content}))\n`

  const renderNode = (n: MindMapNode, indent: number = 2, parentId: string = 'root') => {
    const spaces = ' '.repeat(indent)
    let result = ''

    n.children.forEach(child => {
      const label = child.icon ? `${child.icon} ${child.content}` : child.content
      result += `${spaces}${parentId}(${label})\n`
      result += renderNode(child, indent + 2, child.content.replace(/\s+/g, '_'))
    })

    return result
  }

  mermaid += renderNode(node)

  return mermaid
}

// ============================================================================
// 番茄工作法实现
// ============================================================================

const POMODORO_DURATION = 25 // 分钟
const SHORT_BREAK = 5 // 分钟
const LONG_BREAK = 15 // 分钟

/**
 * 开始番茄钟
 */
export function startPomodoro(bookId: string): PomodoroSession {
  return {
    id: `pomodoro-${Date.now()}`,
    bookId,
    duration: POMODORO_DURATION,
    type: 'focus',
    startTime: Date.now(),
    completed: false
  }
}

/**
 * 创建休息会话
 */
export function createBreakSession(bookId: string, isLong: boolean = false): PomodoroSession {
  return {
    id: `break-${Date.now()}`,
    bookId,
    duration: isLong ? LONG_BREAK : SHORT_BREAK,
    type: 'break',
    startTime: Date.now(),
    completed: false
  }
}

/**
 * 完成会话
 */
export function completeSession(session: PomodoroSession): PomodoroSession {
  return {
    ...session,
    endTime: Date.now(),
    completed: true
  }
}

/**
 * 计算会话剩余时间（秒）
 */
export function getSessionRemainingTime(session: PomodoroSession): number {
  if (session.completed) return 0

  const elapsed = Date.now() - session.startTime
  const remaining = session.duration * 60 * 1000 - elapsed
  return Math.max(0, Math.round(remaining / 1000))
}

// ============================================================================
// 间隔重复法实现
// ============================================================================

/**
 * 复习间隔配置（基于 SM-2 算法简化版）
 */
interface ReviewSchedule {
  interval: number    // 间隔天数
  ease: number        // 难度因子 (1.3 - 2.5)
  dueDate: number     // 下次复习日期
}

/**
 * 计算下次复习时间
 */
export function calculateNextReview(
  quality: number,  // 质量评分 (0-5)
  previous?: ReviewSchedule
): ReviewSchedule {
  const MIN_EASE = 1.3
  const previousEase = previous?.ease || 2.5
  const previousInterval = previous?.interval || 0

  let newInterval: number
  let newEase = previousEase

  if (quality >= 3) {
    // 回答正确
    if (previousInterval === 0) {
      newInterval = 1
    } else if (previousInterval === 1) {
      newInterval = 6
    } else {
      newInterval = Math.round(previousInterval * newEase)
    }
  } else {
    // 回答错误
    newInterval = 1
    newEase = Math.max(MIN_EASE, newEase - 0.2)
  }

  // 更新难度因子
  newEase = newEase + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
  newEase = Math.max(MIN_EASE, Math.min(2.5, newEase))

  const dueDate = Date.now() + newInterval * 24 * 60 * 60 * 1000

  return {
    interval: newInterval,
    ease: newEase,
    dueDate
  }
}

/**
 * 获取今日需要复习的内容
 */
export function getDueReviews(
  allItems: Array<{ id: string; review?: ReviewSchedule }>
): Array<{ id: string; review: ReviewSchedule }> {
  const now = Date.now()
  return allItems
    .filter(item => item.review && item.review.dueDate <= now)
    .map(item => ({
      id: item.id,
      review: item.review!
    }))
    .sort((a, b) => a.review.dueDate - b.review.dueDate)
}

// ============================================================================
// 学习方法切换
// ============================================================================

/**
 * 书籍学习方法配置
 */
export interface BookLearningConfig {
  bookId: string
  primaryMethod: LearningMethod
  secondaryMethods?: LearningMethod[]
  customPhases?: string[]
  methodData?: {
    cornell?: CornellNote
    sq3r?: SQ3RStage
    mindMap?: MindMapNode
    pomodoros?: PomodoroSession[]
    reviews?: Map<string, ReviewSchedule>
  }
}

/**
 * 为书籍设置学习方法
 */
export function setBookLearningMethod(
  book: Book,
  method: LearningMethod
): BookLearningConfig {
  const config: BookLearningConfig = {
    bookId: book.id,
    primaryMethod: method
  }

  switch (method) {
    case 'cornell':
      config.methodData = { cornell: createCornellTemplate() }
      break
    case 'sq3r':
      config.methodData = { sq3r: createSQ3RTemplate() }
      break
    case 'mindmap':
      config.methodData = { mindMap: bookToMindMap(book) }
      break
    case 'pomodoro':
      config.methodData = { pomodoros: [] }
      break
  }

  return config
}

/**
 * 存储键
 */
const LEARNING_METHOD_KEY = 'feynman-learning-methods'

/**
 * 保存学习方法配置
 */
export function saveLearningConfig(config: BookLearningConfig): void {
  const configs = getAllLearningConfigs()
  configs[config.bookId] = config
  localStorage.setItem(LEARNING_METHOD_KEY, JSON.stringify(configs))
}

/**
 * 获取所有学习方法配置
 */
export function getAllLearningConfigs(): Record<string, BookLearningConfig> {
  const saved = localStorage.getItem(LEARNING_METHOD_KEY)
  if (saved) {
    try {
      return JSON.parse(saved)
    } catch (e) {
      return {}
    }
  }
  return {}
}

/**
 * 获取书籍的学习方法配置
 */
export function getLearningConfig(bookId: string): BookLearningConfig | null {
  const configs = getAllLearningConfigs()
  return configs[bookId] || null
}

// ============================================================================
// 统计和分析
// ============================================================================

/**
 * 学习方法使用统计
 */
export interface LearningMethodStats {
  method: LearningMethod
  booksCount: number
  totalMinutes: number
  averageScore: number
}

/**
 * 获取学习方法统计
 */
export function getLearningMethodStats(): LearningMethodStats[] {
  const configs = getAllLearningConfigs()
  const stats: Map<LearningMethod, LearningMethodStats> = new Map()

  // 初始化统计
  Object.keys(learningMethods).forEach(method => {
    stats.set(method as LearningMethod, {
      method: method as LearningMethod,
      booksCount: 0,
      totalMinutes: 0,
      averageScore: 0
    })
  })

  // 计算统计
  Object.values(configs).forEach(config => {
    const stat = stats.get(config.primaryMethod)
    if (stat) {
      stat.booksCount++
      // 可以添加更多统计计算
    }
  })

  return Array.from(stats.values())
}
