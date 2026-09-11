/** @jest-environment jsdom */

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import BookReader from '../BookReader'
import type { Book, BookBookmark, NoteRecord } from '@/lib/store'

jest.mock('@/lib/readingProgress', () => ({
  __esModule: true,
  updateReadingProgress: jest.fn(),
}))

const chapterOne = '第一章 认知革命\n\n虚构故事让智人得以大规模协作。'
const chapterTwo = '第二章 农业革命\n\n农业革命是史上最大的骗局。'
const documentContent = `${chapterOne}\n\n${chapterTwo}`
const highlightOffset = documentContent.indexOf('虚构故事')

const highlight: NoteRecord = {
  id: 'note-1',
  type: 'note',
  content: '协作能力是智人的关键优势。',
  quote: '虚构故事让智人得以大规模协作。',
  offset: highlightOffset,
  color: 'blue',
  chapterIndex: 0,
  chapterTitle: '第一章 认知革命',
  source: 'reading',
  createdAt: 1,
}

const bookmark: BookBookmark = {
  id: 'bookmark-1',
  chapterIndex: 1,
  offset: documentContent.indexOf('农业革命是史上'),
  chapterTitle: '第二章 农业革命',
  snippet: '农业革命是史上最大的骗局。',
  label: '回过头再看',
  color: 'green',
  createdAt: 2,
}

function createBook(overrides: Partial<Book> = {}): Book {
  const base: Book = {
    id: 'book-1',
    name: '人类简史',
    status: 'reading',
    currentPhase: 0,
    bestScore: 0,
    noteRecords: [highlight],
    responses: {},
    practiceRecords: [],
    qaPracticeRecords: [],
    documentContent,
    chapters: [
      { title: '第一章 认知革命', start: 0, length: chapterOne.length },
      { title: '第二章 农业革命', start: chapterOne.length + 2, length: chapterTwo.length },
    ],
    bookmarks: [bookmark],
    readingProgress: { currentPage: 1, totalPages: 2, percentage: 50 },
    createdAt: 1,
    updatedAt: 1,
  }
  return Object.assign({}, base, overrides)
}

interface Handlers {
  onSaveHighlight: jest.Mock
  onUpdateHighlight: jest.Mock
  onDeleteHighlight: jest.Mock
  onSaveBookmark: jest.Mock
  onUpdateBookmark: jest.Mock
  onDeleteBookmark: jest.Mock
}

function createHandlers(): Handlers {
  return {
    onSaveHighlight: jest.fn().mockResolvedValue(true),
    onUpdateHighlight: jest.fn().mockResolvedValue(true),
    onDeleteHighlight: jest.fn().mockResolvedValue(true),
    onSaveBookmark: jest.fn().mockResolvedValue(true),
    onUpdateBookmark: jest.fn().mockResolvedValue(true),
    onDeleteBookmark: jest.fn().mockResolvedValue(true),
  }
}

function renderReader(book: Book, handlers: Handlers = createHandlers()) {
  const view = render(<BookReader book={book} lang="zh" {...handlers} />)
  return { ...view, handlers }
}

beforeEach(() => {
  window.scrollTo = jest.fn()
  window.localStorage.clear()
})

describe('BookReader reading surface', () => {
  it('renders the current section and marks saved highlights in the text', () => {
    renderReader(createBook())
    expect(screen.getByRole('heading', { name: '第一章 认知革命' })).toBeInTheDocument()
    const mark = screen.getByText('虚构故事让智人得以大规模协作。', { selector: 'mark' })
    expect(mark).toHaveAttribute('data-highlight-id', 'note-1')
  })

  it('falls back to an empty state for books without readable text', () => {
    renderReader(createBook({ documentContent: undefined, chapters: undefined, bookmarks: [], noteRecords: [] }))
    expect(screen.getByText('这本书还没有可阅读的原文')).toBeInTheDocument()
  })


  it('renders imported semantic structure instead of exposing markdown markers', () => {
    renderReader(createBook({
      documentContent: '正文\n\n## 方法框架\n\n- 观察\n- 复述\n\n| 步骤 | 目标 |\n| --- | --- |\n| 1 | 理解 |\n\n```txt\nplain code\n```',
      chapters: undefined,
      bookmarks: [],
      noteRecords: []
    }))

    expect(screen.getByRole('heading', { name: '方法框架' })).toBeInTheDocument()
    expect(screen.getByText('观察').closest('ul')).toBeInTheDocument()
    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(screen.getByText('plain code')).toBeInTheDocument()
    expect(screen.queryByText('## 方法框架')).not.toBeInTheDocument()
  })

  it('moves to the next section with the toolbar button', () => {
    renderReader(createBook())
    fireEvent.click(screen.getAllByRole('button', { name: '下一节' })[0])
    expect(screen.getByRole('heading', { name: '第二章 农业革命' })).toBeInTheDocument()
    expect(screen.getByText('第 2/2 节 · 已读 100%')).toBeInTheDocument()
  })


  it('opens the assistant with the exact original-text offset', () => {
    renderReader(createBook())
    const passage = screen.getByText('虚构故事让智人得以大规模协作。', { selector: 'mark' })
    const textNode = passage.firstChild as Node
    const range = document.createRange()
    range.selectNodeContents(textNode)
    Object.defineProperty(range, 'getBoundingClientRect', {
      value: () => ({ left: 40, top: 80, bottom: 100, width: 200, height: 20 })
    })
    const selectionSpy = jest.spyOn(window, 'getSelection').mockReturnValue({
      isCollapsed: false,
      rangeCount: 1,
      getRangeAt: () => range,
      toString: () => passage.textContent || '',
      removeAllRanges: jest.fn()
    } as unknown as Selection)
    const listener = jest.fn()
    window.addEventListener('feynman-open-assistant', listener)

    fireEvent.mouseUp(passage)
    fireEvent.click(screen.getByRole('button', { name: '向费曼小助手提问' }))

    expect((listener.mock.calls[0][0] as CustomEvent).detail).toMatchObject({
      bookId: 'book-1',
      source: { kind: 'original', bookId: 'book-1', offset: highlightOffset }
    })
    window.removeEventListener('feynman-open-assistant', listener)
    selectionSpy.mockRestore()
  })
})

