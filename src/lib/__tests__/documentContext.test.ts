import {
  buildDocumentContext,
  DEFAULT_DOCUMENT_CONTEXT_CHARS,
  MODEL_CONTEXT_RESERVED_TOKENS,
  MODEL_CONTEXT_TOKEN_LIMIT
} from '../documentContext'

describe('document context retrieval', () => {
  it('keeps a conservative document budget inside the one-million-token window', () => {
    expect(MODEL_CONTEXT_TOKEN_LIMIT).toBe(1_000_000)
    expect(MODEL_CONTEXT_RESERVED_TOKENS).toBe(200_000)
    expect(DEFAULT_DOCUMENT_CONTEXT_CHARS).toBe(600_000)
  })

  it('uses the complete document when it fits the request budget', () => {
    const source = '完整原文内容'
    const context = buildDocumentContext(source, '阶段分析', 100)

    expect(context.content).toBe(source)
    expect(context.complete).toBe(true)
    expect(context.sourceLength).toBe(source.length)
  })

  it('retrieves from the whole document instead of keeping only the prefix', () => {
    const source = `${'开头内容'.repeat(4000)}${'中段内容'.repeat(4000)}LATE_UNIQUE_TOPIC${'结尾内容'.repeat(4000)}`
    const context = buildDocumentContext(source, '分析 LATE_UNIQUE_TOPIC', 15_000)

    expect(context.complete).toBe(false)
    expect(context.content.length).toBeLessThanOrEqual(15_000)
    expect(context.content).toContain('LATE_UNIQUE_TOPIC')
    expect(context.content).toContain('约位于全文 0%')
    expect(context.content).toContain('约位于全文 100%')
  })
})
