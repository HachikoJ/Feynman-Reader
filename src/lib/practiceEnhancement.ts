/**
 * 费曼实践系统增强
 * 解决评分不透明、缺乏渐进式练习、角色随机等问题
 */

import { Language } from './i18n'

// ============================================================================
// 评分标准
// ============================================================================

export interface ScoringCriteria {
  dimension: 'accuracy' | 'completeness' | 'clarity'
  name: { zh: string; en: string }
  description: { zh: string; en: string }
  levels: ScoreLevel[]
  tips: { zh: string; en: string }
}

export interface ScoreLevel {
  range: [number, number]
  label: { zh: string; en: string }
  description: { zh: string; en: string }
  example: { zh: string; en: string }
}

export const SCORING_CRITERIA: Record<'accuracy' | 'completeness' | 'clarity', ScoringCriteria> = {
  accuracy: {
    dimension: 'accuracy',
    name: { zh: '准确度', en: 'Accuracy' },
    description: { zh: '核心观点是否正确理解', en: 'Correctness of core concepts' },
    levels: [
      {
        range: [0, 30],
        label: { zh: '严重错误', en: 'Severe Errors' },
        description: { zh: '核心概念理解错误，或完全与书籍无关', en: 'Core concepts misunderstood or irrelevant' },
        example: { zh: '将作者的观点完全说反了', en: 'Completely misrepresents the author\'s view' }
      },
      {
        range: [30, 50],
        label: { zh: '有明显误解', en: 'Significant Misunderstanding' },
        description: { zh: '对核心概念有明显偏差', en: 'Significant deviation from core concepts' },
        example: { zh: '理解了大概意思但把关键概念混淆了', en: 'Understands general idea but confuses key concepts' }
      },
      {
        range: [50, 70],
        label: { zh: '基本准确', en: 'Basically Accurate' },
        description: { zh: '理解基本正确，有小瑕疵', en: 'Basically correct with minor flaws' },
        example: { zh: '核心概念正确，但表述不够精确', en: 'Core concepts correct but imprecise' }
      },
      {
        range: [70, 85],
        label: { zh: '准确无误', en: 'Accurate' },
        description: { zh: '理解准确，表达清晰', en: 'Accurate understanding, clear expression' },
        example: { zh: '准确理解并表达出核心观点', en: 'Accurately understands and expresses core views' }
      },
      {
        range: [85, 100],
        label: { zh: '深刻准确', en: 'Profoundly Accurate' },
        description: { zh: '理解深入，有独到见解', en: 'Deep understanding with unique insights' },
        example: { zh: '不仅理解了表面，还能指出深层含义', en: 'Understands beyond surface to deeper meanings' }
      }
    ],
    tips: {
      zh: '确保核心概念无误，用自己的话解释而不是照抄原文',
      en: 'Ensure core concepts are correct, use your own words to explain'
    }
  },
  completeness: {
    dimension: 'completeness',
    name: { zh: '完整度', en: 'Completeness' },
    description: { zh: '是否涵盖主要内容', en: 'Coverage of main content' },
    levels: [
      {
        range: [0, 30],
        label: { zh: '内容极少', en: 'Very Little Content' },
        description: { zh: '内容很少，遗漏大部分要点', en: 'Very little content, misses most points' },
        example: { zh: '只有一两句话，没说出任何实质内容', en: 'Only 1-2 sentences, no substance' }
      },
      {
        range: [30, 50],
        label: { zh: '遗漏重要内容', en: 'Missing Important Content' },
        description: { zh: '提到了一些要点但遗漏了关键内容', en: 'Mentions some points but misses key content' },
        example: { zh: '只讲了一个侧面，其他要点都没提到', en: 'Only covers one aspect, misses other points' }
      },
      {
        range: [50, 70],
        label: { zh: '基本完整', en: 'Basically Complete' },
        description: { zh: '涵盖了主要内容，但有遗漏', en: 'Covers main content but with omissions' },
        example: { zh: '主要观点都提到了，但细节可以更丰富', en: 'Main views covered but details could be richer' }
      },
      {
        range: [70, 85],
        label: { zh: '内容完整', en: 'Complete Content' },
        description: { zh: '涵盖全面，结构清晰', en: 'Comprehensive coverage, clear structure' },
        example: { zh: '各个方面都照顾到了，逻辑清晰', en: 'All aspects covered, clear logic' }
      },
      {
        range: [85, 100],
        label: { zh: '全面深入', en: 'Comprehensive and Deep' },
        description: { zh: '内容全面且有拓展', en: 'Comprehensive with extensions' },
        example: { zh: '不仅全面，还能举一反三', en: 'Not only comprehensive but also extends ideas' }
      }
    ],
    tips: {
      zh: '回答应包含：核心观点、关键论证、实际例子、个人理解',
      en: 'Include: core views, key arguments, examples, personal understanding'
    }
  },
  clarity: {
    dimension: 'clarity',
    name: { zh: '清晰度', en: 'Clarity' },
    description: { zh: '表达是否通俗易懂', en: 'How easy it is to understand' },
    levels: [
      {
        range: [0, 30],
        label: { zh: '表达混乱', en: 'Confusing Expression' },
        description: { zh: '逻辑混乱，难以理解', en: 'Illogical, hard to understand' },
        example: { zh: '东一句西一句，不知道在说什么', en: 'All over the place, unclear what is being said' }
      },
      {
        range: [30, 50],
        label: { zh: '表达不清', en: 'Unclear Expression' },
        description: { zh: '表达不够清晰，需要反复阅读', en: 'Not clear enough, needs re-reading' },
        example: { zh: '能看懂但读起来很费劲', en: 'Understandable but requires effort' }
      },
      {
        range: [50, 70],
        label: { zh: '基本清晰', en: 'Basically Clear' },
        description: { zh: '表达基本清楚，外行能懂', en: 'Basically clear, laypeople can understand' },
        example: { zh: '讲明白了，但可以更生动一些', en: 'Clear but could be more vivid' }
      },
      {
        range: [70, 85],
        label: { zh: '清晰易懂', en: 'Clear and Understandable' },
        description: { zh: '表达清晰，易于理解', en: 'Clear expression, easy to understand' },
        example: { zh: '语言流畅，用词恰当', en: 'Fluent language, appropriate wording' }
      },
      {
        range: [85, 100],
        label: { zh: '生动形象', en: 'Vivid and Engaging' },
        description: { zh: '表达生动，有精彩类比', en: 'Vivid expression with great analogies' },
        example: { zh: '用生活化的类比，让人豁然开朗', en: 'Uses everyday analogies that enlighten' }
      }
    ],
    tips: {
      zh: '使用简单词汇、具体例子、类比说明，避免专业术语',
      en: 'Use simple words, concrete examples, analogies, avoid jargon'
    }
  }
}

