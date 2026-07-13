import { getRecommendationErrorMessage, parseRecommendations } from '../BookRecommendations'
import { AI_CONTEXT_LIMIT_EXCEEDED, AI_DATA_CONSENT_REQUIRED } from '@/lib/deepseek'

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

  it('removes the current book from every recommendation group', () => {
    const currentBook = { ...book, title: '《乌合之众》' }
    const otherBook = { ...book, title: '心理学导论' }
    const parsed = parseRecommendations({
      sameAuthor: [currentBook, otherBook],
      relatedTopics: [{ category: '群体心理', books: [currentBook, otherBook] }],
      readingPath: [
        { level: '入门', book: currentBook },
        { level: '进阶', book: otherBook }
      ]
    }, ' 乌合之众 ')

    expect(parsed.sameAuthor.map(item => item.title)).toEqual(['心理学导论'])
    expect(parsed.relatedTopics[0].books.map(item => item.title)).toEqual(['心理学导论'])
    expect(parsed.readingPath.map(item => item.book.title)).toEqual(['心理学导论'])
  })

  it('rejects a result containing only the current book', () => {
    expect(() => parseRecommendations({
      sameAuthor: [{ ...book, title: '《乌合之众》' }],
      relatedTopics: [],
      readingPath: []
    }, '乌合之众')).toThrow('推荐结果不能为空')
  })

  it('explains consent failures instead of failing silently', () => {
    expect(getRecommendationErrorMessage(new Error(AI_DATA_CONSENT_REQUIRED), 'zh'))
      .toContain('同意 AI 数据传输')
  })

  it('explains malformed AI recommendation data without exposing parser details', () => {
    expect(getRecommendationErrorMessage(new Error('推荐数据字段无效：sameAuthor[0].year'), 'zh'))
      .toContain('推荐格式不完整')
  })

  it('explains context limit failures and confirms existing recommendations are kept', () => {
    const message = getRecommendationErrorMessage(new Error(AI_CONTEXT_LIMIT_EXCEEDED), 'zh')

    expect(message).toContain('文档上下文过长')
    expect(message).toContain('已有推荐不会被清除')
  })
})