describe('BookReader bookmarks', () => {
  it('adds a bookmark for the open section with its position and snippet', async () => {
    const book = createBook({ bookmarks: [], readingProgress: { currentPage: 2, totalPages: 2, percentage: 100 } })
    const { handlers } = renderReader(book)
    fireEvent.click(screen.getByRole('button', { name: '在本节添加书签' }))
    await waitFor(() => expect(handlers.onSaveBookmark).toHaveBeenCalledTimes(1))
    expect(handlers.onSaveBookmark).toHaveBeenCalledWith({
      chapterIndex: 1,
      offset: chapterOne.length + 2,
      chapterTitle: '第二章 农业革命',
      snippet: '农业革命是史上最大的骗局。',
      color: 'yellow',
    })
    await waitFor(() => expect(screen.getByText('还没有书签。点工具栏的「书签」即可标记当前这一节。')).toBeInTheDocument())
  })

  it('opens the existing bookmark for editing instead of creating a duplicate', async () => {
    const book = createBook({ readingProgress: { currentPage: 2, totalPages: 2, percentage: 100 } })
    const { handlers } = renderReader(book)
    fireEvent.click(screen.getByRole('button', { name: '本节已有书签，打开书签列表' }))
    expect(handlers.onSaveBookmark).not.toHaveBeenCalled()
    const label = screen.getByPlaceholderText('书签备注（可留空）') as HTMLTextAreaElement
    expect(label.value).toBe('回过头再看')
  })

  it('saves bookmark notes and deletes bookmarks from the panel', async () => {
    const { handlers } = renderReader(createBook())
    fireEvent.click(screen.getByRole('button', { name: '目录与笔记' }))
    fireEvent.click(screen.getByRole('button', { name: '书签（1）' }))

    fireEvent.click(screen.getByRole('button', { name: '编辑书签' }))
    const textarea = screen.getByPlaceholderText('书签备注（可留空）')
    fireEvent.change(textarea, { target: { value: '人物传记部分再读一遍' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => expect(handlers.onUpdateBookmark).toHaveBeenCalledWith('bookmark-1', {
      label: '人物传记部分再读一遍',
      color: 'green',
    }))

    fireEvent.click(screen.getByRole('button', { name: '删除书签' }))
    await waitFor(() => expect(handlers.onDeleteBookmark).toHaveBeenCalledWith('bookmark-1'))
  })
})

describe('BookReader highlights', () => {
  it('edits and deletes highlights from the notes panel', async () => {
    const { handlers } = renderReader(createBook())
    fireEvent.click(screen.getByRole('button', { name: '目录与笔记' }))
    fireEvent.click(screen.getByRole('button', { name: '划线（1）' }))
    expect(screen.getByText('协作能力是智人的关键优势。')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '编辑划线' }))
    const textarea = screen.getByPlaceholderText('这段原文对你的意义（可留空）')
    fireEvent.change(textarea, { target: { value: '群居与想象力的作用' } })
    const editor = textarea.closest('div') as HTMLElement
    fireEvent.click(within(editor.closest('li') as HTMLElement).getByRole('button', { name: '保存' }))
    await waitFor(() => expect(handlers.onUpdateHighlight).toHaveBeenCalledWith('note-1', {
      note: '群居与想象力的作用',
      color: 'blue',
      tags: [],
    }))

    fireEvent.click(screen.getByRole('button', { name: '删除划线' }))
    await waitFor(() => expect(handlers.onDeleteHighlight).toHaveBeenCalledWith('note-1'))
  })

  it('opens a highlight editor when a marked passage is clicked', async () => {
    const { handlers } = renderReader(createBook())
    fireEvent.click(screen.getByText('虚构故事让智人得以大规模协作。', { selector: 'mark' }))
    const textarea = screen.getByPlaceholderText('这段原文对你的意义（可留空）') as HTMLTextAreaElement
    expect(textarea.value).toBe('协作能力是智人的关键优势。')
    fireEvent.change(textarea, { target: { value: '认知革命的第一推动力' } })
    fireEvent.click(within(textarea.parentElement as HTMLElement).getByRole('button', { name: '保存' }))
    await waitFor(() => expect(handlers.onUpdateHighlight).toHaveBeenCalledWith('note-1', {
      note: '认知革命的第一推动力',
      color: 'blue',
      tags: [],
    }))
  })

  it('adds and removes tags from a highlight in the notes panel', async () => {
    const { handlers } = renderReader(createBook())
    fireEvent.click(screen.getByRole('button', { name: '目录与笔记' }))
    fireEvent.click(screen.getByRole('button', { name: '划线（1）' }))
    fireEvent.click(screen.getByRole('button', { name: '编辑划线' }))

    const panel = screen.getByTestId('reader-panel')
    const tagInput = within(panel).getByLabelText('添加标签')
    fireEvent.change(tagInput, { target: { value: '论证结构' } })
    fireEvent.keyDown(tagInput, { key: 'Enter' })
    expect(within(panel).getByText('论证结构')).toBeInTheDocument()

    fireEvent.click(within(panel).getByRole('button', { name: '保存' }))
    await waitFor(() => expect(handlers.onUpdateHighlight).toHaveBeenCalledWith('note-1', {
      note: '协作能力是智人的关键优势。',
      color: 'blue',
      tags: ['论证结构'],
    }))
  })

  it('filters the highlight list by chapter and by tag', () => {
    const secondHighlight: NoteRecord = {
      id: 'note-2',
      type: 'note',
      content: '农业革命带来的影响。',
      quote: '农业革命是史上最大的骗局。',
      offset: documentContent.indexOf('农业革命是史上'),
      color: 'pink',
      chapterIndex: 1,
      chapterTitle: '第二章 农业革命',
      source: 'reading',
      tags: ['论证结构'],
      createdAt: 3,
    }
    renderReader(createBook({
      noteRecords: [{ ...highlight, tags: ['关键概念'] }, secondHighlight]
    }))
    fireEvent.click(screen.getByRole('button', { name: '目录与笔记' }))
    fireEvent.click(screen.getByRole('button', { name: '划线（2）' }))
    const panel = screen.getByTestId('reader-panel')

    fireEvent.change(within(panel).getByLabelText('按章节筛选划线'), { target: { value: '1' } })
    expect(within(panel).queryByText('虚构故事让智人得以大规模协作。')).not.toBeInTheDocument()
    expect(within(panel).getByText('农业革命是史上最大的骗局。')).toBeInTheDocument()

    fireEvent.change(within(panel).getByLabelText('按章节筛选划线'), { target: { value: 'all' } })
    fireEvent.click(within(panel).getByRole('button', { name: '关键概念' }))
    expect(within(panel).getByText('虚构故事让智人得以大规模协作。')).toBeInTheDocument()
    expect(within(panel).queryByText('农业革命是史上最大的骗局。')).not.toBeInTheDocument()
  })
})

describe('BookReader search', () => {
  it('lists matches across the whole book and jumps to the hit', async () => {
    renderReader(createBook())
    fireEvent.click(screen.getByRole('button', { name: '在全书中检索' }))
    const input = screen.getByLabelText('检索关键词')
    fireEvent.change(input, { target: { value: '骗局' } })
    fireEvent.click(within(input.closest('form') as HTMLFormElement).getByRole('button', { name: '检索' }))

    expect(await screen.findByText('找到 1 处')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /骗局/ }))
    expect(screen.getByRole('heading', { name: '第二章 农业革命' })).toBeInTheDocument()
  })

  it('reports when a keyword is missing from the book', async () => {
    renderReader(createBook())
    fireEvent.click(screen.getByRole('button', { name: '在全书中检索' }))
    const input = screen.getByLabelText('检索关键词')
    fireEvent.change(input, { target: { value: '不存在的内容' } })
    fireEvent.click(within(input.closest('form') as HTMLFormElement).getByRole('button', { name: '检索' }))
    expect(await screen.findByText('没有找到「不存在的内容」。')).toBeInTheDocument()
  })
})
