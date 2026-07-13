'use client'

import { useState, useEffect, useRef } from 'react'
import { logger } from '@/lib/logger'
import { Language } from '@/lib/i18n'
import { Book, addBook, flushPendingStoreWrites, getBooks, reloadBookFromPersistence } from '@/lib/store'
import { AI_CONTEXT_LIMIT_EXCEEDED, AI_DATA_CONSENT_REQUIRED, createDeepSeekClient, withDeepSeekDefaults, withDocumentContextRetry } from '@/lib/deepseek'
import { secureSystemPrompt, secureUserMessage } from '@/lib/promptSecurity'
import LoadingQuotes from './LoadingQuotes'
import AppIcon from './AppIcon'

interface RecommendedBook {
  title: string
  author: string
  year?: string
  description: string
  reason: string
  difficulty?: 'beginner' | 'intermediate' | 'advanced'
  category?: string
}

interface Recommendations {
  sameAuthor: RecommendedBook[]
  relatedTopics: { category: string; books: RecommendedBook[] }[]
  readingPath: { level: string; book: RecommendedBook }[]
}

function recommendationText(value: unknown, field: string, maxLength: number, required = true): string | undefined {
  if ((value === undefined || value === null) && !required) return undefined
  if (typeof value !== 'string' || !value.trim() || value.length > maxLength) {
    throw new Error(`推荐数据字段无效：${field}`)
  }
  return value.trim()
}

function recommendationYear(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value === 'number') {
    if (!Number.isInteger(value) || value < 0 || value > 9999) {
      throw new Error(`推荐数据字段无效：${field}`)
    }
    return String(value)
  }
  return recommendationText(value, field, 20, false)
}

function parseRecommendedBook(value: unknown, path: string): RecommendedBook {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`推荐数据无效：${path}`)
  const item = value as Record<string, unknown>
  const difficulty = item.difficulty === 'beginner' || item.difficulty === 'intermediate' || item.difficulty === 'advanced'
    ? item.difficulty
    : undefined
  const year = recommendationYear(item.year, `${path}.year`)
  const category = recommendationText(item.category, `${path}.category`, 100, false)
  return {
    title: recommendationText(item.title, `${path}.title`, 200)!,
    author: recommendationText(item.author, `${path}.author`, 100)!,
    description: recommendationText(item.description, `${path}.description`, 1000)!,
    reason: recommendationText(item.reason, `${path}.reason`, 2000)!,
    ...(year ? { year } : {}),
    ...(difficulty ? { difficulty } : {}),
    ...(category ? { category } : {})
  }
}

function normalizeRecommendationTitle(title: string): string {
  return title
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s《》〈〉「」『』【】〔〕“”"'‘’（）()·:：,，.。!！?？\-—_]/g, '')
}

