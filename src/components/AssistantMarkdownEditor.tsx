'use client'

import { $isCodeNode, CodeNode } from '@lexical/code-core'
import { LinkNode } from '@lexical/link'
import { ListItemNode, ListNode } from '@lexical/list'
import { $convertFromMarkdownString, $convertToMarkdownString, $generateNodesFromMarkdownString, TRANSFORMERS, type MultilineElementTransformer } from '@lexical/markdown'
import { LexicalComposer } from '@lexical/react/LexicalComposer'
import { ContentEditable } from '@lexical/react/LexicalContentEditable'
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary'
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin'
import { LinkPlugin } from '@lexical/react/LexicalLinkPlugin'
import { ListPlugin } from '@lexical/react/LexicalListPlugin'
import { MarkdownShortcutPlugin } from '@lexical/react/LexicalMarkdownShortcutPlugin'
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin'
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { HeadingNode, QuoteNode } from '@lexical/rich-text'
import {
  $createTableCellNode,
  $createTableNode,
  $createTableRowNode,
  $isTableCellNode,
  $isTableNode,
  $isTableRowNode,
  TableCellHeaderStates,
  TableCellNode,
  TableNode,
  TableRowNode,
} from '@lexical/table'
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  $isTextNode,
  COMMAND_PRIORITY_HIGH,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_UP_COMMAND,
  KEY_ENTER_COMMAND,
  INSERT_PARAGRAPH_COMMAND,
  type LexicalEditor,
} from 'lexical'
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react'
import { mergeRegister } from '@lexical/utils'
import { getSafeLinkHref } from '@/lib/safeUrl'

export interface AssistantMarkdownEditorHandle {
  focus: () => void
  insertBookMention: (bookName: string) => void
  openBookMentions: () => void
}

interface MentionQuery {
  start: number
  query: string
}

interface Props {
  value: string
  onChange: (markdown: string) => void
  onMentionChange: (query: MentionQuery | null) => void
  onSubmit: (markdown: string) => void
  onMoveMention: (direction: 1 | -1) => void
  onSelectMention: () => void
  mentionOpen: boolean
  mentionCount: number
  disabled?: boolean
  placeholder: string
  ariaLabel: string
  ariaControls?: string
}

const EXTERNAL_VALUE_TAG = 'assistant-markdown-external-value'
const TABLE_TRANSFORM_TAG = 'assistant-markdown-table-transform'

function parseTableRow(line: string): string[] | null {
  const trimmed = line.trim()
  if (!trimmed.includes('|')) return null
  const content = trimmed.startsWith('|') ? trimmed.slice(1) : trimmed
  const withoutTrailingPipe = content.endsWith('|') ? content.slice(0, -1) : content
  const cells: string[] = []
  let current = ''
  let escaped = false
  for (const character of withoutTrailingPipe) {
    if (escaped) {
      current += character === '|' ? '|' : `\\${character}`
      escaped = false
      continue
    }
    if (character === '\\') {
      escaped = true
      continue
    }
    if (character === '|') {
      cells.push(current.trim().replace(/\\\|/g, '|'))
      current = ''
      continue
    }
    current += character
  }
  if (escaped) current += '\\'
  cells.push(current.trim().replace(/\\\|/g, '|'))
  return cells.length >= 2 ? cells : null
}

function isTableDelimiterRow(cells: string[]): boolean {
  return cells.length >= 2 && cells.every(cell => /^:?-{3,}:?$/.test(cell.trim()))
}

function isClosedTableRow(line: string): boolean {
  const trimmed = line.trim()
  return trimmed.startsWith('|') && trimmed.endsWith('|')
}

function escapeTableCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\n+/g, '<br>')
}

function appendInlineMarkdown(parent: TableCellNode, markdown: string) {
  const paragraph = $createParagraphNode()
  const generated = $generateNodesFromMarkdownString(markdown, TRANSFORMERS, true)
  const first = generated[0]
  if ($isElementNode(first)) {
    const children = first.getChildren()
    paragraph.append(...children)
  } else if (first) {
    paragraph.append(first)
  } else {
    paragraph.append($createTextNode(''))
  }
  parent.append(paragraph)
}

function createTableFromRows(rows: string[][]): TableNode {
  const table = $createTableNode()
  rows.forEach((cells, rowIndex) => {
    const row = $createTableRowNode()
    cells.forEach(cellText => {
      const cell = $createTableCellNode(rowIndex === 0 ? TableCellHeaderStates.ROW : TableCellHeaderStates.NO_STATUS)
      appendInlineMarkdown(cell, cellText)
      row.append(cell)
    })
    table.append(row)
  })
  return table
}