/**
 * 获取评分标准说明
 */
export function getScoringExplanation(lang: Language): string {
  if (lang === 'zh') {
    return `## 费曼实践评分标准

### 综合评分规则
- **及格线**: 60分
- **任一维度<40分**: 综合评分不超过50分
- **任一维度<50分**: 综合评分不超过60分
- **通过条件**: 综合评分 ≥ 60分

### 三维度详解

#### 1. 准确度 - 核心观点是否正确理解
- **85-100分 深刻准确**: 理解深入，有独到见解
- **70-85分 准确无误**: 准确理解，表达清晰
- **50-70分 基本准确**: 理解基本正确，有小瑕疵
- **30-50分 有明显误解**: 对核心概念有明显偏差
- **0-30分 严重错误**: 核心概念理解错误

#### 2. 完整度 - 是否涵盖主要内容
- **85-100分 全面深入**: 内容全面且有拓展
- **70-85分 内容完整**: 涵盖全面，结构清晰
- **50-70分 基本完整**: 涵盖主要内容，但有遗漏
- **30-50分 遗漏重要内容**: 提到了一些要点但遗漏了关键内容
- **0-30分 内容极少**: 内容很少，遗漏大部分要点

#### 3. 清晰度 - 表达是否通俗易懂
- **85-100分 生动形象**: 表达生动，有精彩类比
- **70-85分 清晰易懂**: 表达清晰，易于理解
- **50-70分 基本清晰**: 表达基本清楚，外行能懂
- **30-50分 表达不清**: 表达不够清晰，需要反复阅读
- **0-30分 表达混乱**: 逻辑混乱，难以理解

### 提分建议
1. **准确度**: 确保核心概念无误，用自己的话解释而不是照抄原文
2. **完整度**: 回答应包含核心观点、关键论证、实际例子、个人理解
3. **清晰度**: 使用简单词汇、具体例子、类比说明，避免专业术语`
  }

  return `## Feynman Practice Scoring Criteria

### Overall Scoring Rules
- **Passing Score**: 60 points
- **If any dimension < 40**: Overall score ≤ 50
- **If any dimension < 50**: Overall score ≤ 60
- **Pass Condition**: Overall score ≥ 60

### Three Dimensions Explained

#### 1. Accuracy - Correctness of core concepts
- **85-100**: Deep understanding with unique insights
- **70-85**: Accurate understanding, clear expression
- **50-70**: Basically correct with minor flaws
- **30-50**: Significant misunderstanding
- **0-30**: Severe errors

#### 2. Completeness - Coverage of main content
- **85-100**: Comprehensive with extensions
- **70-85**: Complete coverage, clear structure
- **50-70**: Covers main content but with omissions
- **30-50**: Missing important content
- **0-30**: Very little content

#### 3. Clarity - How easy it is to understand
- **85-100**: Vivid with great analogies
- **70-85**: Clear and easy to understand
- **50-70**: Basically clear, laypeople can understand
- **30-50**: Not clear enough, needs re-reading
- **0-30**: Confusing, hard to understand

### Improvement Tips
1. **Accuracy**: Ensure core concepts are correct, use your own words
2. **Completeness**: Include core views, key arguments, examples, personal understanding
3. **Clarity**: Use simple words, concrete examples, analogies, avoid jargon`
}

