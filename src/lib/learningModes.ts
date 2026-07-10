/**
 * 学习模式配置
 * 提供灵活的学习路径和个性化选项
 */

import type { Language } from './i18n'

// ============================================================================
// 学习模式类型
// ============================================================================

export type LearningMode = 'sequential' | 'quick' | 'deep' | 'custom'

export interface LearningModeConfig {
  id: LearningMode
  name: { zh: string; en: string }
  description: { zh: string; en: string }
  icon: string
  phases: string[]  // 包含的阶段ID
  allowSkip: boolean  // 是否允许跳过阶段
  minPassScore: number  // 最低通过分数
}

export const LEARNING_MODES: Record<LearningMode, LearningModeConfig> = {
  // 顺序模式 - 按顺序完成所有6个阶段
  sequential: {
    id: 'sequential',
    name: { zh: '顺序模式', en: 'Sequential' },
    description: { zh: '按顺序完成所有6个阶段，适合深度学习', en: 'Complete all 6 phases in order' },
    icon: '📚',
    phases: ['background', 'overview', 'deepDive', 'critical', 'reception', 'synthesis'],
    allowSkip: false,
    minPassScore: 60
  },

  // 快速模式 - 只完成核心3个阶段
  quick: {
    id: 'quick',
    name: { zh: '快速模式', en: 'Quick Mode' },
    description: { zh: '快速浏览核心内容，只需3个阶段', en: 'Quick overview with 3 core phases' },
    icon: '⚡',
    phases: ['overview', 'deepDive', 'synthesis'],
    allowSkip: true,
    minPassScore: 50
  },

  // 深度模式 - 包含额外思考问题
  deep: {
    id: 'deep',
    name: { zh: '深度模式', en: 'Deep Mode' },
    description: { zh: '深度学习模式，每个阶段包含思考题', en: 'Deep learning with thinking questions' },
    icon: '🎯',
    phases: ['background', 'overview', 'deepDive', 'critical', 'reception', 'synthesis'],
    allowSkip: false,
    minPassScore: 70
  },

  // 自定义模式 - 用户自选阶段
  custom: {
    id: 'custom',
    name: { zh: '自定义模式', en: 'Custom' },
    description: { zh: '自由选择要学习的阶段', en: 'Choose your own phases' },
    icon: '⚙️',
    phases: [],  // 由用户选择
    allowSkip: true,
    minPassScore: 60
  }
}

// ============================================================================
// 阶段定制
// ============================================================================

export interface PhaseCustomization {
  phaseId: string
  enabled: boolean
  order: number  // 自定义顺序
  additionalQuestions: string[]  // 用户添加的问题
}

export function getDefaultPhaseCustomization(): PhaseCustomization[] {
  return [
    { phaseId: 'background', enabled: true, order: 0, additionalQuestions: [] },
    { phaseId: 'overview', enabled: true, order: 1, additionalQuestions: [] },
    { phaseId: 'deepDive', enabled: true, order: 2, additionalQuestions: [] },
    { phaseId: 'critical', enabled: true, order: 3, additionalQuestions: [] },
    { phaseId: 'reception', enabled: true, order: 4, additionalQuestions: [] },
    { phaseId: 'synthesis', enabled: true, order: 5, additionalQuestions: [] }
  ]
}

// ============================================================================
// 思考问题
// ============================================================================

export interface ThinkingQuestion {
  id: string
  phaseId: string
  question: { zh: string; en: string }
  hint?: { zh: string; en: string }
  userAnswer?: string
  aiFeedback?: string
}