function convertMarkdownTables(root: ReturnType<typeof $getRoot>): boolean {
  const children = root.getChildren()
  const lines = children.flatMap(node => node.getType() === 'paragraph'
    ? node.getTextContent().split(/\r?\n/).map(line => ({ node, line }))
    : [])
  for (let index = 0; index < lines.length - 1; index += 1) {
    const header = lines[index]
    const delimiter = lines[index + 1]
    const headerCells = parseTableRow(header.line)
    const delimiterCells = parseTableRow(delimiter.line)
    if (!headerCells || !delimiterCells || !isTableDelimiterRow(delimiterCells)) continue
    if (headerCells.length !== delimiterCells.length) continue
    const rows = [headerCells]
    let end = index + 2
    while (end < lines.length) {
      const row = parseTableRow(lines[end].line)
      if (!row || row.length !== headerCells.length) break
      rows.push(row)
      end += 1
    }
    if (rows.length < 2) continue
    const firstNode = header.node
    const lastNode = lines[end - 1].node
    const firstNodeLines = firstNode.getTextContent().split(/\r?\n/)
    const lastNodeLines = lastNode.getTextContent().split(/\r?\n/)
    const startsAtNodeBoundary = header.line === firstNodeLines[0]
    const endsAtNodeBoundary = lines[end - 1].line === lastNodeLines[lastNodeLines.length - 1]
    if (!startsAtNodeBoundary || !endsAtNodeBoundary) continue
    const table = createTableFromRows(rows)
    firstNode.replace(table)
    for (let removeIndex = index + 1; removeIndex < end; removeIndex += 1) {
      const node = lines[removeIndex].node
      if (node.isAttached()) node.remove()
    }
    table.getLastDescendant()?.selectEnd()
    return true
  }
  return false
}

function hasMarkdownTable(root: ReturnType<typeof $getRoot>): boolean {
  const children = root.getChildren()
  const lines = children.flatMap(node => node.getType() === 'paragraph'
    ? node.getTextContent().split(/\r?\n/)
    : [])
  return lines.some((line, index) => {
    const next = lines[index + 1]
    const data = lines[index + 2]
    if (!next || !data || !isClosedTableRow(line) || !isClosedTableRow(next) || !isClosedTableRow(data)) return false
    const header = parseTableRow(line)
    const delimiter = parseTableRow(next)
    const dataCells = data ? parseTableRow(data) : null
    return Boolean(header && delimiter && dataCells && header.length === delimiter.length && dataCells.length === header.length && isTableDelimiterRow(delimiter))
  })
}

const TABLE: MultilineElementTransformer = {
  dependencies: [TableNode, TableRowNode, TableCellNode],
  export: (node, _traverseChildren) => {
    if (!$isTableNode(node)) return null
    return node.getChildren().filter($isTableRowNode).map(row => {
      const cells = row.getChildren().filter($isTableCellNode).map(cell => escapeTableCell(_traverseChildren(cell).trim()))
      return `| ${cells.join(' | ')} |`
    }).join('\n')
  },
  regExpStart: /^\s*\|.+\|\s*$/,
  replace: () => false,
  type: 'multiline-element',
}

const EDITOR_TRANSFORMERS = [TABLE, ...TRANSFORMERS]

const editorTheme = {
  paragraph: 'm-0 min-h-6 leading-6',
  heading: {
    h1: 'my-1 text-lg font-bold leading-7',
    h2: 'my-1 text-base font-semibold leading-6',
    h3: 'my-1 text-sm font-semibold leading-6',
    h4: 'my-1 text-sm font-semibold leading-6',
    h5: 'my-1 text-sm font-medium leading-6',
    h6: 'my-1 text-sm font-medium leading-6',
  },
  quote: 'my-1 border-l-2 border-[var(--accent)] bg-[var(--accent)]/5 py-1 pl-3 text-[var(--text-secondary)]',
  table: 'markdown-table',
  tableCell: 'markdown-table-cell',
  tableCellHeader: 'markdown-table-cell-header',
  tableRow: 'markdown-table-row',
  list: {
    listitem: 'my-0.5 leading-6',
    nested: { listitem: 'list-none' },
    ol: 'my-1 list-decimal pl-6 marker:text-[var(--accent)]',
    ul: 'my-1 list-disc pl-6 marker:text-[var(--accent)]',
  },
  link: 'text-[var(--accent)] underline decoration-[var(--accent)]/50 underline-offset-2',
  code: 'my-1 overflow-x-auto rounded-md border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 font-mono text-xs leading-5',
  text: {
    bold: 'font-semibold text-[var(--text-primary)]',
    code: 'rounded bg-[var(--accent)]/10 px-1 py-0.5 font-mono text-[0.9em] text-[var(--accent)]',
    italic: 'italic',
    strikethrough: 'line-through text-[var(--text-secondary)]',
  },
}