// ============================================================================
// 优秀回答示例
// ============================================================================

export interface ExampleAnswer {
  bookCategory: string
  phaseId?: string
  excellent: { zh: string; en: string }
  analysis: { zh: string; en: string }
}

export const EXAMPLE_ANSWERS: ExampleAnswer[] = [
  {
    bookCategory: 'general',
    excellent: {
      zh: `《原子习惯》的核心观点是：微小的改变会通过复利产生巨大效果。

作者提出了四个改变步骤：
1. **让它显而易见** - 把想养成的习惯放在显眼的位置
2. **让它有吸引力** - 把习惯和喜欢的活动绑定
3. **让它变得容易** - 从最小可行的行动开始，比如只读一页书
4. **让它令人满足** - 即时奖励自己

举个实际例子：我想养成晨跑习惯。可以这样做：
- 前一天晚上把跑鞋放在床边（显而易见）
- 跑完后听我喜欢的播客（有吸引力）
- 只跑5分钟就好（变得容易）
- 跑完在日历上打勾（令人满足）

这个理论对我很实用，因为我觉得很多失败的原因就是一开始就想做太多，结果坚持不下来。`,
      en: `The core idea of "Atomic Habits" is that tiny changes compound into massive results.

The author proposes four steps for change:
1. **Make it obvious** - Place habits in visible locations
2. **Make it attractive** - Pair habits with activities you enjoy
3. **Make it easy** - Start with the smallest possible action, like reading just one page
4. **Make it satisfying** - Reward yourself immediately

For example, if I want to build a morning running habit:
- Put running shoes by the bed the night before (obvious)
- Listen to my favorite podcast after running (attractive)
- Just run for 5 minutes to start (easy)
- Check off on the calendar after running (satisfying)

This theory is practical for me because I think many failures come from trying to do too much at once, which makes it hard to persist.`
    },
    analysis: {
      zh: `**准确度**: 95分 - 准确概括了四个步骤，有具体例子
**完整度**: 90分 - 涵盖核心理论+实践应用+个人反思
**清晰度**: 90分 - 结构清晰，用词简单，有实际例子`,
      en: `**Accuracy**: 95 - Accurately summarizes the four steps with concrete examples
**Completeness**: 90 - Covers core theory + practical application + personal reflection
**Clarity**: 90 - Clear structure, simple vocabulary, concrete examples`
    }
  }
]

/**
 * 获取优秀回答示例
 */
export function getExampleAnswer(bookName: string, lang: Language): ExampleAnswer | null {
  // 可以根据书籍类型返回不同的示例
  return EXAMPLE_ANSWERS[0]
}

// ============================================================================
// 渐进式练习模板
// ============================================================================

export interface PracticeTemplate {
  id: string
  name: { zh: string; en: string }
  description: { zh: string; en: string }
  steps: PracticeStep[]
}

export interface PracticeStep {
  order: number
  title: { zh: string; en: string }
  guidance: { zh: string; en: string }
  template: { zh: string; en: string }
  minChars: number
  targetChars: number
}

