/** @jest-environment jsdom */

import 'openai/shims/node'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import HighlightImportDialog from '../HighlightImportDialog'
import * as store from '@/lib/store'

jest.mock('@/lib/store', () => ({
  __esModule: true,
  addBook: jest.fn(),
  flushPendingStoreWrites: jest.fn(),
  getBook: jest.fn(),
  getBooks: jest.fn(),
  reloadBookFromPersistence: jest.fn(),
  updateBook: jest.fn(),
}))

const mockGetBooks = store.getBooks as jest.MockedFunction<typeof store.getBooks>
const mockGetBook = store.getBook as jest.MockedFunction<typeof store.getBook>
const mockAddBook = store.addBook as jest.MockedFunction<typeof store.addBook>
const mockUpdateBook = store.updateBook as jest.MockedFunction<typeof store.updateBook>
const mockFlushWrites = store.flushPendingStoreWrites as jest.MockedFunction<typeof store.flushPendingStoreWrites>

const WECHAT_NOTES = `《人类简史》
作者：尤瓦尔·赫拉利

◆ 第一章 认知革命

虚构故事让智人得以大规模协作。
`

const existingBook = {
  id: 'existing-book',
  name: '《人类简史》',
  author: '尤瓦尔·赫拉利',
  status: 'reading' as const,
  currentPhase: 0,
  noteRecords: [],
  responses: {},
  practiceRecords: [],
  qaPracticeRecords: [],
  bestScore: 0,
  createdAt: 1,
  updatedAt: 1,
}

beforeEach(() => {
  jest.clearAllMocks()
  mockGetBooks.mockReturnValue([])
  mockGetBook.mockReturnValue(undefined)
  mockFlushWrites.mockResolvedValue(undefined)
})

function renderDialog() {
  return render(<HighlightImportDialog lang="zh" onClose={jest.fn()} />)
}

describe('HighlightImportDialog wording', () => {
  it('calls the feature 导入笔记 instead of 导入划线笔记', () => {
    renderDialog()

    expect(screen.getByRole('heading', { name: '导入笔记' })).toBeInTheDocument()
    expect(screen.queryByText('导入划线笔记')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /导入文本/ })).toBeInTheDocument()
  })

  it('labels the export picker as 笔记来源 and explains how to export', () => {
    renderDialog()
    fireEvent.click(screen.getByRole('button', { name: /导入文本/ }))

    const source = screen.getByLabelText('笔记来源')
    expect(screen.getByText('导出步骤：')).toBeInTheDocument()
    expect(screen.getByText(/我 → 笔记 → 导出笔记/)).toBeInTheDocument()

    fireEvent.change(source, { target: { value: 'kindle' } })
    const kindleLink = screen.getByRole('link', { name: /Kindle Notebook/ })
    expect(kindleLink).toHaveAttribute('href', 'https://read.amazon.com/notebook')
    expect(kindleLink).toHaveAttribute('target', '_blank')
    expect(kindleLink).toHaveAttribute('rel', 'noopener noreferrer')
  })
})

describe('HighlightImportDialog platform support tab', () => {
  it('groups platforms and documents the official export path', () => {
    renderDialog()
    fireEvent.click(screen.getByRole('button', { name: /平台支持说明/ }))

    for (const group of ['官方 API 直连', '官方导出导入', '暂不接入']) {
      expect(screen.getByRole('heading', { name: group, level: 3 })).toBeInTheDocument()
    }

    // 导出类平台要给出步骤和官方链接
    expect(screen.getByRole('link', { name: /获取 Readwise 个人令牌/ }))
      .toHaveAttribute('href', 'https://readwise.io/access_token')
    expect(screen.getByText(/read.amazon.com\/notebook/)).toBeInTheDocument()
  })

  it('folds the un-integrated readers into a single 其他平台 card', () => {
    renderDialog()
    fireEvent.click(screen.getByRole('button', { name: /平台支持说明/ }))

    const card = screen.getByText('其他平台').closest('.rounded-lg')
    expect(card).not.toBeNull()
    const text = within(card as HTMLElement).getByText(/Get笔记/)
    for (const name of ['有道云笔记', '掌阅', '京东读书', '番茄', 'QQ 阅读']) {
      expect(text.textContent).toContain(name)
    }

    // 这些平台不再各自成卡片
    for (const name of ['掌阅', '京东读书', '番茄', 'QQ 阅读', '有道云笔记']) {
      expect(screen.queryByText(name, { exact: true })).not.toBeInTheDocument()
    }
    expect(screen.getByText(/不使用 cookie 抓取/)).toBeInTheDocument()
  })
})

describe('HighlightImportDialog book association', () => {
  function parseWechatNotes() {
    fireEvent.click(screen.getByRole('button', { name: /导入文本/ }))
    fireEvent.change(screen.getByLabelText('粘贴笔记内容'), { target: { value: WECHAT_NOTES } })
    fireEvent.click(screen.getByRole('button', { name: '解析内容' }))
  }

  it('automatically links notes to a matching bookshelf book', async () => {
    mockGetBooks.mockReturnValue([existingBook])
    mockGetBook.mockImplementation(id => id === existingBook.id ? existingBook : undefined)
    renderDialog()

    parseWechatNotes()

    expect(screen.getByRole('status')).toHaveTextContent('将自动关联到《人类简史》')
    expect(screen.getByLabelText('关联书籍')).toHaveValue(existingBook.id)
    fireEvent.click(screen.getByRole('button', { name: '导入 1 条' }))

    await waitFor(() => expect(mockUpdateBook).toHaveBeenCalledWith(existingBook.id, expect.objectContaining({
      noteRecords: [expect.objectContaining({ source: 'import', quote: '虚构故事让智人得以大规模协作。' })]
    })))
    expect(mockAddBook).not.toHaveBeenCalled()
  })

  it('creates a new bookshelf book with notes when no match exists', async () => {
    const created = { ...existingBook, id: 'new-book', name: '人类简史', status: 'unread' as const }
    mockAddBook.mockReturnValue(created)
    mockGetBook.mockImplementation(id => id === created.id ? created : undefined)
    renderDialog()

    parseWechatNotes()

    expect(screen.getByRole('status')).toHaveTextContent('将新建《人类简史》')
    expect(screen.getByLabelText('关联书籍')).toHaveValue('__new__')
    fireEvent.click(screen.getByRole('button', { name: '导入 1 条' }))

    await waitFor(() => expect(mockAddBook).toHaveBeenCalledWith(
      '人类简史',
      '尤瓦尔·赫拉利',
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      [expect.objectContaining({ source: 'import', quote: '虚构故事让智人得以大规模协作。' })]
    ))
    expect(mockUpdateBook).not.toHaveBeenCalled()
  })

  it('uses the reading-page target before metadata matching', () => {
    const currentBook = { ...existingBook, id: 'current-book', name: '当前阅读书' }
    mockGetBooks.mockReturnValue([currentBook])
    render(<HighlightImportDialog lang="zh" targetBookId={currentBook.id} onClose={jest.fn()} />)

    parseWechatNotes()

    expect(screen.getByLabelText('关联书籍')).toHaveValue(currentBook.id)
    expect(screen.getByRole('status')).toHaveTextContent('将自动关联到《当前阅读书》')
  })
})
