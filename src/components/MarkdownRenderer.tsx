'use client'

import { Check, Copy, Download } from 'lucide-react'
import { Fragment, useState, type CSSProperties } from 'react'
import type { Language } from '@/lib/i18n'
import type { AssistantSource } from '@/lib/assistantSources'
import { getSafeImageSrc, getSafeLinkHref } from '@/lib/safeUrl'
import { downloadMarkdownAsWord, downloadTableAsExcel } from '@/lib/markdownExport'
import { findMathExpressions } from '@/lib/mathRendering'
import { parseMarkdownHeading } from '@/lib/markdownSyntax'
import AppIcon from './AppIcon'
import HtmlFragment from './HtmlFragment'
import MathFormula from './MathFormula'
import MermaidDiagram from './MermaidDiagram'
import SelectableContent from './SelectableContent'

interface Props {
  content: string
  className?: string
  showWordDownload?: boolean
  onQuoteSelected?: (text: string) => Promise<void> | void
  selectionSource?: AssistantSource | ((text: string) => AssistantSource)
  lang?: Language
  /**
   * 正文在全书中的起始字符偏移。传入时每个标题会带上 `data-reader-offset`，
   * 目录、书签等全书级定位可以据此滚动到标题本身，而不是只跳到所在分节顶部。
  */
  headingOffsetBase?: number
  /**
   * 由 `scanMarkdownHeadings` 预先扫描出的标题全书偏移，按正文标题出现顺序消费。
   * 正文注入高亮或检索标记后不能再用渲染后文本计算偏移，因此优先使用这组原始偏移。
   */
  headingOffsets?: number[]
}

function CopyCodeButton({ value, inline = false }: { value: string; inline?: boolean }) {
  const [copied, setCopied] = useState(false)
  const [failed, setFailed] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setFailed(false)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      setFailed(true)
      window.setTimeout(() => setFailed(false), 1800)
    }
  }

  const label = failed ? '复制失败 / Copy failed' : copied ? '已复制 / Copied' : '复制代码 / Copy code'

  return (
    <button
      type="button"
      onClick={() => void copy()}
      className={inline
        ? 'markdown-inline-code-copy'
        : 'markdown-code-copy'}
      aria-label={label}
      title={label}
    >
      {copied ? <Check size={inline ? 11 : 14} aria-hidden="true" /> : <Copy size={inline ? 11 : 14} aria-hidden="true" />}
      {!inline && (failed ? '失败 / Failed' : copied ? '已复制 / Copied' : '复制 / Copy')}
    </button>
  )
}

function splitTableRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '')
  const cells: string[] = []
  let cell = ''
  let escaped = false
  for (const char of trimmed) {
    if (char === '|' && !escaped) {
      cells.push(cell.trim())
      cell = ''
    } else {
      cell += char
    }
    escaped = char === '\\' && !escaped
  }
  cells.push(cell.trim())
  return cells
}

function isTableDivider(line: string): boolean {
  const cells = splitTableRow(line)
  return cells.length > 0 && cells.every(cell => /^:?-+:?$/.test(cell))
}

function tableAlignment(cell: string): 'left' | 'center' | 'right' | undefined {
  const value = cell.trim()
  if (value.startsWith(':') && value.endsWith(':')) return 'center'
  if (value.endsWith(':')) return 'right'
  if (value.startsWith(':')) return 'left'
  return undefined
}

/**
 * Markdown 的 H1-H6 依次映射到页面里的 h2-h6（H5/H6 都落到 h6），
 * 让正文标题始终位于阅读页的章节标题之下，同时保持逐级递进。
 */
