'use client'

import { useMemo } from 'react'
import { renderMathHtml } from '@/lib/mathRendering'

export default function MathFormula({ latex, display = false }: { latex: string; display?: boolean }) {
  const html = useMemo(() => renderMathHtml(latex, display), [display, latex])
  const label = `${display ? '块级' : '行内'}数学公式：${latex}`

  return display ? (
    <div className="markdown-math-block" role="math" aria-label={label} tabIndex={0} dangerouslySetInnerHTML={{ __html: html }} />
  ) : (
    <span className="markdown-math-inline" role="math" aria-label={label} dangerouslySetInnerHTML={{ __html: html }} />
  )
}
