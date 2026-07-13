import { getRecommendationErrorMessage, parseRecommendations } from '../BookRecommendations'
import { AI_DATA_CONSENT_REQUIRED } from '@/lib/deepseek'

describe('recommendation response validation', () => {
  const book = {
    title: '书名',
    author: '作者',
    description: '简介',
    reason: '理由'
  }

  it('accepts a bounded recommendation structure', () => {
    expect(parseRecommendations({
      sameAuthor: [book],
      relatedTopics: [{ category: '主题', books: [book] }],
      readingPath: [{ level: '入门', book }]
    }).sameAuthor).toHaveLength(1)
  })

  it('normalizes numeric publication years returned by the AI', () => {
    const parsed = parseRecommendations({
      sameAuthor: [{ ...book, year: 2021 }],
      relatedTopics: [],
      readingPath: []
    })

    expect(parsed.sameAuthor[0].year).toBe('2021')
  })

  it('ignores null optional recommendation fields', () => {
    const parsed = parseRecommendations({
      sameAuthor: [{ ...book, year: null, category: null }],
      relatedTopics: [],
      readingPath: []
    })

    expect(parsed.sameAuthor[0]).not.toHaveProperty('year')
    expect(parsed.sameAuthor[0]).not.toHaveProperty('category')
  })

  it('rejects invalid numeric publication years', () => {
    expect(() => parseRecommendations({
      sameAuthor: [{ ...book, year: 2021.5 }],
      relatedTopics: [],
      readingPath: []
    })).toThrow('sameAuthor[0].year')
  })

  it('rejects malformed arrays before rendering', () => {
    expect(() => parseRecommendations({
      sameAuthor: 'not-an-array',
      relatedTopics: [],
      readingPath: []
    })).toThrow('同作者推荐数据无效')
  })

  it('rejects a structurally valid but empty recommendation result', () => {
    expect(() => parseRecommendations({
      sameAuthor: [],
      relatedTopics: [],
      readingPath: []
    })).toThrow('推荐结果不能为空')
  })

  it('explains consent failures instead of failing silently', () => {
    expect(getRecommendationErrorMessage(new Error(AI_DATA_CONSENT_REQUIRED), 'zh'))
      .toContain('同意 AI 数据传输')
  })

  it('explains malformed AI recommendation data without exposing parser details', () => {
    expect(getRecommendationErrorMessage(new Error('推荐数据字段无效：sameAuthor[0].year'), 'zh'))
      .toContain('推荐格式不完整')
  })
})
