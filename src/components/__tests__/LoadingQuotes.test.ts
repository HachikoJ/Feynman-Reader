import { defaultQuotesEn, defaultQuotesZh, localizePresetQuotes } from '../LoadingQuotes'
import { mergeDefaultQuotes } from '@/lib/defaultQuotes'

describe('localized preset quotes', () => {
  it('uses English text and author names throughout the English preset library', () => {
    const cjk = /[\u3400-\u9fff]/

    expect(defaultQuotesEn).not.toHaveLength(0)
    expect(defaultQuotesZh).toHaveLength(101)
    expect(defaultQuotesEn).toHaveLength(101)
    expect(defaultQuotesEn).toHaveLength(defaultQuotesZh.length)
    for (const quote of defaultQuotesEn) {
      expect(quote.isPreset).toBe(true)
      expect(quote.text).not.toMatch(cjk)
      expect(quote.author).not.toMatch(cjk)
    }
  })

  it('replaces only preset quotes when the language changes', () => {
    const customQuote = { text: '用户自己的金句', author: '用户', isPreset: false }
    const localized = localizePresetQuotes([...defaultQuotesZh, customQuote], 'en')

    expect(localized.filter(quote => quote.isPreset)).toEqual(defaultQuotesEn)
    expect(localized).toContainEqual(customQuote)
    expect(localized[0]).toEqual(customQuote)
  })

  it('merges the complete system library without losing custom quotes', () => {
    const customQuote = { text: '用户自己的金句', author: '用户', isPreset: false }
    const merged = mergeDefaultQuotes([defaultQuotesZh[0], customQuote, { text: '   ', author: '无效', isPreset: false }, { text: '伪造系统金句', author: '攻击者', isPreset: true }])

    expect(merged.filter(quote => quote.isPreset)).toHaveLength(101)
    expect(merged).toContainEqual(customQuote)
    expect(merged).not.toContainEqual({ text: '伪造系统金句', author: '攻击者', isPreset: true })
    expect(merged.filter(quote => quote.text === defaultQuotesZh[0].text)).toHaveLength(1)
    expect(mergeDefaultQuotes(merged)).toEqual(merged)
  })
})
