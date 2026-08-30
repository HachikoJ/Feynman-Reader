'use client'

import { BookmarkPlus, Check, Copy, Download } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { getSafeLinkHref } from '@/lib/safeUrl'
import { downloadMarkdownAsWord, downloadTableAsExcel } from '@/lib/markdownExport'
import { findMathExpressions } from '@/lib/mathRendering'
import AppIcon from './AppIcon'
import HtmlFragment from './HtmlFragment'
import MathFormula from './MathFormula'
import MermaidDiagram from './MermaidDiagram'

interface Props {
  content: string
  className?: string
  showWordDownload?: boolean
  onQuoteSelected?: (text: string) => Promise<void> | void
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
  return cells.length > 0 && cells.every(cell => /^:?-{3,}:?$/.test(cell))
}

function tableAlignment(cell: string): 'left' | 'center' | 'right' | undefined {
  const value = cell.trim()
  if (value.startsWith(':') && value.endsWith(':')) return 'center'
  if (value.endsWith(':')) return 'right'
  if (value.startsWith(':')) return 'left'
  return undefined
}

export default function MarkdownRenderer({ content, className = '', showWordDownload = false, onQuoteSelected }: Props) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [selection, setSelection] = useState<{ text: string; top: number; left: number } | null>(null)
  const [quoteSaveState, setQuoteSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  const captureSelection = () => {
    if (!onQuoteSelected || typeof window === 'undefined') return
    const current = window.getSelection()
    if (!current || current.isCollapsed || !current.rangeCount || !rootRef.current) {
      setSelection(null)
      return
    }
    const anchor = current.anchorNode
    const focus = current.focusNode
    if (!anchor || !focus || !rootRef.current.contains(anchor) || !rootRef.current.contains(focus)) {
      setSelection(null)
      return
    }
    const text = current.toString().replace(/\s+/g, ' ').trim()
    if (text.length < 2) {
      setSelection(null)
      return
    }
    const rect = current.getRangeAt(0).getBoundingClientRect()
    if (!rect.width && !rect.height) {
      setSelection(null)
      return
    }
    const left = Math.min(Math.max(8, rect.left), Math.max(8, window.innerWidth - 150))
    const top = Math.min(Math.max(8, rect.bottom + 8), Math.max(8, window.innerHeight - 48))
    setQuoteSaveState('idle')
    setSelection({ text: text.slice(0, 500), top, left })
  }

  useEffect(() => {
    if (!onQuoteSelected) return
    const clearSelection = (event: MouseEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return
      setSelection(null)
    }
    document.addEventListener('mousedown', clearSelection)
    return () => document.removeEventListener('mousedown', clearSelection)
  }, [onQuoteSelected])

  const saveSelectedQuote = async () => {
    if (!selection || !onQuoteSelected || quoteSaveState === 'saving') return
    setQuoteSaveState('saving')
    try {
      await onQuoteSelected(selection.text)
      setQuoteSaveState('saved')
      window.setTimeout(() => setSelection(null), 900)
    } catch {
      setQuoteSaveState('error')
    }
  }

  const parseMarkdown = (text: string): JSX.Element[] => {
    const lines = text.split('\n')
    const elements: JSX.Element[] = []
    type ListItem = { content: string; checked?: boolean; depth: number; type: 'ordered' | 'unordered' }
    type ListNode = { item: ListItem; children: ListNode[] }
    let listItems: ListItem[] = []
    let blockquoteLines: string[] = []
    let codeBlock: { lang: string; lines: string[]; fence: '`' | '~' } | null = null

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

        const renderNodes = (nodes: ListNode[], key: string): JSX.Element => {
          const type = nodes[0]?.item.type === 'ordered' ? 'ol' : 'ul'
          const ListTag = type === 'ol' ? 'ol' : 'ul'
          return <ListTag key={key} className={type === 'ol' ? 'my-2 list-decimal space-y-2 pl-6 marker:font-semibold marker:text-[var(--accent)]' : 'my-2 list-disc space-y-2 pl-6 marker:text-[var(--accent)]'}>
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
        elements.push(<div key={`list-${elements.length}`} className="my-3">{renderNodes(roots, `list-${elements.length}`)}</div>)
        listItems = []
      }
    }

    const flushBlockquote = () => {
      if (blockquoteLines.length > 0) {
        elements.push(
          <blockquote 
            key={`quote-${elements.length}`}
            className="my-4 pl-4 border-l-4 border-[var(--accent)] bg-[var(--accent)]/5 py-3 pr-4 rounded-r-lg"
          >
            {blockquoteLines.map((line, i) => (
              <p key={i} className="text-[var(--text-primary)] italic leading-relaxed">{parseInline(line)}</p>
            ))}
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
      const tokenPattern = /==([^=\n]+)==|\*\*([^*\n]+)\*\*|__([^_\n]+)__|~~([^~\n]+)~~|`([^`\n]+)`|\[([^\]]+)\]\(([^)\n]+)\)|\*([^*\n]+)\*|_([^_\n]+)_/
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
        } else if (match[6] && match[7]) {
          const safeHref = getSafeLinkHref(match[7])
          result.push(safeHref ? (
            <a key={`a-${keyIndex++}`} href={safeHref} target="_blank" rel="noopener noreferrer" className="text-[var(--accent)] hover:underline">
              {match[6]}
            </a>
          ) : <span key={`a-${keyIndex++}`}>{match[6]}</span>)
        } else if (match[8] || match[9]) {
          result.push(<em key={`e-${keyIndex++}`} className="italic text-[var(--accent)]">{match[8] || match[9]}</em>)
        }
        offset = start + match[0].length
      }

      return result
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      // 代码块
      const fenceMatch = line.match(/^\s*(`{3,}|~{3,})(.*)$/)
      if (fenceMatch) {
        if (codeBlock) {
          if (fenceMatch[1][0] === codeBlock.fence) flushCodeBlock()
        } else {
          flushList()
          flushBlockquote()
          codeBlock = { lang: fenceMatch[2].trim(), lines: [], fence: fenceMatch[1][0] as '`' | '~' }
        }
        continue
      }

      if (codeBlock) {
        codeBlock.lines.push(line)
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
      if (i + 1 < lines.length && line.includes('|') && isTableDivider(lines[i + 1])) {
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
        flushList()
        flushBlockquote()
        continue
      }

      // 引用
      if (line.startsWith('> ')) {
        flushList()
        blockquoteLines.push(line.slice(2))
        continue
      } else {
        flushBlockquote()
      }

      // 标题
      if (line.startsWith('# ')) {
        flushList()
        elements.push(
          <h2 key={`h2-${elements.length}`} className="mt-5 mb-3 text-xl font-bold leading-tight text-[var(--text-primary)]">
            {parseInline(line.slice(2))}
          </h2>
        )
        continue
      }
      if (line.startsWith('## ')) {
        flushList()
        elements.push(
          <h3 key={`h2-${elements.length}`} className="mt-5 mb-2.5 border-l-2 border-[var(--accent)] pl-3 text-base font-semibold text-[var(--text-primary)]">
            {parseInline(line.slice(3))}
          </h3>
        )
        continue
      }
      if (line.startsWith('### ')) {
        flushList()
        elements.push(
          <h3 key={`h3-${elements.length}`} className="text-lg font-semibold mt-5 mb-2 text-[var(--text-primary)] flex items-center gap-2">
            <AppIcon name="sparkles" tone="accent" size={16} />
            {parseInline(line.slice(4))}
          </h3>
        )
        continue
      }
      if (line.startsWith('#### ')) {
        flushList()
        elements.push(
          <h4 key={`h4-${elements.length}`} className="font-semibold mt-4 mb-1.5 text-[var(--text-primary)] flex items-center gap-2">
            <AppIcon name="chevronRight" tone="accent" size={16} />
            {parseInline(line.slice(5))}
          </h4>
        )
        continue
      }

      // 无序列表（支持多种符号）
      const taskMatch = line.match(/^\s*[-*]\s+\[([ xX])\]\s+(.*)$/)
      const unorderedMatch = line.match(/^\s*[-*+•◦▪▸►]\s+(.*)$/)
      const orderedMatch = line.match(/^\s*\d+[.、)]\s*(.*)$/)
      const listMatch = unorderedMatch || orderedMatch
      if (taskMatch || listMatch) {
        const nextType = taskMatch || unorderedMatch ? 'unordered' : 'ordered'
        const indentation = line.match(/^\s*/)?.[0].replace(/\t/g, '  ').length || 0
        const depth = Math.floor(indentation / 2)
        const lastRoot = [...listItems].reverse().find(item => item.depth === 0)
        if (depth === 0 && lastRoot && lastRoot.type !== nextType) flushList()
        if (taskMatch) listItems.push({ content: taskMatch[2], checked: taskMatch[1].toLowerCase() === 'x', depth, type: nextType })
        else listItems.push({ content: listMatch?.[1] || '', depth, type: nextType })
        continue
      }

      // Preserve wrapped paragraphs inside the current list item.
      const continuation = line.match(/^\s{2,}(\S.*)$/)
      if (continuation && listItems.length) {
        listItems[listItems.length - 1].content += `\n${continuation[1]}`
        continue
      }

      // 分隔线
      if (line.match(/^[-*_]{3,}$/)) {
        flushList()
        elements.push(<hr key={`hr-${elements.length}`} className="my-4 border-[var(--border)]" />)
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

  return (
    <div ref={rootRef} className={`markdown-content ${className}`} onMouseUp={() => window.setTimeout(captureSelection, 0)} onTouchEnd={() => window.setTimeout(captureSelection, 0)} onKeyUp={() => window.setTimeout(captureSelection, 0)}>
      {showWordDownload && (
        <div className="markdown-export-toolbar">
          <button type="button" className="markdown-word-download" onClick={() => void downloadMarkdownAsWord(content, 'feynman-ai-reply.docx')} aria-label="下载 Word / Download Word" title="下载 Word / Download Word">
            <Download size={14} aria-hidden="true" />
            <span>下载 Word / Word</span>
          </button>
        </div>
      )}
      {parseMarkdown(content)}
      {selection && onQuoteSelected && (
        <button
          type="button"
          onMouseDown={event => event.preventDefault()}
          onClick={() => void saveSelectedQuote()}
          className="fixed z-[80] inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-[var(--accent)]/30 bg-[var(--bg-card)] px-3 text-xs font-medium text-[var(--accent)] shadow-lg shadow-black/10 transition-colors hover:bg-[var(--accent)]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/50"
          style={{ top: selection.top, left: selection.left }}
          disabled={quoteSaveState === 'saving'}
          aria-label={quoteSaveState === 'saved' ? '已加入金句' : quoteSaveState === 'error' ? '加入金句失败' : '将选中文本加入金句'}
        >
          <BookmarkPlus size={14} aria-hidden="true" />
          {quoteSaveState === 'saving' ? '保存中…' : quoteSaveState === 'saved' ? '已加入' : quoteSaveState === 'error' ? '重试加入' : '加入金句'}
        </button>
      )}
    </div>
  )
}