export const PRACTICE_TEMPLATES: PracticeTemplate[] = [
  {
    id: 'beginner',
    name: { zh: '入门模式', en: 'Beginner Mode' },
    description: { zh: '分步引导，从简单开始', en: 'Step-by-step guided practice' },
    steps: [
      {
        order: 1,
        title: { zh: '第一步：识别核心观点', en: 'Step 1: Identify Core View' },
        guidance: {
          zh: '这本书最想表达的一个核心观点是什么？用一句话概括。',
          en: 'What is the single most important core view of this book? Summarize in one sentence.'
        },
        template: {
          zh: '这本书的核心观点是：\n\n简单来说，',
          en: 'The core view of this book is:\n\nSimply put, '
        },
        minChars: 50,
        targetChars: 100
      },
      {
        order: 2,
        title: { zh: '第二步：关键论证', en: 'Step 2: Key Arguments' },
        guidance: {
          zh: '作者用什么证据或例子来支持这个观点？列出2-3个。',
          en: 'What evidence or examples does the author use to support this view? List 2-3.'
        },
        template: {
          zh: '作者用了以下证据支持这个观点：\n1. \n2. \n3. ',
          en: 'The author uses the following evidence to support this view:\n1. \n2. \n3. '
        },
        minChars: 80,
        targetChars: 150
      },
      {
        order: 3,
        title: { zh: '第三步：实际应用', en: 'Step 3: Practical Application' },
        guidance: {
          zh: '这个观点可以怎么应用到实际生活中？举一个具体例子。',
          en: 'How can this view be applied to real life? Give a concrete example.'
        },
        template: {
          zh: '这个观点可以应用到生活中，比如：\n\n我之前 ，读了这本书后，我会',
          en: 'This view can be applied to life, for example:\n\nI used to , but after reading this book, I will '
        },
        minChars: 100,
        targetChars: 200
      },
      {
        order: 4,
        title: { zh: '第四步：整合表达', en: 'Step 4: Integrate' },
        guidance: {
          zh: '把以上内容整合起来，用自己的话向别人介绍这本书。',
          en: 'Integrate the above content and explain this book to someone else in your own words.'
        },
        template: {
          zh: '我想向你推荐一本书《BOOK_NAME》。\n\n核心观点：\n\n支持的证据：\n\n实际应用：',
          en: 'I want to recommend a book called "BOOK_NAME" to you.\n\nCore view:\n\nSupporting evidence:\n\nPractical application:'
        },
        minChars: 200,
        targetChars: 300
      }
    ]
  },
  {
    id: 'intermediate',
    name: { zh: '进阶模式', en: 'Intermediate Mode' },
    description: { zh: '结构化表达，增加深度', en: 'Structured expression with depth' },
    steps: [
      {
        order: 1,
        title: { zh: '核心观点概述', en: 'Core View Overview' },
        guidance: {
          zh: '用2-3句话概述这本书的核心思想。',
          en: 'Summarize the core idea of this book in 2-3 sentences.'
        },
        template: {
          zh: '这本书的核心思想是：\n\n换句话说，',
          en: 'The core idea of this book is:\n\nIn other words, '
        },
        minChars: 80,
        targetChars: 150
      },
      {
        order: 2,
        title: { zh: '关键概念解释', en: 'Key Concepts Explanation' },
        guidance: {
          zh: '解释书中的2-3个关键概念，用日常生活的例子类比。',
          en: 'Explain 2-3 key concepts from the book, using everyday life analogies.'
        },
        template: {
          zh: '书中提到一个重要概念「」，\n\n可以用生活类比来理解：\n\n另一个关键概念是',
          en: 'The book mentions an important concept "", \n\nThink of it this way: \n\nAnother key concept is '
        },
        minChars: 120,
        targetChars: 200
      },
      {
        order: 3,
        title: { zh: '核心论证', en: 'Core Arguments' },
        guidance: {
          zh: '作者最核心的论证是什么？前提是什么？结论是什么？',
          en: 'What is the author\'s core argument? What are the premises and conclusion?'
        },
        template: {
          zh: '作者的核心论证是：\n\n前提是：\n\n所以得出结论：',
          en: 'The author\'s core argument is:\n\nThe premise is:\n\nTherefore, the conclusion is:'
        },
        minChars: 100,
        targetChars: 180
      },
      {
        order: 4,
        title: { zh: '个人理解与应用', en: 'Personal Understanding & Application' },
        guidance: {
          zh: '读完这本书，你最大的收获是什么？打算怎么应用？',
          en: 'What is your biggest takeaway from this book? How do you plan to apply it?'
        },
        template: {
          zh: '我最大的收获是：\n\n我打算这样应用到生活中：\n\n具体来说，',
          en: 'My biggest takeaway is:\n\nI plan to apply it this way:\n\nSpecifically, '
        },
        minChars: 150,
        targetChars: 250
      }
    ]
  },
  {
    id: 'advanced',
    name: { zh: '高级模式', en: 'Advanced Mode' },
    description: { zh: '自由表达，深度思考', en: 'Free expression with deep thinking' },
    steps: [
      {
        order: 1,
        title: { zh: '自由表达', en: 'Free Expression' },
        guidance: {
          zh: '用你自己的方式，向别人介绍这本书的核心观点。',
          en: 'Introduce the core view of this book to someone in your own way.'
        },
        template: {
          zh: '',
          en: ''
        },
        minChars: 200,
        targetChars: 300
      }
    ]
  }
]

