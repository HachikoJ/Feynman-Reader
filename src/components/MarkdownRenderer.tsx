'use client'

interface Props {
  content: string
  className?: string
}

export default function MarkdownRenderer({ content, className = '' }: Props) {
  const parseMarkdown = (text: string): JSX.Element[] => {
    const lines = text.split('\n')
    const elements: JSX.Element[] = []
    let listItems: string[] = []
    let blockquoteLines: string[] = []
    let codeBlock: { lang: string; lines: string[] } | null = null

    const flushList = () => {
      if (listItems.length > 0) {
        elements.push(
          <ul key={`list-${elements.length}`} className="my-3 space-y-2">
            {listItems.map((item, i) => (
              <li key={i} className="flex items-start gap-3 text-[var(--text-secondary)] leading-relaxed">
                <span className="flex-shrink-0 w-2 h-2 rounded-full bg-[var(--accent)] mt-2"></span>
                <span className="flex-1">{parseInline(item)}</span>
              </li>
            ))}
          </ul>
        )
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
        elements.push(
          <pre 
            key={`code-${elements.length}`}
            className="my-3 p-4 bg-[var(--bg-primary)] rounded-xl overflow-x-auto border border-[var(--border)]"
          >
            <code className="text-sm text-[var(--accent)] font-mono">
              {codeBlock.lines.join('\n')}
            </code>
          </pre>
        )
        codeBlock = null
      }
    }

    // 解析行内元素
    const parseInline = (text: string): (string | JSX.Element)[] => {
      const result: (string | JSX.Element)[] = []
      let remaining = text
      let keyIndex = 0

      while (remaining.length > 0) {
        // 粗体 **text**
        let match = remaining.match(/^(.*?)\*\*(.+?)\*\*(.*)$/)
        if (match) {
          if (match[1]) result.push(match[1])
          result.push(<strong key={`b-${keyIndex++}`} className="font-semibold text-[var(--text-primary)]">{match[2]}</strong>)
          remaining = match[3]
          continue
        }

        // 行内代码 `code`
        match = remaining.match(/^(.*?)`([^`]+)`(.*)$/)
        if (match) {
          if (match[1]) result.push(match[1])
          result.push(
            <code key={`c-${keyIndex++}`} className="px-1.5 py-0.5 bg-[var(--accent)]/10 text-[var(--accent)] rounded text-sm font-mono">
              {match[2]}
            </code>
          )
          remaining = match[3]
          continue
        }

        // 链接 [text](url)
        match = remaining.match(/^(.*?)\[([^\]]+)\]\(([^)]+)\)(.*)$/)
        if (match) {
          if (match[1]) result.push(match[1])
          result.push(
            <a key={`a-${keyIndex++}`} href={match[3]} target="_blank" rel="noopener noreferrer" 
               className="text-[var(--accent)] hover:underline">
              {match[2]}
            </a>
          )
          remaining = match[4]
          continue
        }

        result.push(remaining)
        break
      }

      return result
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      // 代码块
      if (line.startsWith('```')) {
        if (codeBlock) {
          flushCodeBlock()
        } else {
          flushList()
          flushBlockquote()
          codeBlock = { lang: line.slice(3).trim(), lines: [] }
        }
        continue
      }

      if (codeBlock) {
        codeBlock.lines.push(line)
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
      if (line.startsWith('### ')) {
        flushList()
        elements.push(
          <h3 key={`h3-${elements.length}`} className="text-lg font-semibold mt-5 mb-2 text-[var(--text-primary)] flex items-center gap-2">
            <span className="text-[var(--accent)]">◆</span>
            {parseInline(line.slice(4))}
          </h3>
        )
        continue
      }
      if (line.startsWith('#### ')) {
        flushList()
        elements.push(
          <h4 key={`h4-${elements.length}`} className="font-semibold mt-4 mb-1.5 text-[var(--text-primary)] flex items-center gap-2">
            <span className="text-[var(--accent)]">▸</span>
            {parseInline(line.slice(5))}
          </h4>
        )
        continue
      }

      // 无序列表（支持多种符号）
      const listMatch = line.match(/^[-*•◦▪▸►]\s+(.*)$/) || line.match(/^\d+[.、)]\s*(.*)$/)
      if (listMatch) {
        listItems.push(listMatch[1])
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

  return <div className={`markdown-content ${className}`}>{parseMarkdown(content)}</div>
}
