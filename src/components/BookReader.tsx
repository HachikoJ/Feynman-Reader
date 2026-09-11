'use client'

import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react'
import type { Book, HighlightColor, NoteRecord } from '@/lib/store'
import type { Language } from '@/lib/i18n'
import { MAX_BOOKMARKS_PER_BOOK, MAX_NOTE_TAG_LENGTH, MAX_NOTE_TAGS } from '@/lib/dataLimits'
import { logger } from '@/lib/logger'
import { updateReadingProgress } from '@/lib/readingProgress'
import {
  buildReaderSections,
  extractSectionBody,
  findSectionIndexForOffset,
  getReaderProgressPercentage,
  getSectionBodyStart,
  MAX_HIGHLIGHT_QUOTE_CHARS
} from '@/lib/readerSections'
import {
  buildBookmarkSnippet,
  buildHighlightRanges,
  buildTextSegments,
  DEFAULT_HIGHLIGHT_COLOR,
  findTermRanges,
  isHighlightColor,
  MAX_SEARCH_MATCHES,
  MAX_SEARCH_TERM_LENGTH,
  normalizeNoteTags,
  scanDocumentMatches,
  type SearchMatch
} from '@/lib/readerAnnotations'
import AppIcon from './AppIcon'
import HighlightColorPicker, { HIGHLIGHT_DOT_CLASSES } from './HighlightColorPicker'

export interface ReaderHighlightDraft {
  quote: string
  note: string
  chapterIndex?: number
  chapterTitle?: string
  /** 划线在全书正文中的起始偏移，用于精确回到原文位置。 */
  offset?: number
  color?: HighlightColor
  tags?: string[]
}

export interface ReaderHighlightPatch {
  note?: string
  color?: HighlightColor
  /** 传入时整体替换标签，缺省表示不改标签。 */
  tags?: string[]
}

export interface ReaderBookmarkDraft {
  chapterIndex: number
  /** 书签在全书正文中的字符偏移。 */
  offset: number
  chapterTitle?: string
  snippet: string
  label?: string
  color?: HighlightColor
}

export interface ReaderBookmarkPatch {
  label?: string
  color?: HighlightColor
}

interface Props {
  book: Book
  lang: Language
  /** 保存划线或划线笔记，返回是否保存成功。 */
  onSaveHighlight: (draft: ReaderHighlightDraft) => Promise<boolean>
  /** 修改划线备注与颜色。 */
  onUpdateHighlight: (id: string, patch: ReaderHighlightPatch) => Promise<boolean>
  /** 删除划线。 */
  onDeleteHighlight: (id: string) => Promise<boolean>
  /** 添加书签。 */
  onSaveBookmark: (draft: ReaderBookmarkDraft) => Promise<boolean>
  /** 修改书签备注与颜色。 */
  onUpdateBookmark: (id: string, patch: ReaderBookmarkPatch) => Promise<boolean>
  /** 删除书签。 */
  onDeleteBookmark: (id: string) => Promise<boolean>
  /** 从笔记或书签列表跳回原文时传入的章节下标。 */
  focusChapterIndex?: number | null
  /** 从笔记或书签列表跳回原文时传入的字符偏移，优先于章节定位。 */
  focusOffset?: number | null
  /** 阅读进度写入后的回调，用于同步书架与后续 AI 上下文。 */
  onProgressSaved?: () => void
}

type ReaderTheme = 'light' | 'paper' | 'dark'
type PanelTab = 'toc' | 'highlights' | 'bookmarks' | 'search'
/** 划线面板的章节筛选：全部章节、未标注章节，或 book.chapters 的下标。 */
type ChapterFilter = 'all' | 'none' | number

interface SelectionState {
  text: string
  top: number
  left: number
}

interface Notice {
  tone: 'success' | 'error'
  text: string
}

/** 正文里点开的划线编辑器。 */
interface MarkEditorState {
  id: string
  top: number
  left: number
  note: string
  color: HighlightColor
  tags: string[]
}

/** 侧栏里展开的划线编辑表单。 */
interface HighlightEditState {
  id: string
  note: string
  color: HighlightColor
  tags: string[]
}

/** 侧栏里展开的书签编辑表单。 */
interface BookmarkEditState {
  id: string
  label: string
  color: HighlightColor
}

const FONT_SIZE_KEY = 'feynman-reader-font-size'
const THEME_KEY = 'feynman-reader-theme'
const HIGHLIGHT_COLOR_KEY = 'feynman-reader-highlight-color'
const MIN_FONT_SIZE = 15
const MAX_FONT_SIZE = 28
const TOC_RENDER_LIMIT = 600
const MAX_HIGHLIGHT_NOTE_CHARS = 2000
const MAX_BOOKMARK_LABEL_CHARS = 200
const NOTICE_DURATION = 2600

const THEME_CLASSES: Record<ReaderTheme, string> = {
  light: 'bg-white text-slate-900',
  paper: 'bg-[#f7f1e3] text-[#3a3226]',
  dark: 'bg-[#15181d] text-slate-100'
}

const THEME_MUTED_CLASSES: Record<ReaderTheme, string> = {
  light: 'text-slate-500',
  paper: 'text-[#7a6a52]',
  dark: 'text-slate-400'
}

/** 阅读器自带三套底色，划线配色按底色单独取值，避免夜间主题下过亮。 */
const HIGHLIGHT_MARK_CLASSES: Record<ReaderTheme, Record<HighlightColor, string>> = {
  light: {
    yellow: 'bg-amber-200/80',
    green: 'bg-emerald-200/80',
    blue: 'bg-sky-200/80',
    pink: 'bg-pink-200/80'
  },
  paper: {
    yellow: 'bg-amber-300/70',
    green: 'bg-emerald-300/60',
    blue: 'bg-sky-300/60',
    pink: 'bg-rose-300/60'
  },
  dark: {
    yellow: 'bg-amber-400/25',
    green: 'bg-emerald-400/25',
    blue: 'bg-sky-400/25',
    pink: 'bg-pink-400/25'
  }
}

const SEARCH_MARK_CLASSES: Record<ReaderTheme, string> = {
  light: 'bg-[var(--accent)]/20',
  paper: 'bg-[var(--accent)]/25',
  dark: 'bg-[var(--accent)]/35'
}

function readStoredNumber(key: string, fallback: number, min: number, max: number): number {
  if (typeof window === 'undefined') return fallback
  const raw = window.localStorage.getItem(key)
  const parsed = raw === null ? NaN : Number(raw)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, Math.round(parsed)))
}

function readStoredTheme(): ReaderTheme {
  if (typeof window === 'undefined') return 'light'
  const raw = window.localStorage.getItem(THEME_KEY)
  return raw === 'paper' || raw === 'dark' || raw === 'light' ? raw : 'light'
}

function readStoredColor(): HighlightColor {
  if (typeof window === 'undefined') return DEFAULT_HIGHLIGHT_COLOR
  const raw = window.localStorage.getItem(HIGHLIGHT_COLOR_KEY)
  return isHighlightColor(raw) ? raw : DEFAULT_HIGHLIGHT_COLOR
}

function normalizeColor(value: unknown): HighlightColor {
  return isHighlightColor(value) ? value : DEFAULT_HIGHLIGHT_COLOR
}

