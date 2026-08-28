import katex from 'katex'

export interface MathExpression {
  start: number
  end: number
  latex: string
  display: boolean
}

export interface FormulaImage {
  data: Uint8Array
  width: number
  height: number
}

const MATH_PATTERN = /(?<!\\)\$\$([\s\S]+?)(?<!\\)\$\$|\\\[([\s\S]+?)\\\]|\\\(([^\n]+?)\\\)|(?<!\\)\$(?!\$)([^$\n]+?)(?<!\\)\$(?!\d)/g

function maskCode(value: string): string {
  return value
    .replace(/```[\s\S]*?(?:```|$)/g, match => match.replace(/[^\n]/g, ' '))
    .replace(/`[^`\n]*`/g, match => ' '.repeat(match.length))
}

export function findMathExpressions(value: string): MathExpression[] {
  const expressions: MathExpression[] = []
  for (const match of maskCode(value).matchAll(MATH_PATTERN)) {
    const latex = (match[1] || match[2] || match[3] || match[4] || '').trim()
    if (!latex || match.index === undefined) continue
    expressions.push({
      start: match.index,
      end: match.index + match[0].length,
      latex,
      display: Boolean(match[1] || match[2])
    })
  }
  return expressions
}

export function formulaKey(latex: string, display: boolean): string {
  return `${display ? 'block' : 'inline'}:${latex}`
}

export function renderMathHtml(latex: string, display: boolean): string {
  return katex.renderToString(latex, {
    displayMode: display,
    throwOnError: false,
    strict: 'ignore',
    output: 'htmlAndMathml',
    trust: false
  })
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const binary = atob(dataUrl.slice(dataUrl.indexOf(',') + 1))
  return Uint8Array.from(binary, char => char.charCodeAt(0))
}

function textToBase64(value: string): string {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  bytes.forEach(byte => { binary += String.fromCharCode(byte) })
  return btoa(binary)
}

let mathJaxRenderer: Promise<(latex: string, display: boolean) => string> | undefined

function loadMathJaxRenderer(): Promise<(latex: string, display: boolean) => string> {
  if (!mathJaxRenderer) {
    mathJaxRenderer = import('mathjax-full/es5/tex-svg.js').then(async () => {
      const mathJax = (globalThis as typeof globalThis & {
        MathJax?: {
          startup: { promise: Promise<void> }
          tex2svg: (latex: string, options: { display: boolean }) => HTMLElement
        }
      }).MathJax
      if (!mathJax) throw new Error('MathJax browser renderer is unavailable')
      await mathJax.startup.promise
      return (latex: string, display: boolean) => mathJax.tex2svg(latex, { display }).innerHTML
    })
  }
  return mathJaxRenderer
}

function imageFromUrl(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Formula SVG could not be loaded'))
    image.src = url
  })
}

export async function renderFormulaImage(latex: string, display: boolean): Promise<FormulaImage> {
  const renderSvg = await loadMathJaxRenderer()
  const output = renderSvg(latex, display)
  const svgMatch = output.match(/<svg[\s\S]*<\/svg>/)
  if (!svgMatch) throw new Error('MathJax did not return an SVG formula')

  const parsed = new DOMParser().parseFromString(svgMatch[0], 'image/svg+xml')
  const svg = parsed.documentElement
  const viewBox = (svg.getAttribute('viewBox') || '').split(/\s+/).map(Number)
  const viewBoxWidth = viewBox[2]
  const viewBoxHeight = viewBox[3]
  if (!(viewBoxWidth > 0 && viewBoxHeight > 0)) throw new Error('MathJax returned an invalid formula size')

  const heightEx = Number.parseFloat(svg.getAttribute('height') || '') || (display ? 3 : 2)
  const height = Math.round(Math.min(display ? 120 : 54, Math.max(display ? 36 : 24, heightEx * 16)))
  const width = Math.round(Math.min(760, Math.max(24, height * viewBoxWidth / viewBoxHeight)))
  svg.setAttribute('width', String(width * 2))
  svg.setAttribute('height', String(height * 2))
  svg.setAttribute('style', `color:#0f172a;background:#ffffff;${svg.getAttribute('style') || ''}`)

  const source = new XMLSerializer().serializeToString(svg)
  const image = await imageFromUrl(`data:image/svg+xml;base64,${textToBase64(source)}`)
  const canvas = document.createElement('canvas')
  canvas.width = width * 2
  canvas.height = height * 2
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas is unavailable for formula export')
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.drawImage(image, 0, 0, canvas.width, canvas.height)
  return { data: dataUrlToBytes(canvas.toDataURL('image/png')), width, height }
}

export async function renderFormulaImageMap(markdown: string): Promise<Map<string, FormulaImage>> {
  const images = new Map<string, FormulaImage>()
  const unique = new Map<string, MathExpression>()
  findMathExpressions(markdown).forEach(expression => unique.set(formulaKey(expression.latex, expression.display), expression))
  for (const [key, expression] of unique) {
    try {
      images.set(key, await renderFormulaImage(expression.latex, expression.display))
    } catch {
      // Keep the raw LaTeX in exports when a browser cannot rasterize one formula.
    }
  }
  return images
}
