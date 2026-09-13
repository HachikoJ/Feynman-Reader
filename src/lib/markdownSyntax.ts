export interface MarkdownHeading {
  level: number
  title: string
  /** ATX 标题占 1 行，Setext 标题占 2 行。 */
  lineCount: 1 | 2
}

export interface MarkdownHeadingLocation extends MarkdownHeading {
  start: number
  end: number
}

/** 序、前言、附录等前后置内容不参与层级推断，它们是同级标题而不是父标题。 */
const FRONT_MATTER_PATTERN = /^(?:序|序言|序章|前言|引言|楔子|后记|跋|尾声|结束语|附录|致谢|参考文献|版权|扉页|目录|正文)$/

/**
 * 单个标题文本自带的层级线索：卷 / 章 / 节、Part / Chapter / Section、1.2.3 编号。
 * 编号比「卷 / 章 / 节」低一级（1. 是章下的小节，1.1 再降一级），
 * 这样「第一章」与「1.1 小节」并存时能还原出父子关系。
 */
function explicitHeadingLevel(title: string): number | null {
  const numbered = title.match(/^(\d+(?:\.\d+){0,5})(?:[.)、\s]|$)/)
  if (numbered) return Math.min(6, numbered[1].split('.').length + 2)
  if (/^(?:第\s*[0-9一二三四五六七八九十百千万]+\s*(?:卷|部|篇)|part\b)/i.test(title)) return 1
  if (/^(?:第\s*[0-9一二三四五六七八九十百千万]+\s*章|chapter\b)/i.test(title)) return 2
  if (/^(?:第\s*[0-9一二三四五六七八九十百千万]+\s*节|section\b)/i.test(title)) return 3
  return null
}

/**
 * 旧数据只保存了标题文本，这里按标题自带的编号线索推断层级。
 * 只有出现两种以上的结构线索（例如既有「第一部」又有「第一章」）才认为存在层级，
 * 否则一律视为同级根标题，避免把「序」和「第一章」这类平级标题错误嵌套。
 */
export function inferHeadingLevels(titles: string[]): number[] {
  const explicit = titles.map(title => {
    const normalized = title.trim()
    return FRONT_MATTER_PATTERN.test(normalized) ? null : explicitHeadingLevel(normalized)
  })
  const distinct = new Set(explicit.filter((level): level is number => level !== null))
  if (distinct.size < 2) return titles.map(() => 1)

  const fallback = Math.min(...distinct)
  const levels = explicit.map(level => level ?? fallback)
  // 无编号的标题跟随其后最近的层级，避免它把后面的子标题收进自己的目录节点。
  for (let index = levels.length - 1; index >= 0; index -= 1) {
    if (explicit[index] !== null) continue
    levels[index] = levels[index + 1] ?? fallback
  }
  return levels
}

function stripClosingHashes(value: string): string {
  return value.replace(/[ \t]+#+[ \t]*$/, '').trim()
}

/**
 * 没有空格的 ATX 写法（`###标题`）在转换来的书里很常见，
 * 但 #include、#!/bin/sh、#fff 这类文本不能当成标题，因此只放行明显是标题的文本。
 */
const SPACELESS_HEADING_BLOCKLIST = /^(?:[!/<{|#=+*~]|include\b|define\b|import\b|pragma\b|ifn?def\b|endif\b|else\b|elif\b|region\b|endregion\b)/i

/**
 * Setext 标题的上一行必须是普通段落：
 * 列表、引用、代码围栏、ATX 标题后面的 `---` 是分隔线，不是标题下划线。
 */
function canStartSetextHeading(line: string): boolean {
  if (!line.trim() || /^ {4}/.test(line)) return false
  if (/^ {0,3}(?:#{1,6}|>|`{3,}|~{3,})/.test(line)) return false
  if (/^ {0,3}(?:[-*+]|\d+[.、)])\s+/.test(line)) return false
  return true
}

/** 解析 CommonMark 风格 ATX / Setext 标题；缩进最多允许三个空格。 */
export function parseMarkdownHeading(line: string, nextLine?: string): MarkdownHeading | null {
  const atx = line.match(/^ {0,3}(#{1,6})(.*)$/)
  if (atx) {
    const rest = atx[2]
    if (rest && !/^[ \t]/.test(rest)) {
      if (SPACELESS_HEADING_BLOCKLIST.test(rest)) return null
      // 无空格写法同样可能带结尾井号，例如 `###标题###`。
      const title = rest.trim().replace(/#+$/, '').trim()
      return title ? { level: atx[1].length, title, lineCount: 1 } : null
    }
    const title = stripClosingHashes(rest || '')
    if (title) return { level: atx[1].length, title, lineCount: 1 }
  }

  if (!nextLine || !canStartSetextHeading(line)) return null
  const underline = nextLine.match(/^ {0,3}(=+|-+)[ \t]*$/)
  if (!underline) return null
  return {
    level: underline[1][0] === '=' ? 1 : 2,
    title: line.trim(),
    lineCount: 2
  }
}

function fenceStart(line: string): { marker: '`' | '~'; length: number } | null {
  const match = line.match(/^ {0,3}(`{3,}|~{3,})/)
  if (!match) return null
  return { marker: match[1][0] as '`' | '~', length: match[1].length }
}

function fenceEnd(line: string, fence: { marker: '`' | '~'; length: number }): boolean {
  const match = line.match(/^ {0,3}(`+|~+)[ \t]*$/)
  return Boolean(match && match[1][0] === fence.marker && match[1].length >= fence.length)
}

const HTML_BLOCK_START = /^<(table|details|div|section|article|aside|figure|pre|ul|ol|blockquote|h[1-6])\b/i

/** 扫描正文中的所有标题及全书字符偏移，忽略 fenced code 内的伪标题。 */
export function scanMarkdownHeadings(text: string): MarkdownHeadingLocation[] {
  const headings: MarkdownHeadingLocation[] = []
  const lines = text.split('\n')
  let offset = 0
  let fence: { marker: '`' | '~'; length: number } | null = null

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const lineEnd = offset + line.length
    let consumedEnd = lineEnd

    if (fence) {
      if (fenceEnd(line, fence)) fence = null
      offset = lineEnd + 1
      continue
    }

    const openingFence = fenceStart(line)
    if (openingFence) {
      fence = openingFence
      offset = lineEnd + 1
      continue
    }

    // 阅读器会把块级 HTML 整体交给 HTML 片段渲染，其中的标题不会成为 Markdown 标题。
    const htmlBlockStart = line.trim().match(HTML_BLOCK_START)
    if (htmlBlockStart) {
      const tag = htmlBlockStart[1]
      let endIndex = index
      if (!new RegExp(`</${tag}\\s*>`, 'i').test(line)) {
        while (endIndex + 1 < lines.length && !new RegExp(`</${tag}\\s*>`, 'i').test(lines[endIndex + 1])) {
          endIndex += 1
        }
        if (endIndex + 1 < lines.length) endIndex += 1
      }
      for (let cursor = index + 1; cursor <= endIndex; cursor += 1) {
        consumedEnd += 1 + lines[cursor].length
      }
      index = endIndex
      offset = consumedEnd + 1
      continue
    }

    const heading = parseMarkdownHeading(line, lines[index + 1])
    if (heading) {
      if (heading.lineCount === 2) {
        consumedEnd += 1 + (lines[index + 1]?.length || 0)
        index += 1
      }
      headings.push({ ...heading, start: offset, end: consumedEnd })
    }
    offset = consumedEnd + 1
  }

  return headings
}