const HEADING_TAGS = ['h2', 'h3', 'h4', 'h5', 'h6', 'h6'] as const
const HEADING_CLASSES = [
  'mt-6 mb-3 text-2xl font-bold leading-tight text-[var(--text-primary)]',
  'mt-6 mb-3 border-l-2 border-[var(--accent)] pl-3 text-xl font-bold leading-tight text-[var(--text-primary)]',
  'mt-5 mb-2 flex items-center gap-2 text-lg font-semibold leading-snug text-[var(--text-primary)]',
  'mt-4 mb-2 flex items-center gap-2 text-base font-semibold leading-snug text-[var(--text-primary)]',
  'mt-3.5 mb-1.5 text-sm font-semibold leading-snug text-[var(--text-primary)]',
  'mt-3 mb-1 text-[13px] font-semibold leading-snug text-[var(--text-secondary)]'
]

/** 分隔线：`---`、`***`、`_ _ _` 等三种以上符号的整行。 */
function isThematicBreak(line: string): boolean {
  const trimmed = line.trim()
  if (!trimmed) return false
  if (/^(?:\*[ \t]*){3,}$/.test(trimmed)) return true
  if (/^(?:-[ \t]*){3,}$/.test(trimmed)) return true
  return /^(?:_[ \t]*){3,}$/.test(trimmed)
}

function isListLine(line: string): boolean {
  if (isThematicBreak(line)) return false
  return /^\s*(?:[-*+•◦▪▸►]\s+|\d+[.、)]\s*)/.test(line)
}

/** 空行后如果还是列表项，说明这是一个松散列表，不能被拆成多个编号都从 1 开始的小列表。 */
function nextNonEmptyLineIsList(lines: string[], from: number): boolean {
  for (let index = from; index < lines.length; index += 1) {
    if (lines[index].trim()) return isListLine(lines[index])
  }
  return false
}

