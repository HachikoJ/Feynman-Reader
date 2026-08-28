import { findMathExpressions, renderMathHtml } from '../mathRendering'

describe('math rendering', () => {
  it('finds inline and block LaTeX delimiters', () => {
    const markdown = '行内 $E=mc^2$ 与 \\(a+b\\)\n\n$$\\int_0^1 x dx$$\n\n\\[A^T A\\]'

    expect(findMathExpressions(markdown)).toEqual(expect.arrayContaining([
      expect.objectContaining({ latex: 'E=mc^2', display: false }),
      expect.objectContaining({ latex: 'a+b', display: false }),
      expect.objectContaining({ latex: '\\int_0^1 x dx', display: true }),
      expect.objectContaining({ latex: 'A^T A', display: true })
    ]))
  })

  it('does not parse formulas inside inline or fenced code', () => {
    const markdown = '`$inline$`\n\n```md\n$$block$$\n```\n\n\\$escaped\\$ and $real$'

    expect(findMathExpressions(markdown).map(expression => expression.latex)).toEqual(['real'])
    expect(findMathExpressions('价格从 $20 降到 $30')).toHaveLength(0)
  })

  it('returns readable KaTeX output for valid and invalid input', () => {
    expect(renderMathHtml('\\frac{a+b}{c}', false)).toContain('katex')
    expect(renderMathHtml('\\invalidcommand{x}', false)).toContain('\\invalidcommand')
  })
})