export function parseRecommendations(value: unknown, excludedTitle?: string): Recommendations {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('推荐数据必须是对象')
  const item = value as Record<string, unknown>
  if (!Array.isArray(item.sameAuthor) || item.sameAuthor.length > 10) throw new Error('同作者推荐数据无效')
  if (!Array.isArray(item.relatedTopics) || item.relatedTopics.length > 10) throw new Error('主题推荐数据无效')
  if (!Array.isArray(item.readingPath) || item.readingPath.length > 10) throw new Error('阅读路径数据无效')

  const parsedRecommendations: Recommendations = {
    sameAuthor: item.sameAuthor.map((book, index) => parseRecommendedBook(book, `sameAuthor[${index}]`)),
    relatedTopics: item.relatedTopics.map((topic, index) => {
      if (!topic || typeof topic !== 'object' || Array.isArray(topic)) throw new Error(`主题推荐 ${index} 无效`)
      const topicItem = topic as Record<string, unknown>
      if (!Array.isArray(topicItem.books) || topicItem.books.length > 10) throw new Error(`主题推荐 ${index} 的书籍无效`)
      return {
        category: recommendationText(topicItem.category, `relatedTopics[${index}].category`, 100)!,
        books: topicItem.books.map((book, bookIndex) => parseRecommendedBook(book, `relatedTopics[${index}].books[${bookIndex}]`))
      }
    }),
    readingPath: item.readingPath.map((step, index) => {
      if (!step || typeof step !== 'object' || Array.isArray(step)) throw new Error(`阅读路径 ${index} 无效`)
      const stepItem = step as Record<string, unknown>
      return {
        level: recommendationText(stepItem.level, `readingPath[${index}].level`, 100)!,
        book: parseRecommendedBook(stepItem.book, `readingPath[${index}].book`)
      }
    })
  }

  const normalizedExcludedTitle = excludedTitle ? normalizeRecommendationTitle(excludedTitle) : ''
  const isExcluded = (recommendedBook: RecommendedBook) =>
    Boolean(normalizedExcludedTitle) && normalizeRecommendationTitle(recommendedBook.title) === normalizedExcludedTitle

  const recommendations: Recommendations = normalizedExcludedTitle
    ? {
        sameAuthor: parsedRecommendations.sameAuthor.filter(recommendedBook => !isExcluded(recommendedBook)),
        relatedTopics: parsedRecommendations.relatedTopics
          .map(topic => ({ ...topic, books: topic.books.filter(recommendedBook => !isExcluded(recommendedBook)) }))
          .filter(topic => topic.books.length > 0),
        readingPath: parsedRecommendations.readingPath.filter(step => !isExcluded(step.book))
      }
    : parsedRecommendations

  const recommendationCount = recommendations.sameAuthor.length +
    recommendations.relatedTopics.reduce((sum, topic) => sum + topic.books.length, 0) +
    recommendations.readingPath.length
  if (recommendationCount === 0) throw new Error('推荐结果不能为空')

  return recommendations
}

export function getRecommendationErrorMessage(error: unknown, lang: Language): string {
  if (error instanceof Error && error.message === AI_DATA_CONSENT_REQUIRED) {
    return lang === 'zh'
      ? '请先在设置中同意 AI 数据传输，再获取相关推荐。'
      : 'Please consent to AI data transfer in Settings before requesting recommendations.'
  }

  if (error instanceof Error && error.message === AI_CONTEXT_LIMIT_EXCEEDED) {
    return lang === 'zh'
      ? '文档上下文过长，系统自动缩减后仍未能生成推荐。已有推荐不会被清除，请拆分文档后重试。'
      : 'The document context is too long even after automatic reduction. Existing recommendations were kept; split the document and try again.'
  }

  if (error instanceof Error && error.message === 'RECOMMENDATION_SAVE_FAILED') {
    return lang === 'zh'
      ? '推荐已生成，但未能保存到本地。原有推荐已保留，请检查本地存储后重试。'
      : 'Recommendations were generated but could not be saved locally. Existing recommendations were kept.'
  }

  if (error instanceof SyntaxError || (error instanceof Error && (
    error.message.startsWith('推荐数据') ||
    error.message.includes('推荐数据无效') ||
    error.message.includes('推荐结果不能为空') ||
    error.message.includes('recommendation JSON') ||
    error.message.includes('AI response was empty')
  ))) {
    return lang === 'zh'
      ? 'AI 返回的推荐格式不完整，已自动拦截，请重新获取。已有推荐不会被清除。'
      : 'The AI returned incomplete recommendation data. Please try again; existing recommendations were kept.'
  }

  return lang === 'zh'
    ? '推荐生成失败，请检查网络和 API Key 后重试。已有推荐不会被清除。'
    : 'Could not generate recommendations. Check your network and API key, then try again. Existing recommendations were kept.'
}

interface Props {
  book: Book
  apiKey: string
  lang: Language
  quotes?: { text: string; author: string }[]
  recommendations: string
  onRecommendationsChange: (recs: string) => Promise<void>
  loadingRecommendations: boolean
  onLoadingChange: (loading: boolean) => void
}

