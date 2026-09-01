import { mergeAccountSettings } from '../postgresPersistence'
import { defaultQuotesZh } from '@/lib/defaultQuotes'

describe('password account settings merge', () => {
  it('keeps the newer setting values, target Watcha profile, and deduplicated quotes', () => {
    const result = mergeAccountSettings(
      {
        data: {
          language: 'en',
          profile: { customDisplayName: '原账号' },
          quotes: [
            { text: '我的摘录', author: '我' },
            defaultQuotesZh[0],
          ],
        },
        version: 2,
        updated_at: '2026-09-02T00:00:00.000Z',
      },
      {
        data: {
          language: 'zh',
          profile: { watchaNickname: '观猹用户' },
          quotes: [{ text: '我的摘录', author: '我' }],
        },
        version: 3,
        updated_at: '2026-09-01T00:00:00.000Z',
      },
    )

    expect(result.language).toBe('en')
    expect(result.profile).toEqual({ watchaNickname: '观猹用户' })
    expect(result.apiKey).toBe('')
    const quotes = result.quotes as Array<{ text: string; author: string; isPreset?: boolean }>
    expect(quotes.filter(item => item.text === '我的摘录' && item.author === '我')).toHaveLength(1)
    expect(quotes.filter(item => item.text === defaultQuotesZh[0].text)).toHaveLength(1)
    expect(quotes).toHaveLength(defaultQuotesZh.length + 1)
  })

  it('keeps target settings when timestamps are equal', () => {
    const timestamp = '2026-09-01T00:00:00.000Z'
    const result = mergeAccountSettings(
      { data: { language: 'en' }, version: 1, updated_at: timestamp },
      { data: { language: 'zh' }, version: 1, updated_at: timestamp },
    )
    expect(result.language).toBe('zh')
  })
})