// ============================================================================
// 进度追踪
// ============================================================================

export interface ProgressRecord {
  id: string
  bookId: string
  type: 'teaching' | 'qa'
  timestamp: number
  scores?: {
    accuracy: number
    completeness: number
    clarity: number
    overall: number
  }
  passed: boolean
}

export interface ScoreTrend {
  records: ProgressRecord[]
  current: number
  best: number
  average: number
  trend: 'improving' | 'stable' | 'declining'
  improvement: number // 相对于第一次的改善程度
}

/**
 * 计算分数趋势
 */
export function calculateScoreTrend(records: ProgressRecord[]): ScoreTrend {
  if (records.length === 0) {
    return {
      records: [],
      current: 0,
      best: 0,
      average: 0,
      trend: 'stable',
      improvement: 0
    }
  }

  const scores = records.map(r => r.scores?.overall || 0).filter(s => s > 0)
  const current = scores[scores.length - 1] || 0
  const best = Math.max(...scores, 0)
  const average = scores.reduce((a, b) => a + b, 0) / scores.length

  // 计算趋势（比较最近3次和之前3次的平均分）
  let trend: 'improving' | 'stable' | 'declining' = 'stable'
  if (scores.length >= 6) {
    const recentAvg = scores.slice(-3).reduce((a, b) => a + b, 0) / 3
    const earlierAvg = scores.slice(-6, -3).reduce((a, b) => a + b, 0) / 3
    if (recentAvg > earlierAvg + 5) trend = 'improving'
    else if (recentAvg < earlierAvg - 5) trend = 'declining'
  }

  // 计算相对于第一次的改善程度
  const first = scores[0] || 0
  const improvement = first > 0 ? ((current - first) / first) * 100 : 0

  return {
    records,
    current,
    best,
    average,
    trend,
    improvement
  }
}

/**
 * 获取趋势描述
 */
export function getTrendDescription(trend: ScoreTrend, lang: Language): string {
  const { current, best, average, trend: trendType, improvement } = trend

  if (lang === 'zh') {
    let desc = `当前 ${current.toFixed(0)}分 | 最高 ${best}分 | 平均 ${average.toFixed(1)}分\n`

    if (improvement > 20) {
      desc += `📈 进步显著：比首次提高 ${improvement.toFixed(0)}%`
    } else if (improvement > 0) {
      desc += `📈 持续进步：比首次提高 ${improvement.toFixed(0)}%`
    } else if (improvement < -10) {
      desc += `📉 有所下降：比首次下降 ${Math.abs(improvement).toFixed(0)}%`
    } else {
      desc += `➡️ 保持稳定`
    }

    if (trendType === 'improving') {
      desc += '\n🎯 最近表现呈上升趋势，继续保持！'
    } else if (trendType === 'declining') {
      desc += '\n⚠️ 最近表现有所下降，建议复习一下核心概念。'
    }

    return desc
  }

  let desc = `Current: ${current.toFixed(0)} | Best: ${best} | Avg: ${average.toFixed(1)}\n`

  if (improvement > 20) {
    desc += `\n📈 Significant improvement: ${improvement.toFixed(0)}% better than first attempt`
  } else if (improvement > 0) {
    desc += `\n📈 Improving: ${improvement.toFixed(0)}% better than first attempt`
  } else if (improvement < -10) {
    desc += `\n📉 Declining: ${Math.abs(improvement).toFixed(0)}% worse than first attempt`
  } else {
    desc += `\n➡️ Stable`
  }

  if (trendType === 'improving') {
    desc += '\n🎯 Recent trend is upward, keep it up!'
  } else if (trendType === 'declining') {
    desc += '\n⚠️ Recent trend is downward, consider reviewing core concepts.'
  }

  return desc
}