function getMentionQuery(editor: LexicalEditor): MentionQuery | null {
  return editor.getEditorState().read(() => {
    const selection = $getSelection()
    if (!$isRangeSelection(selection) || !selection.isCollapsed()) return null
    const anchorNode = selection.anchor.getNode()
    if (!$isTextNode(anchorNode)) return null
    const beforeCursor = anchorNode.getTextContent().slice(0, selection.anchor.offset)
    const match = beforeCursor.match(/(?:^|\s)(@[^\s@]*)$/)
    if (!match) return null
    return {
      start: selection.anchor.offset - match[1].length,
      query: match[1].slice(1),
    }
  })
}

function withRangeSelection(editor: LexicalEditor, callback: () => void) {
  editor.update(() => {
    if (!$isRangeSelection($getSelection())) $getRoot().selectEnd()
    const selection = $getSelection()
    if ($isRangeSelection(selection) && !selection.isCollapsed()) {
      selection.anchor.set(selection.focus.key, selection.focus.offset, selection.focus.type)
    }
    callback()
  })
  editor.focus()
}

function KeyboardPlugin({
  mentionOpen,
  mentionCount,
  onMoveMention,
  onSelectMention,
  onSubmit,
}: Pick<Props, 'mentionOpen' | 'mentionCount' | 'onMoveMention' | 'onSelectMention' | 'onSubmit'>) {
  const [editor] = useLexicalComposerContext()

  useEffect(() => mergeRegister(
    editor.registerCommand(KEY_ARROW_DOWN_COMMAND, event => {
      if (!mentionOpen || mentionCount === 0) return false
      event?.preventDefault()
      onMoveMention(1)
      return true
    }, COMMAND_PRIORITY_HIGH),
    editor.registerCommand(KEY_ARROW_UP_COMMAND, event => {
      if (!mentionOpen || mentionCount === 0) return false
      event?.preventDefault()
      onMoveMention(-1)
      return true
    }, COMMAND_PRIORITY_HIGH),
    editor.registerCommand(KEY_ENTER_COMMAND, event => {
      if (!event || editor.isComposing()) return false
      if (mentionOpen && mentionCount > 0) {
        event.preventDefault()
        onSelectMention()
        return true
      }
      if (event.shiftKey) {
        const insideCode = editor.getEditorState().read(() => {
          const selection = $getSelection()
          return $isRangeSelection(selection) && $isCodeNode(selection.anchor.getNode().getParent())
        })
        if (insideCode) return false
        event.preventDefault()
        editor.dispatchCommand(INSERT_PARAGRAPH_COMMAND, undefined)
        return true
      }
      event.preventDefault()
      const markdown = editor.getEditorState().read(() => $convertToMarkdownString(EDITOR_TRANSFORMERS, undefined, true))
      onSubmit(markdown)
      return true
    }, COMMAND_PRIORITY_HIGH),
  ), [editor, mentionCount, mentionOpen, onMoveMention, onSelectMention, onSubmit])

  return null
}

function TableMarkdownPlugin() {
  const [editor] = useLexicalComposerContext()

  useEffect(() => editor.registerUpdateListener(({ editorState, tags }) => {
    if (tags.has(TABLE_TRANSFORM_TAG)) return
    const shouldConvert = editorState.read(() => hasMarkdownTable($getRoot()))
    if (!shouldConvert) return
    editor.update(() => {
      convertMarkdownTables($getRoot())
    }, { tag: TABLE_TRANSFORM_TAG })
  }), [editor])

  return null
}