export default function MarkdownRenderer({ content, className = '', showWordDownload = false, onQuoteSelected, selectionSource, lang = 'zh', headingOffsetBase, headingOffsets }: Props) {
  const parseMarkdown = (text: string): JSX.Element[] => {
    const lines = text.split('\n')
    const elements: JSX.Element[] = []
    type ListItem = { content: string; checked?: boolean; depth: number; type: 'ordered' | 'unordered'; start?: number }
    type ListNode = { item: ListItem; children: ListNode[] }
    let listItems: ListItem[] = []
    let blockquoteLines: string[] = []
    let codeBlock: { lang: string; lines: string[]; fence: '`' | '~'; fenceLength: number } | null = null

    const flushTable = (header: string[], divider: string[], body: string[][]) => {
      const columnCount = Math.max(header.length, divider.length, ...body.map(row => row.length))
      const headers = Array.from({ length: columnCount }, (_, index) => header[index] || '')
      const alignments = Array.from({ length: columnCount }, (_, index) => tableAlignment(divider[index] || ''))
      const rows = body.map(row => Array.from({ length: columnCount }, (_, index) => row[index] || ''))
      elements.push(
        <div key={`table-${elements.length}`} className="markdown-table-wrap" role="region" aria-label="Markdown 表格 / Markdown table" tabIndex={0}>
          <div className="markdown-table-toolbar">
            <span>表格 / Table</span>
            <button type="button" className="markdown-table-download" onClick={() => void downloadTableAsExcel({ headers, rows }, 'feynman-table.xlsx')} aria-label="下载 Excel / Download Excel" title="下载 Excel / Download Excel">
              <Download size={13} aria-hidden="true" />
              <span>Excel</span>
            </button>
          </div>
          <table className="markdown-table">
            <thead>
              <tr>{headers.map((cell, index) => <th key={index} style={{ textAlign: alignments[index] }}>{parseInline(cell)}</th>)}</tr>
            </thead>
            {rows.length > 0 && <tbody>{rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, index) => <td key={index} style={{ textAlign: alignments[index] }}>{parseInline(cell)}</td>)}</tr>)}</tbody>}
          </table>
        </div>
      )
    }

    const flushList = () => {
      if (listItems.length > 0) {
        const roots: ListNode[] = []
        const stack: Array<{ depth: number; node: ListNode }> = []
        listItems.forEach(item => {
          while (stack.length && stack[stack.length - 1].depth >= item.depth) stack.pop()
          const node: ListNode = { item, children: [] }
          if (stack.length) stack[stack.length - 1].node.children.push(node)
          else roots.push(node)
          stack.push({ depth: item.depth, node })
        })

        const renderListGroup = (nodes: ListNode[], key: string): JSX.Element => {
          const type = nodes[0]?.item.type === 'ordered' ? 'ol' : 'ul'
          const ListTag = type === 'ol' ? 'ol' : 'ul'
          // 有序列表记录显式起始序号：编号样式用 CSS 计数器绘制，起始值通过自定义属性传给样式表。
          const orderedStart = nodes[0]?.item.start
          const listProps = (type === 'ol'
            ? {
                start: orderedStart ?? 1,
                style: { '--list-start': String(Math.max(0, (orderedStart ?? 1) - 1)) } as CSSProperties
              }
            : {}) as JSX.IntrinsicElements['ol']
          return <ListTag key={key} {...listProps} className={type === 'ol' ? 'my-2 list-decimal space-y-2 pl-6 marker:font-semibold marker:text-[var(--accent)]' : 'my-2 list-disc space-y-2 pl-6 marker:text-[var(--accent)]'}>
            {nodes.map((node, index) => (
              <li key={`${key}-${index}`} className="min-w-0 text-[var(--text-secondary)] leading-relaxed">
                <span className={node.item.checked !== undefined ? 'inline-flex min-w-0 items-start gap-2' : 'min-w-0'}>
                  {node.item.checked !== undefined && <span className="mt-1.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border border-[var(--accent)] text-[11px] leading-none text-[var(--accent)]" aria-label={node.item.checked ? '已完成' : '未完成'}>{node.item.checked ? '✓' : ''}</span>}
                  <span className="min-w-0">{node.item.content.split('\n').map((part, partIndex) => <span key={partIndex}>{partIndex > 0 && <br />}{parseInline(part)}</span>)}</span>
                </span>
                {node.children.length > 0 && renderNodes(node.children, `${key}-${index}-nested`)}
              </li>
            ))}
          </ListTag>
        }

        // 同一层里有序与无序项混排时按类型分组，避免后一种类型的条目被渲染成前一种。
        const renderNodes = (nodes: ListNode[], key: string): JSX.Element => {
          const groups: ListNode[][] = []
          nodes.forEach(node => {
            const current = groups[groups.length - 1]
            if (current && current[0].item.type === node.item.type) current.push(node)
            else groups.push([node])
          })
          if (groups.length === 1) return renderListGroup(groups[0], key)
          return (
            <Fragment key={key}>
              {groups.map((group, index) => renderListGroup(group, `${key}-${index}`))}
            </Fragment>
          )
        }

        elements.push(<div key={`list-${elements.length}`} className="my-3">{renderNodes(roots, `list-${elements.length}`)}</div>)
        listItems = []
      }
    }

    const renderBlockquoteContent = (lines: string[], key: string): JSX.Element[] => {
      const parsedLines = lines.map(line => {
        let depth = 0
        let text = line
        let match = text.match(/^ {0,3}>[ \t]?/)
        while (match) {
          depth += 1
          text = text.slice(match[0].length)
          match = text.match(/^ {0,3}>[ \t]?/)
        }
        return { depth, text }
      })
      const result: JSX.Element[] = []

      for (let index = 0; index < parsedLines.length;) {
        const current = parsedLines[index]
        if (current.depth === 0) {
          if (current.text.trim()) {
            result.push(
              <p key={`${key}-p-${index}`} className="text-[var(--text-primary)] italic leading-relaxed">
                {parseInline(current.text)}
              </p>
            )
          }
          index += 1
          continue
        }

        const nested: string[] = []
        while (index < parsedLines.length && parsedLines[index].depth >= current.depth) {
          const line = parsedLines[index]
          nested.push(`${'>'.repeat(line.depth - current.depth)}${line.depth > current.depth ? ' ' : ''}${line.text}`)
          index += 1
        }
        result.push(
          <blockquote
            key={`${key}-nested-${index}`}
            className="my-3 border-l-2 border-[var(--border)] pl-3 text-[var(--text-secondary)]"
          >
            {renderBlockquoteContent(nested, `${key}-nested-${index}`)}
          </blockquote>
        )
      }

      return result
    }

    const flushBlockquote = () => {
      if (blockquoteLines.length > 0) {
        elements.push(
          <blockquote
            key={`quote-${elements.length}`}
            className="my-4 rounded-r-lg border-l-4 border-[var(--accent)] bg-[var(--accent)]/5 py-3 pl-4 pr-4"
          >
            {renderBlockquoteContent(blockquoteLines, `quote-${elements.length}`)}
          </blockquote>
        )
        blockquoteLines = []
      }
    }

    const flushCodeBlock = () => {
      if (codeBlock) {
        const codeLanguage = codeBlock.lang.toLowerCase().split(/\s+/)[0]
        if (codeLanguage === 'mermaid' || codeLanguage === 'mmd') {
          elements.push(<MermaidDiagram key={`mermaid-${elements.length}`} source={codeBlock.lines.join('\n')} />)
        } else {
          elements.push(
            <div key={`code-${elements.length}`} className="markdown-code-wrap">
              <div className="markdown-code-toolbar"><span>{codeBlock.lang || 'text'}</span><CopyCodeButton value={codeBlock.lines.join('\n')} /></div>
              <pre><code>{codeBlock.lines.join('\n')}</code></pre>
            </div>
          )
        }
        codeBlock = null
      }
    }

    let inlineKeySeed = 0

    // 解析行内元素
    const parseInline = (text: string): (string | JSX.Element)[] => {
      const math = findMathExpressions(text)
      if (math.length > 0) {
        const result: (string | JSX.Element)[] = []
        let offset = 0
        math.forEach((expression, index) => {
          if (expression.start > offset) result.push(...parseInline(text.slice(offset, expression.start)))
          result.push(<MathFormula key={`math-${index}-${expression.start}`} latex={expression.latex} display={false} />)
          offset = expression.end
        })
        if (offset < text.length) result.push(...parseInline(text.slice(offset)))
        return result
      }
      const result: (string | JSX.Element)[] = []
      let keyIndex = 0

      const htmlPattern = /<(?:a|p|h[1-6]|mark|sup|sub|kbd|u|s|small|strong|em|code|del|ins)\b[^>]*>[\s\S]*?<\/(?:a|p|h[1-6]|mark|sup|sub|kbd|u|s|small|strong|em|code|del|ins)>|<br\s*\/?>/i
      const htmlMatch = htmlPattern.exec(text)
      if (htmlMatch) {
        if (htmlMatch.index > 0) result.push(...parseInline(text.slice(0, htmlMatch.index)))
        result.push(<HtmlFragment key={`html-${inlineKeySeed++}`} html={htmlMatch[0]} />)
        if (htmlMatch.index + htmlMatch[0].length < text.length) result.push(...parseInline(text.slice(htmlMatch.index + htmlMatch[0].length)))
        return result
      }

      // Scan for the next token so mixed inline styles (for example bold plus
      // highlights in one sentence) are parsed independently.
      // Images must precede plain links: otherwise `![alt](src)` first matches
      // the link alternative at the `[`, leaving a stray `!` behind.
      const tokenPattern = /==([^=\n]+)==|\*\*([^*\n]+)\*\*|__([^_\n]+)__|~~([^~\n]+)~~|`([^`\n]+)`|!\[([^\]\n]*)\]\(([^)\n]+)\)|\[([^\]]+)\]\(([^)\n]+)\)|\*([^*\n]+)\*|_([^_\n]+)_/
      let offset = 0
      while (offset < text.length) {
        const match = tokenPattern.exec(text.slice(offset))
        if (!match) {
          result.push(text.slice(offset))
          break
        }
        const start = offset + match.index
        if (start > offset) result.push(text.slice(offset, start))

        if (match[1]) {
          result.push(<mark key={`m-${keyIndex++}`} className="rounded bg-amber-200/80 px-1 text-amber-950 dark:bg-amber-300/25 dark:text-amber-100">{match[1]}</mark>)
        } else if (match[2] || match[3]) {
          result.push(<strong key={`b-${keyIndex++}`} className="font-semibold text-[var(--text-primary)]">{match[2] || match[3]}</strong>)
        } else if (match[4]) {
          result.push(<del key={`d-${keyIndex++}`} className="text-[var(--text-secondary)] line-through">{match[4]}</del>)
        } else if (match[5]) {
          result.push(
            <span key={`c-${keyIndex++}`} className="markdown-inline-code">
              <code>{match[5]}</code>
              <CopyCodeButton value={match[5]} inline />
            </span>
          )
        } else if (match[8] && match[9]) {
          const safeHref = getSafeLinkHref(match[9])
          result.push(safeHref ? (
            <a key={`a-${keyIndex++}`} href={safeHref} target="_blank" rel="noopener noreferrer" className="text-[var(--accent)] hover:underline">
              {match[8]}
            </a>
          ) : <span key={`a-${keyIndex++}`}>{match[8]}</span>)
        } else if (match[10] || match[11]) {
          result.push(<em key={`e-${keyIndex++}`} className="italic text-[var(--accent)]">{match[10] || match[11]}</em>)
        } else if (match[6] !== undefined) {
          // 图片：仅有内嵌 data: 图片与站内路径直接渲染，其余远程图片降级为链接，避免加载外部资源。
          const alt = match[6].trim()
          const safeSrc = getSafeImageSrc(match[7])
          const inlineSrc = safeSrc && (safeSrc.startsWith('data:image/') || safeSrc.startsWith('/')) ? safeSrc : null
          if (inlineSrc) {
            result.push(
              // eslint-disable-next-line @next/next/no-img-element -- 文档内嵌图片是 data URI 或站内路径，无需 Next 图片优化
              <img
                key={`img-${keyIndex++}`}
                src={inlineSrc}
                alt={alt}
                loading="lazy"
                referrerPolicy="no-referrer"
                className="my-2 max-h-96 w-auto max-w-full rounded-lg border border-[var(--border)]"
              />
            )
          } else if (safeSrc) {
            result.push(
              <a key={`a-${keyIndex++}`} href={safeSrc} target="_blank" rel="noopener noreferrer" className="text-[var(--accent)] hover:underline">
                {alt || safeSrc}
              </a>
            )
          } else {
            result.push(alt || match[0])
          }
        }
        offset = start + match[0].length
      }

      return result
    }

    // 逐行累加偏移，标题锚点与 `scanMarkdownHeadings` 使用同一套行扫描口径。
    let lineBaseOffset = 0
    const lineStartOffsets: number[] = []
    for (const textLine of lines) {
      lineStartOffsets.push(lineBaseOffset)
      lineBaseOffset += textLine.length + 1
    }

    let headingOrdinal = 0
    const renderHeading = (level: number, title: string, keySeed: number, lineIndex: number): JSX.Element => {
      const index = Math.min(6, Math.max(1, level)) - 1
      const HeadingTag = HEADING_TAGS[index]
      const icon = level === 3 ? 'sparkles' : level === 4 ? 'chevronRight' : null
      const suppliedOffset = headingOffsets?.[headingOrdinal]
      const fallbackOffset = typeof lineStartOffsets[lineIndex] === 'number' && typeof headingOffsetBase === 'number'
        ? headingOffsetBase + lineStartOffsets[lineIndex]
        : undefined
      const offset = typeof suppliedOffset === 'number' && Number.isFinite(suppliedOffset)
        ? suppliedOffset
        : fallbackOffset
      return (
        <HeadingTag
          key={`h${level}-${keySeed}`}
          className={HEADING_CLASSES[index]}
          data-reader-heading="true"
          {...(typeof offset === 'number'
            ? { 'data-reader-offset': String(offset) }
            : {})}
        >
          {icon && <AppIcon name={icon} tone="accent" size={16} />}
          {parseInline(title)}
        </HeadingTag>
      )
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      // 代码块：闭合围栏必须同符号、不短于起始围栏且不带语言标记，
      // 否则围栏样式的行只是代码内容，不能丢。
      const fenceMatch = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/)
      if (codeBlock) {
        const closing = line.match(/^ {0,3}(`{3,}|~{3,})[ \t]*$/)
        const closes = Boolean(
          closing &&
          closing[1][0] === codeBlock.fence &&
          closing[1].length >= codeBlock.fenceLength
        )
        if (closes) {
          flushCodeBlock()
          continue
        }
        codeBlock.lines.push(line)
        continue
      }
      if (fenceMatch) {
        flushList()
        flushBlockquote()
        codeBlock = {
          lang: fenceMatch[2].trim(),
          lines: [],
          fence: fenceMatch[1][0] as '`' | '~',
          fenceLength: fenceMatch[1].length
        }
        continue
      }

      const blockFormulaStart = line.trim().match(/^(\$\$|\\\[)(.*)$/)
      if (blockFormulaStart) {
        flushList()
        flushBlockquote()
        const closing = blockFormulaStart[1] === '$$' ? '$$' : '\\]'
        const parts: string[] = []
        const firstPart = blockFormulaStart[2]
        if (firstPart.endsWith(closing)) {
          parts.push(firstPart.slice(0, -closing.length))
        } else {
          if (firstPart) parts.push(firstPart)
          i += 1
          while (i < lines.length && !lines[i].trim().endsWith(closing)) {
            parts.push(lines[i])
            i += 1
          }
          if (i < lines.length) parts.push(lines[i].trim().slice(0, -closing.length))
        }
        elements.push(<MathFormula key={`math-block-${elements.length}`} latex={parts.join('\n').trim()} display />)
        continue
      }

      // Safe HTML blocks such as tables and details. The fragment is sanitized
      // by HtmlFragment before it is inserted into the document.
      const htmlBlockStart = line.trim().match(/^<(table|details|div|section|article|aside|figure|pre|ul|ol|blockquote|h[1-6])\b/i)
      if (htmlBlockStart) {
        flushList()
        flushBlockquote()
        const tag = htmlBlockStart[1].toLowerCase()
        const htmlLines = [line]
        if (!new RegExp(`</${tag}\\s*>`, 'i').test(line)) {
          i += 1
          while (i < lines.length && !new RegExp(`</${tag}\\s*>`, 'i').test(lines[i])) {
            htmlLines.push(lines[i])
            i += 1
          }
          if (i < lines.length) htmlLines.push(lines[i])
        }
        elements.push(<HtmlFragment key={`html-block-${elements.length}`} html={htmlLines.join('\n')} block />)
        continue
      }

      // GitHub-flavoured Markdown table: header, divider, then optional rows.
      if (
        i + 1 < lines.length &&
        line.includes('|') &&
        // 分隔行本身也要有竖线，否则 `文本 | 文本` + `---` 会被误当成表格。
        lines[i + 1].includes('|') &&
        isTableDivider(lines[i + 1])
      ) {
        flushList()
        flushBlockquote()
        const header = splitTableRow(line)
        const divider = splitTableRow(lines[i + 1])
        const body: string[][] = []
        i += 2
        while (i < lines.length && lines[i].trim() && lines[i].includes('|')) {
          body.push(splitTableRow(lines[i]))
          i += 1
        }
        i -= 1
        flushTable(header, divider, body)
        continue
      }

      // 空行
      if (!line.trim()) {
        flushBlockquote()
        // 松散列表允许列表项之间出现空行：只有后面不再是列表项时才结束当前列表，
        // 否则同一组编号会被拆成多个 ol，序号全部从 1 重新开始。
        if (listItems.length > 0 && !nextNonEmptyLineIsList(lines, i + 1)) flushList()
        continue
      }

      // 引用：嵌套引用的多余 `>` 前缀不渲染成正文
      const blockquoteMatch = line.match(/^ {0,3}>[ \t]?(.*)$/)
      if (blockquoteMatch) {
        flushList()
        blockquoteLines.push(blockquoteMatch[1])
        continue
      } else {
        flushBlockquote()
      }

      // 标题：ATX（# - ######，支持缩进、无空格写法与结尾 #）与 Setext（下一行 === / ---）
      const heading = parseMarkdownHeading(line, lines[i + 1])
      if (heading) {
        flushList()
        const headingLineIndex = i
        // Setext 标题占两行，下一行的下划线要一起消费掉。
        if (heading.lineCount === 2) i += 1
        elements.push(renderHeading(heading.level, heading.title, elements.length, headingLineIndex))
        headingOrdinal += 1
        continue
      }

      // 分隔线（`---`、`***`、`_ _ _` 等），要在列表之前判断
      if (isThematicBreak(line)) {
        flushList()
        elements.push(<hr key={`hr-${elements.length}`} className="my-4 border-[var(--border)]" />)
        continue
      }

      // 无序列表（支持多种符号）
      const taskMatch = line.match(/^\s*[-*]\s+\[([ xX])\]\s+(.*)$/)
      const unorderedMatch = line.match(/^\s*[-*+•◦▪▸►]\s+(.*)$/)
      const orderedMatch = line.match(/^(\s*)(\d+)[.、)]\s*(.*)$/)
      const listMatch = unorderedMatch || orderedMatch
      if (taskMatch || listMatch) {
        const nextType = taskMatch || unorderedMatch ? 'unordered' : 'ordered'
        const indentation = line.match(/^\s*/)?.[0].replace(/\t/g, '  ').length || 0
        const depth = Math.floor(indentation / 2)
        const lastRoot = [...listItems].reverse().find(item => item.depth === 0)
        if (depth === 0 && lastRoot && lastRoot.type !== nextType) flushList()
        if (taskMatch) listItems.push({ content: taskMatch[2], checked: taskMatch[1].toLowerCase() === 'x', depth, type: nextType })
        else if (unorderedMatch) listItems.push({ content: unorderedMatch[1], depth, type: nextType })
        else listItems.push({ content: orderedMatch?.[3] || '', depth, type: nextType, start: Number(orderedMatch?.[2]) || 1 })
        continue
      }

      // Preserve wrapped paragraphs inside the current list item.
      const continuation = line.match(/^\s{2,}(\S.*)$/)
      if (continuation && listItems.length) {
        listItems[listItems.length - 1].content += `\n${continuation[1]}`
        continue
      }

      // 普通段落
      flushList()
      elements.push(
        <p key={`p-${elements.length}`} className="text-[var(--text-secondary)] leading-relaxed my-2">
          {parseInline(line)}
        </p>
      )
    }

    flushList()
    flushBlockquote()
    flushCodeBlock()

    return elements
  }

  const renderedContent = (
    <>
      {showWordDownload && (
        <div className="markdown-export-toolbar">
          <button type="button" className="markdown-word-download" onClick={() => void downloadMarkdownAsWord(content, 'feynman-ai-reply.docx')} aria-label="下载 Word / Download Word" title="下载 Word / Download Word">
            <Download size={14} aria-hidden="true" />
            <span>下载 Word / Word</span>
          </button>
        </div>
      )}
      {parseMarkdown(content)}
    </>
  )

  if (!selectionSource && !onQuoteSelected) {
    return <div className={`markdown-content ${className}`}>{renderedContent}</div>
  }

  return (
    <SelectableContent
      className={`markdown-content ${className}`}
      lang={lang}
      source={selectionSource}
      onSaveSelection={onQuoteSelected}
      saveLabel={lang === 'zh' ? '加入金句' : 'Save quote'}
      savedLabel={lang === 'zh' ? '已加入' : 'Saved'}
      maxLength={2_000}
    >
      {renderedContent}
    </SelectableContent>
  )
}