// ============================================================================
// 角色选择优化
// ============================================================================

export interface PersonaType {
  id: string
  name: { zh: string; en: string }
  icon: string
  description: { zh: string; en: string }
  category: 'beginner' | 'peer' | 'critical' | 'expert'
}

export const PERSONA_TYPES: PersonaType[] = [
  {
    id: 'elementary',
    name: { zh: '小学生', en: 'Elementary Student' },
    icon: '👦',
    description: { zh: '需要简单的解释和具体的例子', en: 'Needs simple explanations and concrete examples' },
    category: 'beginner'
  },
  {
    id: 'college',
    name: { zh: '大学生', en: 'College Student' },
    icon: '🎓',
    description: { zh: '有一定知识基础，喜欢深入讨论', en: 'Has some knowledge, enjoys deep discussions' },
    category: 'peer'
  },
  {
    id: 'professional',
    name: { zh: '职场人士', en: 'Professional' },
    icon: '💼',
    description: { zh: '关注实际应用和商业价值', en: 'Focuses on practical applications and business value' },
    category: 'peer'
  },
  {
    id: 'scientist',
    name: { zh: '科学家', en: 'Scientist' },
    icon: '🔬',
    description: { zh: '追求精确性和证据，会质疑假设', en: 'Seeks precision and evidence, questions assumptions' },
    category: 'critical'
  },
  {
    id: 'entrepreneur',
    name: { zh: '创业者', en: 'Entrepreneur' },
    icon: '🚀',
    description: { zh: '关注可操作性和市场机会', en: 'Focuses on actionability and market opportunities' },
    category: 'peer'
  },
  {
    id: 'teacher',
    name: { zh: '老师', en: 'Teacher' },
    icon: '👨‍🏫',
    description: { zh: '注重逻辑结构和知识完整性', en: 'Emphasizes logical structure and completeness' },
    category: 'expert'
  },
  {
    id: 'investor',
    name: { zh: '投资者', en: 'Investor' },
    icon: '💰',
    description: { zh: '评估价值和风险，寻找关键指标', en: 'Evaluates value and risk, seeks key metrics' },
    category: 'expert'
  },
  {
    id: 'user',
    name: { zh: '普通读者', en: 'Reader' },
    icon: '📖',
    description: { zh: '关注阅读体验和实际收获', en: 'Focuses on reading experience and practical takeaways' },
    category: 'beginner'
  },
  {
    id: 'competitor',
    name: { zh: '质疑者', en: 'Skeptic' },
    icon: '🤨',
    description: { zh: '喜欢唱反调，会指出漏洞和矛盾', en: 'Likes to play devil\'s advocate, points out flaws' },
    category: 'critical'
  },
  {
    id: 'nitpicker',
    name: { zh: '挑剔者', en: 'Nitpicker' },
    icon: '🔍',
    description: { zh: '关注细节，会询问边缘情况', en: 'Focuses on details, asks about edge cases' },
    category: 'critical'
  }
]

/**
 * 推荐角色组合
 */
export function getRecommendedPersonas(userPreference?: 'beginner' | 'balanced' | 'challenging'): PersonaType[] {
  switch (userPreference) {
    case 'beginner':
      return PERSONA_TYPES.filter(p => p.category === 'beginner' || p.category === 'peer')
    case 'challenging':
      return PERSONA_TYPES.filter(p => p.category === 'critical' || p.category === 'expert')
    default: // balanced
      return [
        PERSONA_TYPES.find(p => p.id === 'elementary')!,
        PERSONA_TYPES.find(p => p.id === 'professional')!,
        PERSONA_TYPES.find(p => p.id === 'scientist')!
      ].filter(Boolean)
  }
}

/**
 * 用户自定义角色选择
 */
export function getSelectedPersonas(selectedIds: string[]): PersonaType[] {
  return PERSONA_TYPES.filter(p => selectedIds.includes(p.id))
}