function EditorBridge({
  editorRef,
  value,
  onChange,
  onMentionChange,
  disabled,
}: Pick<Props, 'value' | 'onChange' | 'onMentionChange' | 'disabled'> & {
  editorRef: React.ForwardedRef<AssistantMarkdownEditorHandle>
}) {
  const [editor] = useLexicalComposerContext()
  const currentMarkdownRef = useRef(value)

  useImperativeHandle(editorRef, () => ({
    focus: () => editor.focus(),
    insertBookMention: bookName => withRangeSelection(editor, () => {
      const selection = $getSelection()
      if (!$isRangeSelection(selection)) return
      selection.setFormat(0)
      const anchorNode = selection.anchor.getNode()
      if ($isTextNode(anchorNode)) {
        const offset = selection.anchor.offset
        const beforeCursor = anchorNode.getTextContent().slice(0, offset)
        const match = beforeCursor.match(/(?:^|\s)(@[^\s@]*)$/)
        if (match) {
          const start = offset - match[1].length
          selection.anchor.set(anchorNode.getKey(), start, 'text')
          selection.focus.set(anchorNode.getKey(), offset, 'text')
        }
      }
      selection.insertText(`@${bookName} `)
    }),
    openBookMentions: () => withRangeSelection(editor, () => {
      const selection = $getSelection()
      if (!$isRangeSelection(selection)) return
      selection.setFormat(0)
      const anchorNode = selection.anchor.getNode()
      const previousCharacter = $isTextNode(anchorNode)
        ? anchorNode.getTextContent()[selection.anchor.offset - 1]
        : undefined
      selection.insertText(previousCharacter && !/\s/.test(previousCharacter) ? ' @' : '@')
    }),
  }), [editor])

  useEffect(() => {
    editor.setEditable(!disabled)
  }, [disabled, editor])

  useEffect(() => {
    if (value === currentMarkdownRef.current) return
    currentMarkdownRef.current = value
    editor.update(() => {
      const root = $getRoot()
      root.clear()
      $convertFromMarkdownString(value, EDITOR_TRANSFORMERS, root, true)
      convertMarkdownTables(root)
      root.selectEnd()
    }, { tag: EXTERNAL_VALUE_TAG })
  }, [editor, value])

  return (
    <OnChangePlugin
      ignoreSelectionChange={false}
      onChange={(editorState, currentEditor, tags) => {
        const query = getMentionQuery(currentEditor)
        onMentionChange(query)
        if (tags.has(EXTERNAL_VALUE_TAG)) return
        const markdown = editorState.read(() => $convertToMarkdownString(EDITOR_TRANSFORMERS, undefined, true))
        currentMarkdownRef.current = markdown
        onChange(markdown)
      }}
    />
  )
}

const AssistantMarkdownEditor = forwardRef<AssistantMarkdownEditorHandle, Props>(function AssistantMarkdownEditor({
  value,
  onChange,
  onMentionChange,
  onSubmit,
  onMoveMention,
  onSelectMention,
  mentionOpen,
  mentionCount,
  disabled = false,
  placeholder,
  ariaLabel,
  ariaControls,
}, ref) {
  const initialConfig = useMemo(() => ({
    namespace: 'FeynmanAssistantComposer',
    nodes: [HeadingNode, QuoteNode, ListNode, ListItemNode, CodeNode, LinkNode, TableNode, TableRowNode, TableCellNode],
    theme: editorTheme,
    editable: !disabled,
    editorState: () => {
      if (value) {
        $convertFromMarkdownString(value, EDITOR_TRANSFORMERS, undefined, true)
        convertMarkdownTables($getRoot())
      }
    },
    onError: (error: Error) => { throw error },
  // Lexical reads this configuration once; later value and editable changes
  // are synchronized by EditorBridge.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [])

  return (
    <LexicalComposer initialConfig={initialConfig}>
      <RichTextPlugin
        contentEditable={(
          <ContentEditable
            className="block min-h-20 max-h-36 w-full overflow-y-auto bg-transparent px-3.5 pb-2 pt-3 text-base leading-6 text-[var(--text-primary)] outline-none md:text-sm"
            aria-label={ariaLabel}
            aria-placeholder={placeholder}
            aria-haspopup="listbox"
            aria-controls={ariaControls}
            placeholder={<span className="pointer-events-none absolute left-3.5 top-3 text-base text-[var(--text-secondary)] md:text-sm">{placeholder}</span>}
            spellCheck
          />
        )}
        ErrorBoundary={LexicalErrorBoundary}
      />
      <HistoryPlugin />
      <ListPlugin />
      <LinkPlugin validateUrl={url => Boolean(getSafeLinkHref(url))} attributes={{ rel: 'noopener noreferrer', target: '_blank' }} />
      <MarkdownShortcutPlugin transformers={TRANSFORMERS} />
      <TableMarkdownPlugin />
      <KeyboardPlugin
        mentionOpen={mentionOpen}
        mentionCount={mentionCount}
        onMoveMention={onMoveMention}
        onSelectMention={onSelectMention}
        onSubmit={onSubmit}
      />
      <EditorBridge
        editorRef={ref}
        value={value}
        onChange={onChange}
        onMentionChange={onMentionChange}
        disabled={disabled}
      />
    </LexicalComposer>
  )
})

export default AssistantMarkdownEditor