export function getThinkingQuestionsForPhase(phaseId: string): ThinkingQuestion[] {
  const questions: Record<string, ThinkingQuestion[]> = {
    background: [
      {
        id: 'bg-1',
        phaseId: 'background',
        question: {
          zh: '如果这本书是在今天写的，会有什么不同？',
          en: 'How would this book be different if written today?'
        },
        hint: {
          zh: '考虑当代的社会环境、科技发展和价值观变化',
          en: 'Consider today\'s social environment, technology, and values'
        }
      },
      {
        id: 'bg-2',
        phaseId: 'background',
        question: {
          zh: '作者的个人经历如何影响了这本书的观点？',
          en: 'How did the author\'s personal experiences influence the book\'s views?'
        }
      }
    ],
    overview: [
      {
        id: 'ov-1',
        phaseId: 'overview',
        question: {
          zh: '用一句话向你的朋友介绍这本书，你会怎么说？',
          en: 'How would you describe this book to a friend in one sentence?'
        }
      },
      {
        id: 'ov-2',
        phaseId: 'overview',
        question: {
          zh: '这本书的核心观点可以用哪个日常现象来类比？',
          en: 'What everyday phenomenon can analogize the core idea of this book?'
        }
      }
    ],
    deepDive: [
      {
        id: 'dd-1',
        phaseId: 'deepDive',
        question: {
          zh: '你认为自己最可能误解哪个概念？为什么？',
          en: 'Which concept do you think you\'re most likely to misunderstand? Why?'
        }
      },
      {
        id: 'dd-2',
        phaseId: 'deepDive',
        question: {
          zh: '如果要向一个外行解释这本书，你会从哪里开始？',
          en: 'Where would you start if explaining this book to a layperson?'
        }
      }
    ],
    critical: [
      {
        id: 'cr-1',
        phaseId: 'critical',
        question: {
          zh: '这本书的观点在什么情况下可能不成立？',
          en: 'Under what conditions might this book\'s views not hold?'
        }
      },
      {
        id: 'cr-2',
        phaseId: 'critical',
        question: {
          zh: '如果你是这本书的反对者，你会如何批评它？',
          en: 'If you were an opponent, how would you criticize this book?'
        }
      }
    ],
    reception: [
      {
        id: 'rc-1',
        phaseId: 'reception',
        question: {
          zh: '这本书的观点在当代有什么现实意义？',
          en: 'What contemporary relevance does this book\'s view have?'
        }
      },
      {
        id: 'rc-2',
        phaseId: 'reception',
        question: {
          zh: '你认为这本书为什么（不）被广泛接受？',
          en: 'Why do you think this book is (not) widely accepted?'
        }
      }
    ],
    synthesis: [
      {
        id: 'sy-1',
        phaseId: 'synthesis',
        question: {
          zh: '这本书改变了你的哪些看法？',
          en: 'What of your views has this book changed?'
        }
      },
      {
        id: 'sy-2',
        phaseId: 'synthesis',
        question: {
          zh: '你打算如何应用这本书学到的东西？',
          en: 'How do you plan to apply what you learned from this book?'
        }
      }
    ]
  }

  return questions[phaseId] || []
}

// ============================================================================
// AI 内容编辑和重新生成
// ============================================================================

export interface EditableContent {
  phaseId: string
  originalContent: string
  editedContent: string
  isEdited: boolean
  editHistory: {
    timestamp: number
    from: string
    to: string
    reason?: string
  }[]
}

export interface RegenerationRequest {
  phaseId: string
  focusAreas?: string[]  // 重新生成时关注的重点
  tone?: 'formal' | 'casual' | 'simplified' | 'detailed'
  language?: Language
}

// ============================================================================
// 书籍类型定制
// ============================================================================

export type BookCategory =
  | 'technical'      // 技术类
  | 'humanities'     // 人文类
  | 'science'        // 科普类
  | 'business'       // 商业类
  | 'fiction'        // 小说类
  | 'selfhelp'       // 自助类
  | 'history'        // 历史类
  | 'philosophy'     // 哲学类
  | 'other'          // 其他

export interface CategoryPhaseConfig {
  category: BookCategory
  name: { zh: string; en: string }
  recommendedPhases: string[]  // 推荐的阶段
  optionalPhases: string[]     // 可选的阶段
  emphasis: string[]           // 重点强调的内容
}