/** 划线记录里 content 保存的是用户备注；没有备注时与原文相同。 */
function noteTextOf(record: NoteRecord): string {
  const content = (record.content || '').trim()
  return content && content !== (record.quote || '').trim() ? content : ''
}

/**
 * 划线标签编辑器：回车或逗号提交，点标签上的叉移除。
 * 单个标签长度与数量上限统一走 `normalizeNoteTags`，与备份导入保持同一口径。
 */
function TagEditor({
  tags,
  onChange,
  zh,
  disabled = false,
  suggestions = []
}: {
  tags: string[]
  onChange: (tags: string[]) => void
  zh: boolean
  disabled?: boolean
  suggestions?: string[]
}) {
  const [draft, setDraft] = useState('')
  const suggestionId = useId()
  const full = tags.length >= MAX_NOTE_TAGS

  const commit = () => {
    const next = normalizeNoteTags([...tags, draft])
    setDraft('')
    if (next.length !== tags.length) onChange(next)
  }

  return (
    <div className="min-w-0">
      {tags.length > 0 && (
        <ul className="mb-1 flex flex-wrap items-center gap-1.5">
          {tags.map(tag => (
            <li key={tag} className="inline-flex items-center gap-1 rounded-full bg-[var(--bg-secondary)] px-2 py-0.5 text-xs">
              {tag}
              <button
                type="button"
                disabled={disabled}
                onClick={() => onChange(tags.filter(item => item !== tag))}
                aria-label={zh ? `移除标签 ${tag}` : `Remove tag ${tag}`}
                className="text-[var(--text-secondary)] hover:text-red-500 disabled:opacity-40"
              >
                <AppIcon name="close" size={11} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <input
        value={draft}
        onChange={event => setDraft(event.target.value)}
        onKeyDown={event => {
          if (event.key !== 'Enter' && event.key !== ',') return
          event.preventDefault()
          commit()
        }}
        onBlur={() => draft.trim() && commit()}
        maxLength={MAX_NOTE_TAG_LENGTH}
        disabled={disabled || full}
        list={suggestionId}
        aria-label={zh ? '添加标签' : 'Add tag'}
        placeholder={full
          ? (zh ? `最多 ${MAX_NOTE_TAGS} 个标签` : `Up to ${MAX_NOTE_TAGS} tags`)
          : (zh ? '输入标签后回车，例如「论证结构」' : 'Type a tag and press Enter')}
        className="input-field !py-1.5 text-xs disabled:opacity-50"
      />
      <datalist id={suggestionId}>
        {suggestions
          .filter(tag => !tags.includes(tag))
          .slice(0, 50)
          .map(tag => <option key={tag} value={tag} />)}
      </datalist>
    </div>
  )
}

export default function BookReader({
  book,
  lang,
  onSaveHighlight,
  onUpdateHighlight,
  onDeleteHighlight,
  onSaveBookmark,
  onUpdateBookmark,
  onDeleteBookmark,
  focusChapterIndex,
  focusOffset,
  onProgressSaved
}: Props) {
  const zh = lang === 'zh'
  const content = book.documentContent ?? ''
  const sections = useMemo(
    () => buildReaderSections({ documentContent: content, chapters: book.chapters }),
    [content, book.chapters]
  )

  const [sectionIndex, setSectionIndex] = useState(0)
  const [fontSize, setFontSize] = useState(MIN_FONT_SIZE)
  const [theme, setTheme] = useState<ReaderTheme>('light')
  const [showPanel, setShowPanel] = useState(false)
  const [panelTab, setPanelTab] = useState<PanelTab>('toc')
  const [selection, setSelection] = useState<SelectionState | null>(null)
  const [selectionColor, setSelectionColor] = useState<HighlightColor>(DEFAULT_HIGHLIGHT_COLOR)
  const [noteComposerOpen, setNoteComposerOpen] = useState(false)
  const [noteDraft, setNoteDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [panelBusy, setPanelBusy] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [markEditor, setMarkEditor] = useState<MarkEditorState | null>(null)
  const [highlightEdit, setHighlightEdit] = useState<HighlightEditState | null>(null)
  const [bookmarkEdit, setBookmarkEdit] = useState<BookmarkEditState | null>(null)
  const [chapterFilter, setChapterFilter] = useState<ChapterFilter>('all')
  const [tagFilter, setTagFilter] = useState<string | null>(null)
  const [selectionTags, setSelectionTags] = useState<string[]>([])
  const [searchInput, setSearchInput] = useState('')
  const [searchKeyword, setSearchKeyword] = useState('')
  const [searchMatches, setSearchMatches] = useState<SearchMatch[]>([])
  const [activeMatchOffset, setActiveMatchOffset] = useState<number | null>(null)

  const articleRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const noticeTimerRef = useRef<number | null>(null)
  const progressCallbackRef = useRef(onProgressSaved)
  const restoredProgressRef = useRef<string | null>(null)

  useEffect(() => {
    progressCallbackRef.current = onProgressSaved
  }, [onProgressSaved])

  useEffect(() => {
    setFontSize(readStoredNumber(FONT_SIZE_KEY, 17, MIN_FONT_SIZE, MAX_FONT_SIZE))
    setTheme(readStoredTheme())
    setSelectionColor(readStoredColor())
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(FONT_SIZE_KEY, String(fontSize))
  }, [fontSize])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(THEME_KEY, theme)
  }, [theme])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(HIGHLIGHT_COLOR_KEY, selectionColor)
  }, [selectionColor])

  useEffect(() => () => {
    if (noticeTimerRef.current !== null && typeof window !== 'undefined') {
      window.clearTimeout(noticeTimerRef.current)
    }
  }, [])

  // 打开书籍时恢复到上次读到的位置；换书后重新定位。
  useEffect(() => {
    if (sections.length === 0) return
    const persistedPage = book.readingProgress?.currentPage ?? 1
    const restoredKey = `${book.id}:${persistedPage}:${sections.length}`
    if (restoredProgressRef.current === restoredKey) return
    restoredProgressRef.current = restoredKey
    setSectionIndex(Math.min(Math.max(0, persistedPage - 1), sections.length - 1))
    // 只在书籍或进度基数变化时恢复位置，用户翻页后不再回跳。
  }, [book.id, sections.length, book.readingProgress?.currentPage])

  useEffect(() => {
    if (sections.length === 0) return
    if (typeof focusOffset === 'number' && Number.isFinite(focusOffset) && focusOffset >= 0) {
      setSectionIndex(findSectionIndexForOffset(sections, focusOffset))
      return
    }
    if (focusChapterIndex === undefined || focusChapterIndex === null || focusChapterIndex < 0) return
    const target = sections.findIndex(section => section.chapterIndex === focusChapterIndex)
    if (target >= 0) setSectionIndex(target)
  }, [focusChapterIndex, focusOffset, sections])

  // 换书后清掉上一本书留下的筛选与草稿，避免筛选到空列表。
  useEffect(() => {
    setChapterFilter('all')
    setTagFilter(null)
    setSelectionTags([])
  }, [book.id])

  const persistedPage = book.readingProgress?.currentPage ?? 0
  const persistedTotal = book.readingProgress?.totalPages ?? 0

  // 阅读进度延迟写入，避免快速翻页时频繁触发云端快照。
  useEffect(() => {
    if (sections.length === 0) return
    const nextPage = sectionIndex + 1
    if (persistedPage === nextPage && persistedTotal === sections.length) return
    const timer = setTimeout(() => {
      try {
        updateReadingProgress(book.id, nextPage, sections.length)
        progressCallbackRef.current?.()
      } catch (error) {
        logger.warn('阅读进度保存失败：', error)
      }
    }, 400)
    return () => clearTimeout(timer)
  }, [book.id, sectionIndex, sections.length, persistedPage, persistedTotal])

  const section = sections[sectionIndex]
  const body = section ? extractSectionBody(content, section) : ''
  const bodyStart = useMemo(
    () => (section ? getSectionBodyStart(content, section) : 0),
    [content, section]
  )
  const highlights = useMemo(
    () => (book.noteRecords || []).filter(record => Boolean(record.quote && record.quote.trim())),
    [book.noteRecords]
  )
  const bookmarks = useMemo(() => book.bookmarks || [], [book.bookmarks])
  /** 全书已有标签，作为标签输入的建议项，避免同一主题写成多个写法。 */
  const highlightTags = useMemo(() => {
    const tags: string[] = []
    const seen = new Set<string>()
    highlights.forEach(record => {
      normalizeNoteTags(record.tags).forEach(tag => {
        const key = tag.toLowerCase()
        if (seen.has(key)) return
        seen.add(key)
        tags.push(tag)
      })
    })
    return tags.sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'))
  }, [highlights])

  const chapterOptions = useMemo(() => {
    const options: Array<{ index: number; title: string }> = []
    const seen = new Set<number>()
    highlights.forEach(record => {
      const index = record.chapterIndex
      if (typeof index !== 'number' || index < 0 || seen.has(index)) return
      seen.add(index)
      const title = (record.chapterTitle || '').trim()
      options.push({
        index,
        title: title || (zh ? `第 ${index + 1} 章` : `Chapter ${index + 1}`)
      })
    })
    return options.sort((a, b) => a.index - b.index)
  }, [highlights, zh])

  const hasUnassignedHighlights = useMemo(
    () => highlights.some(record => typeof record.chapterIndex !== 'number' || record.chapterIndex < 0),
    [highlights]
  )

  const visibleHighlights = useMemo(() => highlights.filter(record => {
    if (chapterFilter === 'none') {
      if (typeof record.chapterIndex === 'number' && record.chapterIndex >= 0) return false
    } else if (chapterFilter !== 'all' && record.chapterIndex !== chapterFilter) {
      return false
    }
    if (tagFilter) {
      const tags = normalizeNoteTags(record.tags)
      if (!tags.some(tag => tag.toLowerCase() === tagFilter.toLowerCase())) return false
    }
    return true
  }), [chapterFilter, highlights, tagFilter])

  // 标签被改名或删除后，正在生效的筛选需要跟着失效，否则面板会停在空列表。
  useEffect(() => {
    if (!tagFilter) return
    if (!highlightTags.some(tag => tag.toLowerCase() === tagFilter.toLowerCase())) setTagFilter(null)
  }, [highlightTags, tagFilter])

  const progressPercentage = getReaderProgressPercentage(sectionIndex, sections.length)

  const highlightRanges = useMemo(
    () => buildHighlightRanges(body, highlights, { bodyStart }),
    [body, highlights, bodyStart]
  )
  const searchRanges = useMemo(
    () => (searchKeyword ? findTermRanges(body, searchKeyword) : []),
    [body, searchKeyword]
  )
  const segments = useMemo(
    () => buildTextSegments(body, highlightRanges, searchRanges, bodyStart),
    [body, highlightRanges, searchRanges, bodyStart]
  )

  const currentSectionBookmark = useMemo(
    () => (section ? bookmarks.find(item => item.offset >= section.start && item.offset < section.end) ?? null : null),
    [bookmarks, section]
  )

  const showNotice = useCallback((tone: Notice['tone'], text: string) => {
    setNotice({ tone, text })
    if (noticeTimerRef.current !== null && typeof window !== 'undefined') {
      window.clearTimeout(noticeTimerRef.current)
      noticeTimerRef.current = null
    }
    if (tone === 'success' && typeof window !== 'undefined') {
      noticeTimerRef.current = window.setTimeout(() => {
        noticeTimerRef.current = null
        setNotice(null)
      }, NOTICE_DURATION)
    }
  }, [])

  const goToSection = useCallback((index: number) => {
    if (sections.length === 0) return
    setSectionIndex(Math.min(Math.max(0, index), sections.length - 1))
    setSelection(null)
    setNoteComposerOpen(false)
    setMarkEditor(null)
    if (typeof window !== 'undefined') {
      window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'auto' }))
    }
  }, [sections.length])

  const goToOffset = useCallback((offset: number) => {
    goToSection(findSectionIndexForOffset(sections, offset))
  }, [goToSection, sections])

  const goPrevious = useCallback(() => goToSection(sectionIndex - 1), [goToSection, sectionIndex])
  const goNext = useCallback(() => goToSection(sectionIndex + 1), [goToSection, sectionIndex])

  const closePanel = useCallback(() => {
    setShowPanel(false)
    setHighlightEdit(null)
    setBookmarkEdit(null)
  }, [])

  const openPanel = useCallback((tab: PanelTab) => {
    setPanelTab(tab)
    setShowPanel(true)
  }, [])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT' || target.isContentEditable)) return
      if (event.key === 'ArrowLeft') goPrevious()
      if (event.key === 'ArrowRight') goNext()
      if (event.key === 'Escape') {
        setSelection(null)
        setNoteComposerOpen(false)
        setMarkEditor(null)
        closePanel()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [goPrevious, goNext, closePanel])

  useEffect(() => {
    if (!showPanel) return
    const handlePointerDown = (event: MouseEvent) => {
      if (!panelRef.current?.contains(event.target as Node)) {
        setShowPanel(false)
        setHighlightEdit(null)
        setBookmarkEdit(null)
      }
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [showPanel])

  // 划线浮层跟随正文位置，滚动后关闭，避免浮层与原文错位。
  useEffect(() => {
    if (!markEditor) return
    const handleScroll = () => setMarkEditor(null)
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [markEditor])

  useEffect(() => {
    if (showPanel && panelTab === 'search') searchInputRef.current?.focus()
  }, [showPanel, panelTab])

  const captureSelection = useCallback(() => {
    if (typeof window === 'undefined') return
    const currentSelection = window.getSelection()
    if (!currentSelection || currentSelection.isCollapsed || currentSelection.rangeCount === 0) {
      setSelection(null)
      return
    }
    const range = currentSelection.getRangeAt(0)
    if (!articleRef.current?.contains(range.commonAncestorContainer)) {
      setSelection(null)
      return
    }
    const text = currentSelection.toString().replace(/[ \t]+\n/g, '\n').trim()
    if (text.length < 2) {
      setSelection(null)
      return
    }
    const rect = range.getBoundingClientRect()
    setMarkEditor(null)
    setSelection({
      text: text.slice(0, MAX_HIGHLIGHT_QUOTE_CHARS),
      top: Math.max(64, rect.top),
      left: Math.min(Math.max(170, rect.left + rect.width / 2), Math.max(170, window.innerWidth - 170))
    })
  }, [])

  const clearSelection = () => {
    setSelection(null)
    setNoteComposerOpen(false)
    setNoteDraft('')
    setSelectionTags([])
    if (typeof window !== 'undefined') window.getSelection()?.removeAllRanges()
  }

  const saveHighlight = async (withNote: boolean) => {
    if (!selection || saving) return
    setSaving(true)
    try {
      const index = body.indexOf(selection.text)
      const saved = await onSaveHighlight({
        quote: selection.text,
        note: withNote ? noteDraft.trim() : '',
        chapterIndex: section && section.chapterIndex >= 0 ? section.chapterIndex : undefined,
        chapterTitle: section?.title || undefined,
        offset: index >= 0 ? bodyStart + index : undefined,
        color: selectionColor,
        tags: normalizeNoteTags(selectionTags)
      })
      if (!saved) {
        showNotice('error', zh ? '划线未能保存，请稍后重试。' : 'The highlight could not be saved. Please try again.')
        return
      }
      clearSelection()
      showNotice('success', zh
        ? '已保存到「我的笔记」，可用于费曼复述与 AI 多视角分析。'
        : 'Saved to Notes. It will ground your Feynman practice and AI analysis.')
    } finally {
      setSaving(false)
    }
  }

  const runPanelAction = async (action: () => Promise<boolean>, failureText: string): Promise<boolean> => {
    if (panelBusy) return false
    setPanelBusy(true)
    try {
      const ok = await action()
      if (!ok) showNotice('error', failureText)
      return ok
    } finally {
      setPanelBusy(false)
    }
  }

  const openMarkEditor = (record: NoteRecord, element: HTMLElement) => {
    if (typeof window === 'undefined') return
    // 用户正在选择文本时不要弹浮层，避免打断划线。
    if (window.getSelection()?.toString().trim()) return
    const rect = element.getBoundingClientRect()
    const width = Math.min(352, window.innerWidth - 32)
    setSelection(null)
    setNoteComposerOpen(false)
    setMarkEditor({
      id: record.id,
      top: Math.min(Math.max(72, rect.bottom + 8), Math.max(72, window.innerHeight - 120)),
      left: Math.min(Math.max(width / 2 + 16, rect.left + rect.width / 2), window.innerWidth - width / 2 - 16),
      note: noteTextOf(record),
      color: normalizeColor(record.color),
      tags: normalizeNoteTags(record.tags)
    })
  }

  const saveMarkEditor = async () => {
    if (!markEditor) return
    const { id, note, color, tags } = markEditor
    const ok = await runPanelAction(
      () => onUpdateHighlight(id, { note: note.trim(), color, tags: normalizeNoteTags(tags) }),
      zh ? '划线更新失败，请稍后重试。' : 'The highlight could not be updated. Please try again.'
    )
    if (ok) {
      setMarkEditor(null)
      showNotice('success', zh ? '划线已更新。' : 'Highlight updated.')
    }
  }

  const deleteMarkHighlight = async () => {
    if (!markEditor) return
    const id = markEditor.id
    const ok = await runPanelAction(
      () => onDeleteHighlight(id),
      zh ? '划线删除失败，请稍后重试。' : 'The highlight could not be deleted. Please try again.'
    )
    if (ok) {
      setMarkEditor(null)
      setHighlightEdit(null)
      showNotice('success', zh ? '划线已删除。' : 'Highlight deleted.')
    }
  }

  const savePanelHighlight = async () => {
    if (!highlightEdit) return
    const { id, note, color, tags } = highlightEdit
    const ok = await runPanelAction(
      () => onUpdateHighlight(id, { note: note.trim(), color, tags: normalizeNoteTags(tags) }),
      zh ? '划线更新失败，请稍后重试。' : 'The highlight could not be updated. Please try again.'
    )
    if (ok) {
      setHighlightEdit(null)
      showNotice('success', zh ? '划线已更新。' : 'Highlight updated.')
    }
  }

  const deletePanelHighlight = async (id: string) => {
    const ok = await runPanelAction(
      () => onDeleteHighlight(id),
      zh ? '划线删除失败，请稍后重试。' : 'The highlight could not be deleted. Please try again.'
    )
    if (ok) {
      setHighlightEdit(null)
      setMarkEditor(null)
      showNotice('success', zh ? '划线已删除。' : 'Highlight deleted.')
    }
  }

  const addBookmark = async () => {
    if (!section) return
    if (currentSectionBookmark) {
      setBookmarkEdit({
        id: currentSectionBookmark.id,
        label: currentSectionBookmark.label || '',
        color: normalizeColor(currentSectionBookmark.color)
      })
      openPanel('bookmarks')
      return
    }
    if (bookmarks.length >= MAX_BOOKMARKS_PER_BOOK) {
      showNotice('error', zh
        ? `单本书最多保存 ${MAX_BOOKMARKS_PER_BOOK} 个书签，请先清理一些旧书签。`
        : `A book can keep up to ${MAX_BOOKMARKS_PER_BOOK} bookmarks. Remove some before adding more.`)
      return
    }
    const ok = await runPanelAction(
      () => onSaveBookmark({
        chapterIndex: section.chapterIndex,
        offset: section.start,
        chapterTitle: section.title || undefined,
        snippet: buildBookmarkSnippet(body, 120),
        color: DEFAULT_HIGHLIGHT_COLOR
      }),
      zh ? '书签保存失败，请稍后重试。' : 'The bookmark could not be saved. Please try again.'
    )
    if (ok) {
      openPanel('bookmarks')
      showNotice('success', zh ? '已添加书签，可在书签列表补充备注。' : 'Bookmark added. Add a note from the bookmark list.')
    }
  }

  const saveBookmarkEditor = async () => {
    if (!bookmarkEdit) return
    const { id, label, color } = bookmarkEdit
    const ok = await runPanelAction(
      () => onUpdateBookmark(id, { label: label.trim(), color }),
      zh ? '书签更新失败，请稍后重试。' : 'The bookmark could not be updated. Please try again.'
    )
    if (ok) {
      setBookmarkEdit(null)
      showNotice('success', zh ? '书签已更新。' : 'Bookmark updated.')
    }
  }

  const deletePanelBookmark = async (id: string) => {
    const ok = await runPanelAction(
      () => onDeleteBookmark(id),
      zh ? '书签删除失败，请稍后重试。' : 'The bookmark could not be deleted. Please try again.'
    )
    if (ok) {
      if (bookmarkEdit?.id === id) setBookmarkEdit(null)
      showNotice('success', zh ? '书签已删除。' : 'Bookmark deleted.')
    }
  }

  const runSearch = (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault()
    const keyword = searchInput.trim().slice(0, MAX_SEARCH_TERM_LENGTH)
    setSearchKeyword(keyword)
    setActiveMatchOffset(null)
    setSearchMatches(keyword ? scanDocumentMatches(content, keyword) : [])
  }

  const jumpToMatch = (match: SearchMatch) => {
    setActiveMatchOffset(match.offset)
    goToOffset(match.offset)
    closePanel()
  }

  const jumpToHighlight = (record: NoteRecord) => {
    if (typeof record.offset === 'number' && Number.isFinite(record.offset)) {
      goToOffset(record.offset)
    } else if (typeof record.chapterIndex === 'number' && record.chapterIndex >= 0) {
      const target = sections.findIndex(item => item.chapterIndex === record.chapterIndex)
      if (target >= 0) goToSection(target)
    }
    setHighlightEdit(null)
    closePanel()
  }

  if (sections.length === 0 || !section) {
    return (
      <div className="card py-14 text-center">
        <AppIcon name="file" tone="muted" size={48} className="mx-auto mb-4" />
        <h3 className="mb-2 text-lg font-bold">{zh ? '这本书还没有可阅读的原文' : 'No readable text yet'}</h3>
        <p className="mx-auto max-w-xl text-sm text-[var(--text-secondary)]">
          {zh
            ? '回到书架，用「导入书籍」上传 EPUB、MOBI、AZW3、FB2、PDF、DOCX、HTML、RTF、TXT 或 Markdown 文件，就能在这里直接阅读原文、划线、写笔记并添加书签。手工创建的书籍不会自动拥有原文。'
            : 'Go back to the library and use “Import Book” with an EPUB, MOBI, AZW3, FB2, PDF, DOCX, HTML, RTF, TXT, or Markdown file to read, highlight, annotate, and bookmark it here. Manually created books do not contain source text.'}
        </p>
      </div>
    )
  }

  const sectionLabel = section.title
    ? (section.continued ? (zh ? `${section.title}（续）` : `${section.title} (cont.)`) : section.title)
    : (zh ? `第 ${sectionIndex + 1} 页` : `Page ${sectionIndex + 1}`)

  const panelTabs: Array<{ key: PanelTab; label: string }> = [
    { key: 'toc', label: zh ? `目录（${sections.length}）` : `Contents (${sections.length})` },
    { key: 'highlights', label: zh ? `划线（${highlights.length}）` : `Highlights (${highlights.length})` },
    { key: 'bookmarks', label: zh ? `书签（${bookmarks.length}）` : `Bookmarks (${bookmarks.length})` },
    { key: 'search', label: zh ? '检索' : 'Search' }
  ]

  return (
    <div className="relative">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <button
            type="button"
            onClick={() => goPrevious()}
            disabled={sectionIndex === 0}
            className="btn-secondary h-9 w-9 !p-0 disabled:opacity-40"
            aria-label={zh ? '上一节' : 'Previous section'}
            title={zh ? '上一节（←）' : 'Previous section (←)'}
          >
            <AppIcon name="chevronLeft" size={17} />
          </button>
          <button
            type="button"
            onClick={() => goNext()}
            disabled={sectionIndex >= sections.length - 1}
            className="btn-secondary h-9 w-9 !p-0 disabled:opacity-40"
            aria-label={zh ? '下一节' : 'Next section'}
            title={zh ? '下一节（→）' : 'Next section (→)'}
          >
            <AppIcon name="chevronRight" size={17} />
          </button>
          <p className="min-w-0 flex-1 truncate text-sm font-medium">{sectionLabel}</p>
          <span className="shrink-0 text-xs text-[var(--text-secondary)]">
            {zh ? `第 ${sectionIndex + 1}/${sections.length} 节 · 已读 ${progressPercentage}%` : `Section ${sectionIndex + 1}/${sections.length} · ${progressPercentage}% read`}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setFontSize(size => Math.max(MIN_FONT_SIZE, size - 1))}
            className="btn-secondary h-9 w-9 !p-0"
            aria-label={zh ? '缩小字号' : 'Decrease font size'}
            title={zh ? '缩小字号' : 'Decrease font size'}
          >
            <AppIcon name="minus" size={16} />
          </button>
          <button
            type="button"
            onClick={() => setFontSize(size => Math.min(MAX_FONT_SIZE, size + 1))}
            className="btn-secondary h-9 w-9 !p-0"
            aria-label={zh ? '放大字号' : 'Increase font size'}
            title={zh ? '放大字号' : 'Increase font size'}
          >
            <AppIcon name="plus" size={16} />
          </button>
          <button
            type="button"
            onClick={() => setTheme(current => current === 'light' ? 'paper' : current === 'paper' ? 'dark' : 'light')}
            className="btn-secondary h-9 gap-1.5 !px-2.5 !text-xs"
            aria-label={zh ? '切换阅读背景' : 'Switch reading background'}
            title={zh ? '切换阅读背景' : 'Switch reading background'}
          >
            <AppIcon name="eye" size={15} />
            {theme === 'light' ? (zh ? '白底' : 'Light') : theme === 'paper' ? (zh ? '纸张' : 'Paper') : (zh ? '夜间' : 'Night')}
          </button>
          <button
            type="button"
            onClick={() => void addBookmark()}
            disabled={panelBusy}
            className="btn-secondary h-9 gap-1.5 !px-2.5 !text-xs disabled:opacity-50"
            aria-pressed={Boolean(currentSectionBookmark)}
            aria-label={currentSectionBookmark
              ? (zh ? '本节已有书签，打开书签列表' : 'This section is bookmarked; open the list')
              : (zh ? '在本节添加书签' : 'Bookmark this section')}
            title={currentSectionBookmark
              ? (zh ? '本节已有书签' : 'Bookmarked')
              : (zh ? '添加书签' : 'Add bookmark')}
          >
            <AppIcon name="bookMarked" tone={currentSectionBookmark ? 'accent' : 'inherit'} size={15} />
            {zh ? '书签' : 'Bookmark'}
          </button>
          <button
            type="button"
            onClick={() => (showPanel && panelTab === 'search' ? closePanel() : openPanel('search'))}
            className="btn-secondary h-9 w-9 !p-0"
            aria-label={zh ? '在全书中检索' : 'Search in this book'}
            title={zh ? '在全书中检索' : 'Search in this book'}
          >
            <AppIcon name="search" size={15} />
          </button>
          <button
            type="button"
            onClick={() => (showPanel ? closePanel() : openPanel(panelTab))}
            className="btn-secondary h-9 gap-1.5 !px-2.5 !text-xs"
            aria-expanded={showPanel}
          >
            <AppIcon name="library" size={15} />
            {zh ? '目录与笔记' : 'Contents'}
          </button>
        </div>
      </div>

      <div className="mb-3 progress-bar">
        <div className="progress-fill" style={{ width: `${progressPercentage}%` }} />
      </div>

      <div className="relative">
        <div
          ref={articleRef}
          onMouseUp={captureSelection}
          onTouchEnd={captureSelection}
          className={`rounded-xl border border-[var(--border)] px-4 py-6 shadow-sm sm:px-8 sm:py-10 ${THEME_CLASSES[theme]}`}
        >
          <h3 className="mb-4 text-lg font-bold">{sectionLabel}</h3>
          <div
            className="whitespace-pre-wrap break-words leading-8"
            style={{ fontSize: `${fontSize}px`, lineHeight: 1.9 }}
          >
            {segments.map((segment, index) => {
              if (segment.kind === 'highlight' && segment.record) {
                const record = segment.record
                const color = normalizeColor(record.color)
                return (
                  <mark
                    key={`highlight-${record.id}-${index}`}
                    data-highlight-id={record.id}
                    role="button"
                    tabIndex={0}
                    title={noteTextOf(record) || (zh ? '点击查看或修改这条划线' : 'Open this highlight')}
                    onClick={event => openMarkEditor(record, event.currentTarget)}
                    onKeyDown={event => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        openMarkEditor(record, event.currentTarget)
                      }
                    }}
                    className={`cursor-pointer rounded-[3px] text-inherit ${HIGHLIGHT_MARK_CLASSES[theme][color]} ${
                      markEditor?.id === record.id ? 'ring-2 ring-[var(--accent)]' : ''
                    }`}
                  >
                    {segment.text}
                  </mark>
                )
              }
              if (segment.kind === 'search') {
                return (
                  <mark
                    key={`search-${segment.offset}-${index}`}
                    className={`rounded-[3px] text-inherit ${SEARCH_MARK_CLASSES[theme]} ${
                      activeMatchOffset !== null && segment.offset === activeMatchOffset ? 'ring-2 ring-[var(--accent)]' : ''
                    }`}
                  >
                    {segment.text}
                  </mark>
                )
              }
              return <span key={`plain-${index}`}>{segment.text}</span>
            })}
          </div>
          <p className={`mt-8 text-xs ${THEME_MUTED_CLASSES[theme]}`}>
            {zh
              ? '选中原文即可划线或写笔记；点击已有划线可以改颜色、补备注、打标签或删除，划线面板支持按章节与标签筛选。划线、书签都会进入「我的笔记」，与费曼练习、AI 多视角分析相互印证。'
              : 'Select text to highlight or annotate. Click an existing highlight to recolor, edit, tag, or delete it; the highlights panel filters by chapter and tag. Highlights and bookmarks feed your Feynman practice and AI analysis.'}
          </p>
        </div>

        {showPanel && (
          <div
            ref={panelRef}
            data-testid="reader-panel"
            className="absolute right-0 top-0 z-20 max-h-[70vh] w-full max-w-sm overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-card)] shadow-xl"
          >
            <div className="flex items-center gap-1 border-b border-[var(--border)] p-2">
              {panelTabs.map(tab => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setPanelTab(tab.key)}
                  className={`min-w-0 flex-1 truncate rounded-lg px-1.5 py-2 text-xs ${panelTab === tab.key ? 'bg-[var(--accent)] text-white' : 'hover:bg-[var(--bg-secondary)]'}`}
                >
                  {tab.label}
                </button>
              ))}
              <button
                type="button"
                onClick={closePanel}
                className="icon-button h-9 w-9 shrink-0"
                aria-label={zh ? '关闭面板' : 'Close panel'}
              >
                <AppIcon name="close" size={17} />
              </button>
            </div>
            <div className="max-h-[60vh] overflow-y-auto p-2">
              {panelTab === 'toc' && (
                <ul className="space-y-1">
                  {sections.slice(0, TOC_RENDER_LIMIT).map(item => (
                    <li key={item.index}>
                      <button
                        type="button"
                        onClick={() => {
                          goToSection(item.index)
                          closePanel()
                        }}
                        className={`w-full rounded-lg px-3 py-2 text-left text-sm ${item.index === sectionIndex ? 'bg-[var(--accent)]/15 font-semibold text-[var(--accent)]' : 'hover:bg-[var(--bg-secondary)]'}`}
                      >
                        <span className="mr-2 text-xs text-[var(--text-secondary)]">{item.index + 1}</span>
                        {item.title ? (item.continued ? `${item.title}${zh ? '（续）' : ' (cont.)'}` : item.title) : (zh ? '正文' : 'Text')}
                      </button>
                    </li>
                  ))}
                  {sections.length > TOC_RENDER_LIMIT && (
                    <li className="px-3 py-2 text-xs text-[var(--text-secondary)]">
                      {zh ? `仅显示前 ${TOC_RENDER_LIMIT} 节，可用左右方向键继续翻页。` : `Showing the first ${TOC_RENDER_LIMIT} sections. Use the arrow keys to keep reading.`}
                    </li>
                  )}
                </ul>
              )}

              {panelTab === 'highlights' && (
                highlights.length === 0 ? (
                  <p className="px-3 py-6 text-center text-sm text-[var(--text-secondary)]">
                    {zh ? '还没有划线。选中原文即可添加。' : 'No highlights yet. Select text to add one.'}
                  </p>
                ) : (
                  <div>
                    <div className="mb-2 space-y-2 rounded-lg bg-[var(--bg-secondary)] p-2">
                      <select
                        value={String(chapterFilter)}
                        onChange={event => {
                          const value = event.target.value
                          setChapterFilter(value === 'all' || value === 'none' ? value : Number(value))
                        }}
                        aria-label={zh ? '按章节筛选划线' : 'Filter highlights by chapter'}
                        className="input-field !py-1.5 text-xs"
                      >
                        <option value="all">{zh ? `全部章节（${highlights.length}）` : `All chapters (${highlights.length})`}</option>
                        {chapterOptions.map(option => (
                          <option key={option.index} value={String(option.index)}>{option.title}</option>
                        ))}
                        {hasUnassignedHighlights && (
                          <option value="none">{zh ? '未标注章节' : 'No chapter'}</option>
                        )}
                      </select>
                      {highlightTags.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1">
                          {[null, ...highlightTags].map(tag => (
                            <button
                              key={tag ?? '__all__'}
                              type="button"
                              onClick={() => setTagFilter(tag)}
                              aria-pressed={tagFilter === tag}
                              className={`rounded-full px-2 py-0.5 text-xs transition ${
                                tagFilter === tag
                                  ? 'bg-[var(--accent)] text-white'
                                  : 'bg-[var(--bg-card)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                              }`}
                            >
                              {tag ?? (zh ? '全部标签' : 'All tags')}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    {visibleHighlights.length === 0 ? (
                      <p className="px-3 py-6 text-center text-sm text-[var(--text-secondary)]">
                        {zh ? '当前筛选条件下没有划线，换个章节或标签试试。' : 'No highlights match this filter. Try another chapter or tag.'}
                      </p>
                    ) : (
                      <ul className="space-y-2">
                        {visibleHighlights.slice().reverse().map(record => {
                          const color = normalizeColor(record.color)
                          const noteText = noteTextOf(record)
                          const recordTags = normalizeNoteTags(record.tags)
                          const editing = highlightEdit?.id === record.id
                          return (
                            <li key={record.id} className="rounded-lg bg-[var(--bg-secondary)] p-3">
                              <div className="mb-1 flex items-start justify-between gap-2">
                                <button
                                  type="button"
                                  onClick={() => jumpToHighlight(record)}
                                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                                  title={zh ? '回到原文位置' : 'Jump to source'}
                                >
                                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${HIGHLIGHT_DOT_CLASSES[color]}`} aria-hidden />
                                  <span className="min-w-0 truncate text-xs text-[var(--text-secondary)]">
                                    {record.chapterTitle || (zh ? '未标注章节' : 'No chapter')} · {new Date(record.createdAt).toLocaleDateString()}
                                  </span>
                                </button>
                                <span className="flex shrink-0 items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => setHighlightEdit(editing ? null : { id: record.id, note: noteText, color, tags: recordTags })}
                                    className="icon-button h-7 w-7"
                                    aria-label={zh ? '编辑划线' : 'Edit highlight'}
                                    title={zh ? '编辑备注与颜色' : 'Edit note and color'}
                                  >
                                    <AppIcon name="edit" size={14} />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => void deletePanelHighlight(record.id)}
                                    disabled={panelBusy}
                                    className="icon-button h-7 w-7 text-red-500 disabled:opacity-50"
                                    aria-label={zh ? '删除划线' : 'Delete highlight'}
                                    title={zh ? '删除划线' : 'Delete highlight'}
                                  >
                                    <AppIcon name="trash" size={14} />
                                  </button>
                                </span>
                              </div>
                              <p className="whitespace-pre-wrap text-sm">{record.quote}</p>
                              {noteText && <p className="mt-1 whitespace-pre-wrap text-xs text-[var(--text-secondary)]">{noteText}</p>}
                              {recordTags.length > 0 && (
                                <ul className="mt-1.5 flex flex-wrap items-center gap-1">
                                  {recordTags.map(tag => (
                                    <li key={tag} className="rounded-full bg-[var(--bg-card)] px-2 py-0.5 text-[11px] text-[var(--text-secondary)]">
                                      {tag}
                                    </li>
                                  ))}
                                </ul>
                              )}
                              {editing && highlightEdit && (
                                <div className="mt-2 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-2">
                                  <textarea
                                    value={highlightEdit.note}
                                    onChange={event => setHighlightEdit({ ...highlightEdit, note: event.target.value })}
                                    maxLength={MAX_HIGHLIGHT_NOTE_CHARS}
                                    placeholder={zh ? '这段原文对你的意义（可留空）' : 'Your note for this passage (optional)'}
                                    className="input-field mb-2 min-h-[70px] text-sm"
                                  />
                                  <div className="mb-2">
                                    <TagEditor
                                      tags={highlightEdit.tags}
                                      onChange={next => setHighlightEdit({ ...highlightEdit, tags: next })}
                                      zh={zh}
                                      disabled={panelBusy}
                                      suggestions={highlightTags}
                                    />
                                  </div>
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <HighlightColorPicker
                                      value={highlightEdit.color}
                                      onChange={next => setHighlightEdit({ ...highlightEdit, color: next })}
                                      zh={zh}
                                      disabled={panelBusy}
                                    />
                                    <span className="flex items-center gap-2">
                                      <button type="button" onClick={() => setHighlightEdit(null)} className="btn-secondary !px-2.5 !py-1.5 !text-xs">
                                        {zh ? '取消' : 'Cancel'}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => void savePanelHighlight()}
                                        disabled={panelBusy}
                                        className="btn-primary !px-2.5 !py-1.5 !text-xs disabled:opacity-50"
                                      >
                                        {zh ? '保存' : 'Save'}
                                      </button>
                                    </span>
                                  </div>
                                </div>
                              )}
                            </li>
                          )
                        })}
                      </ul>
                    )}
                  </div>
                )
              )}

              {panelTab === 'bookmarks' && (
                bookmarks.length === 0 ? (
                  <p className="px-3 py-6 text-center text-sm text-[var(--text-secondary)]">
                    {zh ? '还没有书签。点工具栏的「书签」即可标记当前这一节。' : 'No bookmarks yet. Use “Bookmark” in the toolbar to mark this section.'}
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {bookmarks.slice().reverse().map(bookmark => {
                      const color = normalizeColor(bookmark.color)
                      const editing = bookmarkEdit?.id === bookmark.id
                      return (
                        <li key={bookmark.id} className="rounded-lg bg-[var(--bg-secondary)] p-3">
                          <div className="mb-1 flex items-start justify-between gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                goToOffset(bookmark.offset)
                                setBookmarkEdit(null)
                                closePanel()
                              }}
                              className="flex min-w-0 flex-1 items-center gap-2 text-left"
                              title={zh ? '回到书签位置' : 'Jump to bookmark'}
                            >
                              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${HIGHLIGHT_DOT_CLASSES[color]}`} aria-hidden />
                              <span className="min-w-0 truncate text-xs text-[var(--text-secondary)]">
                                {bookmark.chapterTitle || (zh ? '未标注章节' : 'No chapter')} · {new Date(bookmark.createdAt).toLocaleDateString()}
                              </span>
                            </button>
                            <span className="flex shrink-0 items-center gap-1">
                              <button
                                type="button"
                                onClick={() => setBookmarkEdit(editing ? null : { id: bookmark.id, label: bookmark.label || '', color })}
                                className="icon-button h-7 w-7"
                                aria-label={zh ? '编辑书签' : 'Edit bookmark'}
                                title={zh ? '编辑备注与颜色' : 'Edit note and color'}
                              >
                                <AppIcon name="edit" size={14} />
                              </button>
                              <button
                                type="button"
                                onClick={() => void deletePanelBookmark(bookmark.id)}
                                disabled={panelBusy}
                                className="icon-button h-7 w-7 text-red-500 disabled:opacity-50"
                                aria-label={zh ? '删除书签' : 'Delete bookmark'}
                                title={zh ? '删除书签' : 'Delete bookmark'}
                              >
                                <AppIcon name="trash" size={14} />
                              </button>
                            </span>
                          </div>
                          <p className="text-sm">{bookmark.snippet}</p>
                          {bookmark.label && <p className="mt-1 whitespace-pre-wrap text-xs text-[var(--text-secondary)]">{bookmark.label}</p>}
                          {editing && bookmarkEdit && (
                            <div className="mt-2 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-2">
                              <textarea
                                value={bookmarkEdit.label}
                                onChange={event => setBookmarkEdit({ ...bookmarkEdit, label: event.target.value })}
                                maxLength={MAX_BOOKMARK_LABEL_CHARS}
                                placeholder={zh ? '书签备注（可留空）' : 'Bookmark note (optional)'}
                                className="input-field mb-2 min-h-[60px] text-sm"
                              />
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <HighlightColorPicker
                                  value={bookmarkEdit.color}
                                  onChange={next => setBookmarkEdit({ ...bookmarkEdit, color: next })}
                                  zh={zh}
                                  disabled={panelBusy}
                                />
                                <span className="flex items-center gap-2">
                                  <button type="button" onClick={() => setBookmarkEdit(null)} className="btn-secondary !px-2.5 !py-1.5 !text-xs">
                                    {zh ? '取消' : 'Cancel'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => void saveBookmarkEditor()}
                                    disabled={panelBusy}
                                    className="btn-primary !px-2.5 !py-1.5 !text-xs disabled:opacity-50"
                                  >
                                    {zh ? '保存' : 'Save'}
                                  </button>
                                </span>
                              </div>
                            </div>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                )
              )}

              {panelTab === 'search' && (
                <div className="p-1">
                  <form onSubmit={runSearch} className="flex items-center gap-2">
                    <input
                      ref={searchInputRef}
                      value={searchInput}
                      onChange={event => setSearchInput(event.target.value)}
                      maxLength={MAX_SEARCH_TERM_LENGTH}
                      placeholder={zh ? '在全书中检索关键词' : 'Search this book'}
                      aria-label={zh ? '检索关键词' : 'Search term'}
                      className="input-field text-sm"
                    />
                    <button type="submit" className="btn-primary shrink-0 !px-3 !py-2 !text-xs">
                      {zh ? '检索' : 'Search'}
                    </button>
                  </form>
                  {searchKeyword && (
                    <div className="mt-3">
                      {searchMatches.length === 0 ? (
                        <p className="px-2 py-6 text-center text-sm text-[var(--text-secondary)]">
                          {zh ? `没有找到「${searchKeyword}」。` : `No matches for “${searchKeyword}”.`}
                        </p>
                      ) : (
                        <>
                          <p className="mb-2 px-1 text-xs text-[var(--text-secondary)]">
                            {zh
                              ? `找到 ${searchMatches.length} 处${searchMatches.length >= MAX_SEARCH_MATCHES ? `（仅显示前 ${MAX_SEARCH_MATCHES} 处）` : ''}`
                              : `${searchMatches.length} match${searchMatches.length > 1 ? 'es' : ''}${searchMatches.length >= MAX_SEARCH_MATCHES ? ` (first ${MAX_SEARCH_MATCHES} shown)` : ''}`}
                          </p>
                          <ul className="space-y-1">
                            {searchMatches.map(match => (
                              <li key={match.offset}>
                                <button
                                  type="button"
                                  onClick={() => jumpToMatch(match)}
                                  className="w-full rounded-lg px-2 py-2 text-left text-xs hover:bg-[var(--bg-secondary)]"
                                >
                                  {match.snippet}
                                </button>
                              </li>
                            ))}
                          </ul>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {selection && (
        <div
          className="fixed z-30 -translate-x-1/2 -translate-y-full"
          style={{ top: selection.top - 10, left: selection.left }}
        >
          {noteComposerOpen ? (
            <div className="w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-3 shadow-xl">
              <p className="mb-2 max-h-20 overflow-y-auto whitespace-pre-wrap text-xs text-[var(--text-secondary)]">{selection.text}</p>
              <textarea
                value={noteDraft}
                onChange={event => setNoteDraft(event.target.value)}
                maxLength={MAX_HIGHLIGHT_NOTE_CHARS}
                autoFocus
                placeholder={zh ? '写下这段原文对你的意义（可留空）' : 'Add your note for this passage (optional)'}
                className="input-field mb-2 min-h-[84px] text-sm"
              />
              <div className="mb-2">
                <TagEditor
                  tags={selectionTags}
                  onChange={setSelectionTags}
                  zh={zh}
                  disabled={saving}
                  suggestions={highlightTags}
                />
              </div>
              <div className="mb-2">
                <HighlightColorPicker value={selectionColor} onChange={setSelectionColor} zh={zh} disabled={saving} />
              </div>
              <div className="flex items-center justify-end gap-2">
                <button type="button" onClick={clearSelection} className="btn-secondary !px-3 !py-2 !text-xs">
                  {zh ? '取消' : 'Cancel'}
                </button>
                <button
                  type="button"
                  onClick={() => void saveHighlight(true)}
                  disabled={saving}
                  className="btn-primary !px-3 !py-2 !text-xs disabled:opacity-50"
                >
                  {saving ? (zh ? '保存中...' : 'Saving...') : (zh ? '保存划线笔记' : 'Save highlight')}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-1.5 shadow-xl">
              <HighlightColorPicker value={selectionColor} onChange={setSelectionColor} zh={zh} disabled={saving} />
              <span className="h-5 w-px bg-[var(--border)]" aria-hidden />
              <button
                type="button"
                onClick={() => void saveHighlight(false)}
                disabled={saving}
                className="btn-secondary gap-1.5 !px-3 !py-2 !text-xs disabled:opacity-50"
              >
                <AppIcon name="pin" tone="amber" size={15} />
                {saving ? (zh ? '保存中...' : 'Saving...') : (zh ? '划线' : 'Highlight')}
              </button>
              <button
                type="button"
                onClick={() => setNoteComposerOpen(true)}
                className="btn-primary gap-1.5 !px-3 !py-2 !text-xs"
              >
                <AppIcon name="note" size={15} />
                {zh ? '划线并写笔记' : 'Highlight + note'}
              </button>
            </div>
          )}
        </div>
      )}

      {markEditor && (
        <div
          className="fixed z-30 w-[min(22rem,calc(100vw-2rem))] -translate-x-1/2 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-3 shadow-xl"
          style={{ top: markEditor.top, left: markEditor.left }}
        >
          {(() => {
            const record = highlights.find(item => item.id === markEditor.id)
            if (!record) return null
            return (
              <>
                <p className="mb-2 max-h-20 overflow-y-auto whitespace-pre-wrap text-xs text-[var(--text-secondary)]">{record.quote}</p>
                <textarea
                  value={markEditor.note}
                  onChange={event => setMarkEditor({ ...markEditor, note: event.target.value })}
                  maxLength={MAX_HIGHLIGHT_NOTE_CHARS}
                  placeholder={zh ? '这段原文对你的意义（可留空）' : 'Your note for this passage (optional)'}
                  className="input-field mb-2 min-h-[76px] text-sm"
                />
                <div className="mb-2">
                  <TagEditor
                    tags={markEditor.tags}
                    onChange={next => setMarkEditor({ ...markEditor, tags: next })}
                    zh={zh}
                    disabled={panelBusy}
                    suggestions={highlightTags}
                  />
                </div>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <HighlightColorPicker
                    value={markEditor.color}
                    onChange={next => setMarkEditor({ ...markEditor, color: next })}
                    zh={zh}
                    disabled={panelBusy}
                  />
                  <button
                    type="button"
                    onClick={() => setMarkEditor(null)}
                    className="icon-button h-7 w-7"
                    aria-label={zh ? '关闭划线面板' : 'Close highlight panel'}
                  >
                    <AppIcon name="close" size={14} />
                  </button>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => void deleteMarkHighlight()}
                    disabled={panelBusy}
                    className="btn-secondary gap-1.5 !px-2.5 !py-1.5 !text-xs !text-red-500 disabled:opacity-50"
                  >
                    <AppIcon name="trash" size={14} />
                    {zh ? '删除划线' : 'Delete'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void saveMarkEditor()}
                    disabled={panelBusy}
                    className="btn-primary !px-3 !py-1.5 !text-xs disabled:opacity-50"
                  >
                    {zh ? '保存' : 'Save'}
                  </button>
                </div>
              </>
            )
          })()}
        </div>
      )}

      {notice && (
        <p
          className={`mt-3 text-sm ${notice.tone === 'error' ? 'text-red-500' : 'text-emerald-600 dark:text-emerald-400'}`}
          role={notice.tone === 'error' ? 'alert' : 'status'}
        >
          {notice.text}
        </p>
      )}

      <div className="mt-4 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={goPrevious}
          disabled={sectionIndex === 0}
          className="btn-secondary min-h-11 gap-2 text-sm disabled:opacity-40"
        >
          <AppIcon name="arrowLeft" size={16} />
          {zh ? '上一节' : 'Previous'}
        </button>
        <span className="text-xs text-[var(--text-secondary)]">
          {zh
            ? `${content.length.toLocaleString()} 字符全文 · ${highlights.length} 条划线 · ${bookmarks.length} 个书签`
            : `${content.length.toLocaleString()} characters · ${highlights.length} highlights · ${bookmarks.length} bookmarks`}
        </span>
        <button
          type="button"
          onClick={goNext}
          disabled={sectionIndex >= sections.length - 1}
          className="btn-primary min-h-11 gap-2 text-sm disabled:opacity-40"
        >
          {zh ? '下一节' : 'Next'}
          <AppIcon name="arrowRight" size={16} />
        </button>
      </div>
    </div>
  )
}