export default function BookRecommendations({
  book,
  apiKey,
  lang,
  quotes = [],
  recommendations: savedRecommendations,
  onRecommendationsChange,
  loadingRecommendations,
  onLoadingChange
}: Props) {
  const [recommendations, setRecommendations] = useState<Recommendations | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [addingBookKey, setAddingBookKey] = useState<string | null>(null)
  const addingBookKeysRef = useRef(new Set<string>())

  // 加载已保存的推荐
  useEffect(() => {
    if (savedRecommendations) {
      try {
        const data = parseRecommendations(JSON.parse(savedRecommendations), book.name)
        setRecommendations(data)
        setErrorMessage(null)
      } catch (error) {
        logger.warn('Saved recommendation data could not be parsed.')
        setErrorMessage(lang === 'zh'
          ? '已保存的推荐数据无法读取，请重新生成。'
          : 'Saved recommendations could not be read. Please regenerate them.')
      }
    } else {
      setRecommendations(null)
    }
  }, [savedRecommendations, lang, book.name])

  // 检查书籍是否已在书架中
  const isBookInShelf = (title: string, author: string): boolean => {
    const normalizedTitle = title.trim().toLowerCase()
    const normalizedAuthor = author.trim().toLowerCase()
    const allBooks = getBooks()
    return allBooks.some(existingBook =>
      existingBook.name.trim().toLowerCase() === normalizedTitle &&
      (existingBook.author || '').trim().toLowerCase() === normalizedAuthor
    )
  }

  const generateRecommendations = async () => {
    if (loadingRecommendations) return
    if (!apiKey) {
      setErrorMessage(lang === 'zh'
        ? '请先在设置中填写 API Key。'
        : 'Please add an API key in Settings first.')
      return
    }

    setErrorMessage(null)
    onLoadingChange(true)
    try {
      const client = await createDeepSeekClient(apiKey)

      const systemPrompt = `你是一个专业的图书推荐专家。根据输入数据中用户刚读完的书籍，推荐相关的优质书籍。

推荐原则：
1. 推荐的书籍要真实存在，不要编造
2. 要考虑书籍的经典性和影响力
3. 推荐理由要具体，说明与当前书籍的关联
4. 难度要合理标注
5. 严禁在任何推荐分组中返回输入数据里的当前书籍
6. sameAuthor 只能返回同作者的其他著作，不能返回当前书籍的不同版本、译本或再版

返回 JSON 格式：
{
  "sameAuthor": [
    {
      "title": "书名",
      "author": "作者",
      "year": "出版年份",
      "description": "一句话简介",
      "reason": "推荐理由（与当前书的关联）"
    }
  ],
  "relatedTopics": [
    {
      "category": "主题分类",
      "books": [
        {
          "title": "书名",
          "author": "作者",
          "year": "出版年份",
          "description": "一句话简介",
          "reason": "推荐理由",
          "difficulty": "beginner/intermediate/advanced"
        }
      ]
    }
  ],
  "readingPath": [
    {
      "level": "入门巩固/深入理解/实践应用",
      "book": {
        "title": "书名",
        "author": "作者",
        "description": "简介",
        "reason": "为什么推荐"
      }
    }
  ]
}

只返回 JSON，不要其他内容。`

      const recommendationTask = `请推荐：
1. 同作者的其他2-3本代表作
2. 相关主题的经典著作（按2-3个主题分类，每类2-3本）
3. 推荐的阅读路径（3个层次：入门巩固、深入理解、实践应用）

要求：
- 推荐的书籍必须真实存在
- 所有分组都必须排除输入数据中的当前书籍
- “同作者”只能推荐该作者的其他著作
- 推荐理由要具体
- 考虑难度梯度`
      const response = await withDocumentContextRetry(
        book.documentContent,
        `${book.name} ${recommendationTask}`,
        240_000,
        documentContext => client.chat.completions.create(withDeepSeekDefaults({
          messages: [
            { role: 'system', content: secureSystemPrompt(systemPrompt) },
            {
              role: 'user',
              content: secureUserMessage(recommendationTask, {
                bookName: book.name,
                author: book.author || '',
                description: book.description || '',
                ...documentContext
              })
            }
          ],
          temperature: 0.7,
          max_tokens: 2000
        }))
      )

      const content = response.choices[0]?.message?.content?.trim()
      if (!content) throw new Error('AI response was empty')
      const jsonMatch = content.match(/\{[\s\S]*\}/)
      if (!jsonMatch) throw new Error('AI response did not contain recommendation JSON')
      const data = parseRecommendations(JSON.parse(jsonMatch[0]), book.name)
      try {
        await onRecommendationsChange(JSON.stringify(data))
      } catch (error) {
        throw new Error('RECOMMENDATION_SAVE_FAILED', { cause: error })
      }
      setRecommendations(data)
    } catch (error) {
      logger.warn('Recommendation generation was not completed.')
      setErrorMessage(getRecommendationErrorMessage(error, lang))
    } finally {
      onLoadingChange(false)
    }
  }

  const handleAddToBookshelf = async (recBook: RecommendedBook) => {
    // 检查是否已存在
    if (isBookInShelf(recBook.title, recBook.author)) {
      return
    }

    const bookKey = `${recBook.title.trim().toLowerCase()}::${recBook.author.trim().toLowerCase()}`
    if (addingBookKeysRef.current.has(bookKey)) return
    addingBookKeysRef.current.add(bookKey)
    setAddingBookKey(bookKey)
    setErrorMessage(null)
    let addedBookId: string | undefined
    try {
      await flushPendingStoreWrites()
      addedBookId = addBook(recBook.title.trim(), recBook.author.trim(), undefined, recBook.description.trim()).id
      await flushPendingStoreWrites()
      setRecommendations(current => current ? { ...current } : current)
    } catch (error) {
      if (addedBookId) await reloadBookFromPersistence(addedBookId).catch(() => undefined)
      logger.error('Adding recommended book failed:', error)
      setErrorMessage(lang === 'zh'
        ? '加入书架失败，未保存的书籍不会显示为已添加。请检查本地存储后重试。'
        : 'The book could not be added. Unsaved books will not appear as added; check local storage and try again.')
    } finally {
      addingBookKeysRef.current.delete(bookKey)
      setAddingBookKey(null)
    }
  }

  const isBookAdded = (recBook: RecommendedBook) => {
    return isBookInShelf(recBook.title, recBook.author)
  }

  const isBookAdding = (recBook: RecommendedBook) => (
    addingBookKey === `${recBook.title.trim().toLowerCase()}::${recBook.author.trim().toLowerCase()}`
  )

  const getDifficultyLabel = (difficulty?: string) => {
    if (!difficulty) return ''
    const labels = {
      beginner: lang === 'zh' ? '入门' : 'Beginner',
      intermediate: lang === 'zh' ? '进阶' : 'Intermediate',
      advanced: lang === 'zh' ? '专业' : 'Advanced'
    }
    return labels[difficulty as keyof typeof labels] || ''
  }

  return (
    <div className="card">
      {loadingRecommendations ? (
        <LoadingQuotes lang={lang} quotes={quotes} />
      ) : (
        <>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="flex items-center gap-2 text-xl font-bold">
                <AppIcon name="bookOpen" tone="violet" size={22} />{lang === 'zh' ? '相关推荐' : 'Related Recommendations'}
              </h3>
              <p className="text-sm text-[var(--text-secondary)] mt-1">
                {lang === 'zh'
                  ? '恭喜完成学习！这里有一些相关书籍推荐，帮助你继续深入探索'
                  : 'Congratulations! Here are some related books to continue your journey'}
              </p>
            </div>
            <div className="flex gap-2">
              {recommendations && (
                <button
                  onClick={generateRecommendations}
                  disabled={loadingRecommendations}
                  className="btn-secondary flex items-center gap-2 text-sm"
                  title={lang === 'zh' ? '基于相同逻辑重新生成推荐' : 'Regenerate with same logic'}
                >
                  <AppIcon name="refresh" tone="violet" size={16} />{lang === 'zh' ? '重新推荐' : 'Regenerate'}
                </button>
              )}
              {!recommendations && (
                <button
                  onClick={generateRecommendations}
                  disabled={loadingRecommendations}
                  className="btn-primary"
                >
                  {lang === 'zh' ? '获取推荐' : 'Get Recommendations'}
                </button>
              )}
            </div>
          </div>

          {errorMessage && (
            <div role="alert" className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-400">
              {errorMessage}
            </div>
          )}

          {recommendations && (
            <div className="mb-6 p-5 bg-yellow-500/10 border-2 border-yellow-500/40 rounded-xl">
              <div className="flex items-start gap-3">
                <AppIcon name="lightbulb" tone="amber" size={24} />
                <div className="flex-1">
                  <h4 className="flex items-center gap-2 font-bold text-[var(--text-primary)] text-base mb-2">
                    <AppIcon name="pin" tone="amber" size={17} />{lang === 'zh' ? '推荐说明' : 'About Recommendations'}
                  </h4>
                  <p className="text-[var(--text-primary)] text-sm leading-relaxed">
                    {lang === 'zh'
                      ? '推荐基于固定逻辑生成：① 同作者的其他著作 ② 相关主题的经典书籍 ③ 进阶阅读路径。如果当前推荐不符合预期，可以点击右上角“重新推荐”按钮获取不同的书籍建议。'
                      : 'Recommendations follow a fixed logic: ① More by same author ② Related classics ③ Reading path. Use Regenerate above for different suggestions if needed.'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {recommendations && (
        <div className="space-y-6 animate-fade-in">
          {/* 同作者的其他著作 */}
          {recommendations.sameAuthor && recommendations.sameAuthor.length > 0 && (
            <div>
              <h4 className="font-semibold mb-3 flex items-center gap-2">
                <AppIcon name="edit" tone="blue" size={18} />
                <span>{lang === 'zh' ? '同作者的其他著作' : 'More by the Same Author'}</span>
              </h4>
              <div className="space-y-3">
                {recommendations.sameAuthor.map((recBook, idx) => (
                  <div key={idx} className="bg-[var(--bg-secondary)] rounded-lg p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <h5 className="font-medium">
                          《{recBook.title}》
                          {recBook.year && <span className="text-sm text-[var(--text-secondary)] ml-2">({recBook.year})</span>}
                        </h5>
                        <p className="text-sm text-[var(--text-secondary)] mt-1">{recBook.description}</p>
                        <p className="flex items-start gap-1.5 text-sm text-[var(--accent)] mt-2">
                          <AppIcon name="lightbulb" tone="amber" size={15} className="mt-0.5" />{recBook.reason}
                        </p>
                      </div>
                      <button
                        onClick={() => handleAddToBookshelf(recBook)}
                        disabled={isBookAdded(recBook) || isBookAdding(recBook)}
                        className={`inline-flex min-h-9 flex-shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1 text-sm ${
                          isBookAdded(recBook) || isBookAdding(recBook)
                            ? 'cursor-not-allowed border border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                            : 'btn-secondary'
                        }`}
                      >
                        {isBookAdding(recBook) ? (
                          <><AppIcon name="refresh" size={14} className="animate-spin" />{lang === 'zh' ? '添加中...' : 'Adding...'}</>
                        ) : isBookAdded(recBook) ? (
                          <><AppIcon name="success" tone="green" size={14} />{lang === 'zh' ? '已添加' : 'Added'}</>
                        ) : (
                          <><AppIcon name="plus" tone="blue" size={14} />{lang === 'zh' ? '加入书架' : 'Add'}</>
                        )}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 相关主题经典著作 */}
          {recommendations.relatedTopics && recommendations.relatedTopics.length > 0 && (
            <div>
              <h4 className="font-semibold mb-3 flex items-center gap-2">
                <AppIcon name="target" tone="green" size={18} />
                <span>{lang === 'zh' ? '相关主题经典著作' : 'Related Classic Works'}</span>
              </h4>
              <div className="space-y-4">
                {recommendations.relatedTopics.map((topic, topicIdx) => (
                  <div key={topicIdx}>
                    <div className="text-sm font-medium text-[var(--accent)] mb-2">
                      【{topic.category}】
                    </div>
                    <div className="space-y-3">
                      {topic.books.map((recBook, bookIdx) => (
                        <div key={bookIdx} className="bg-[var(--bg-secondary)] rounded-lg p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <h5 className="font-medium">《{recBook.title}》</h5>
                                {recBook.difficulty && (
                                  <span className="text-xs px-2 py-0.5 bg-[var(--accent)]/20 text-[var(--accent)] rounded">
                                    {getDifficultyLabel(recBook.difficulty)}
                                  </span>
                                )}
                              </div>
                              <p className="text-sm text-[var(--text-secondary)] mt-1">
                                {recBook.author} {recBook.year && `(${recBook.year})`}
                              </p>
                              <p className="text-sm text-[var(--text-secondary)] mt-1">{recBook.description}</p>
                              <p className="flex items-start gap-1.5 text-sm text-[var(--accent)] mt-2">
                                <AppIcon name="lightbulb" tone="amber" size={15} className="mt-0.5" />{recBook.reason}
                              </p>
                            </div>
                            <button
                              onClick={() => handleAddToBookshelf(recBook)}
                              disabled={isBookAdded(recBook) || isBookAdding(recBook)}
                              className={`inline-flex min-h-9 flex-shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1 text-sm ${
                                isBookAdded(recBook) || isBookAdding(recBook)
                                  ? 'cursor-not-allowed border border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                  : 'btn-secondary'
                              }`}
                            >
                              {isBookAdding(recBook) ? (
                                <><AppIcon name="refresh" size={14} className="animate-spin" />{lang === 'zh' ? '添加中...' : 'Adding...'}</>
                              ) : isBookAdded(recBook) ? (
                                <><AppIcon name="success" tone="green" size={14} />{lang === 'zh' ? '已添加' : 'Added'}</>
                              ) : (
                                <><AppIcon name="plus" tone="blue" size={14} />{lang === 'zh' ? '加入书架' : 'Add'}</>
                              )}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 推荐阅读路径 */}
          {recommendations.readingPath && recommendations.readingPath.length > 0 && (
            <div>
              <h4 className="font-semibold mb-3 flex items-center gap-2">
                <AppIcon name="route" tone="violet" size={18} />
                <span>{lang === 'zh' ? '推荐阅读路径' : 'Recommended Reading Path'}</span>
              </h4>
              <p className="text-sm text-[var(--text-secondary)] mb-3">
                {lang === 'zh' ? '如果你喜欢这本书，可以这样继续：' : 'If you enjoyed this book, continue with:'}
              </p>
              <div className="space-y-3">
                {recommendations.readingPath.map((path, idx) => (
                  <div key={idx} className="bg-[var(--bg-secondary)] rounded-lg p-4">
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[var(--accent)] text-white flex items-center justify-center font-bold">
                        {idx + 1}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex-1">
                            <div className="text-sm font-medium text-[var(--accent)] mb-1">
                              {path.level}
                            </div>
                            <h5 className="font-medium">《{path.book.title}》</h5>
                            <p className="text-sm text-[var(--text-secondary)] mt-1">
                              {path.book.author}
                            </p>
                            <p className="text-sm text-[var(--text-secondary)] mt-1">
                              {path.book.description}
                            </p>
                            <p className="flex items-start gap-1.5 text-sm text-[var(--accent)] mt-2">
                              <AppIcon name="lightbulb" tone="amber" size={15} className="mt-0.5" />{path.book.reason}
                            </p>
                          </div>
                          <button
                            onClick={() => handleAddToBookshelf(path.book)}
                            disabled={isBookAdded(path.book) || isBookAdding(path.book)}
                            className={`inline-flex min-h-9 flex-shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1 text-sm ${
                              isBookAdded(path.book) || isBookAdding(path.book)
                                ? 'cursor-not-allowed border border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                : 'btn-secondary'
                            }`}
                          >
                            {isBookAdding(path.book) ? (
                              <><AppIcon name="refresh" size={14} className="animate-spin" />{lang === 'zh' ? '添加中...' : 'Adding...'}</>
                            ) : isBookAdded(path.book) ? (
                              <><AppIcon name="success" tone="green" size={14} />{lang === 'zh' ? '已添加' : 'Added'}</>
                            ) : (
                              <><AppIcon name="plus" tone="blue" size={14} />{lang === 'zh' ? '加入书架' : 'Add'}</>
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
        </>
      )}
    </div>
  )
}