export const CATEGORY_PHASE_CONFIGS: Record<BookCategory, CategoryPhaseConfig> = {
  technical: {
    category: 'technical',
    name: { zh: '技术类', en: 'Technical' },
    recommendedPhases: ['overview', 'deepDive', 'synthesis'],
    optionalPhases: ['background', 'critical', 'reception'],
    emphasis: ['deepDive', 'synthesis']  // 强调深度拆解和综合应用
  },
  humanities: {
    category: 'humanities',
    name: { zh: '人文类', en: 'Humanities' },
    recommendedPhases: ['background', 'overview', 'reception'],
    optionalPhases: ['deepDive', 'critical', 'synthesis'],
    emphasis: ['background', 'reception']  // 强调背景和影响
  },
  science: {
    category: 'science',
    name: { zh: '科普类', en: 'Science' },
    recommendedPhases: ['overview', 'deepDive', 'critical'],
    optionalPhases: ['background', 'reception', 'synthesis'],
    emphasis: ['deepDive', 'critical']  // 强调深度和批判
  },
  business: {
    category: 'business',
    name: { zh: '商业类', en: 'Business' },
    recommendedPhases: ['overview', 'deepDive', 'synthesis'],
    optionalPhases: ['background', 'critical', 'reception'],
    emphasis: ['synthesis']  // 强调应用
  },
  fiction: {
    category: 'fiction',
    name: { zh: '小说类', en: 'Fiction' },
    recommendedPhases: ['background', 'overview', 'reception'],
    optionalPhases: ['deepDive', 'critical', 'synthesis'],
    emphasis: ['background', 'reception']  // 强调背景和影响
  },
  selfhelp: {
    category: 'selfhelp',
    name: { zh: '自助类', en: 'Self-Help' },
    recommendedPhases: ['overview', 'deepDive', 'synthesis'],
    optionalPhases: ['background', 'critical', 'reception'],
    emphasis: ['synthesis']  // 强调应用
  },
  history: {
    category: 'history',
    name: { zh: '历史类', en: 'History' },
    recommendedPhases: ['background', 'overview', 'reception'],
    optionalPhases: ['deepDive', 'critical', 'synthesis'],
    emphasis: ['background', 'reception']  // 强调背景和影响
  },
  philosophy: {
    category: 'philosophy',
    name: { zh: '哲学类', en: 'Philosophy' },
    recommendedPhases: ['deepDive', 'critical', 'synthesis'],
    optionalPhases: ['background', 'overview', 'reception'],
    emphasis: ['deepDive', 'critical']  // 强调深度和批判
  },
  other: {
    category: 'other',
    name: { zh: '其他', en: 'Other' },
    recommendedPhases: ['background', 'overview', 'deepDive', 'critical', 'reception', 'synthesis'],
    optionalPhases: [],
    emphasis: []
  }
}

export function detectBookCategory(bookName: string, description?: string): BookCategory {
  const text = (bookName + ' ' + (description || '')).toLowerCase()

  // 技术类关键词
  if (/programming|code|software|algorithm|database|api|framework|language/.test(text)) {
    return 'technical'
  }
  // 科普类关键词
  if (/science|physics|chemistry|biology|math|quantum|evolution|cosmos/.test(text)) {
    return 'science'
  }
  // 商业类关键词
  if (/business|management|startup|entrepreneur|marketing|sales|economy|finance/.test(text)) {
    return 'business'
  }
  // 自助类关键词
  if (/habit|productivity|motivation|self.help|success|growth|mindfulness/.test(text)) {
    return 'selfhelp'
  }
  // 历史类关键词
  if (/history|war|empire|dynasty|ancient|medieval|revolution/.test(text)) {
    return 'history'
  }
  // 哲学类关键词
  if (/philosophy|ethic|moral|logic|existence|consciousness|meaning/.test(text)) {
    return 'philosophy'
  }
  // 小说类关键词
  if (/novel|fiction|story|tale|literature/.test(text)) {
    return 'fiction'
  }
  // 人文类关键词
  if (/culture|society|art|music|literature|religion|anthropology/.test(text)) {
    return 'humanities'
  }

  return 'other'
}

// ============================================================================
// 学习进度追踪增强
// ============================================================================

export interface EnhancedProgress {
  bookId: string
  learningMode: LearningMode
  phaseProgress: Record<string, {
    completed: boolean
    timeSpent: number  // 毫秒
    reviewCount: number  // 复习次数
    lastReviewedAt: number
    thinkingAnswers: Record<string, string>  // 思考题答案
  }>
  customPhases?: PhaseCustomization[]
  category?: BookCategory
  startedAt: number
  lastAccessedAt: number
}

// ============================================================================
// 辅助函数
// ============================================================================

export function getModeDescription(mode: LearningMode, lang: Language): string {
  return LEARNING_MODES[mode].description[lang]
}

export function getRecommendedPhases(category: BookCategory): string[] {
  return CATEGORY_PHASE_CONFIGS[category].recommendedPhases
}

export function getOptionalPhases(category: BookCategory): string[] {
  return CATEGORY_PHASE_CONFIGS[category].optionalPhases
}

export function shouldEmphasizePhase(category: BookCategory, phaseId: string): boolean {
  return CATEGORY_PHASE_CONFIGS[category].emphasis.includes(phaseId)
}
