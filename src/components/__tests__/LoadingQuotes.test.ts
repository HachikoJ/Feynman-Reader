import { defaultQuotesEn, defaultQuotesZh, localizePresetQuotes } from '../LoadingQuotes'

describe('localized preset quotes', () => {
  it('uses English text and author names throughout the English preset library', () => {
    const cjk = /[\u3400-\u9fff]/

    expect(defaultQuotesEn).not.toHaveLength(0)
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
  })
})
