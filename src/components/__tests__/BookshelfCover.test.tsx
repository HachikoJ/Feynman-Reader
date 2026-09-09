/** @jest-environment jsdom */

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { Book } from '@/lib/store'

const updateBookMock = jest.fn()
const flushMock = jest.fn<Promise<void>, []>()
const testBook: Book = {
  id: 'cover-book', name: '封面测试书', author: '测试作者', description: '测试介绍',
  cover: 'data:image/png;base64,b2xk', tags: [{ name: '测试标签', category: '文学' }],
  status: 'unread', currentPhase: 0, bestScore: 0, responses: {},
  noteRecords: [], practiceRecords: [], qaPracticeRecords: [], createdAt: 1, updatedAt: 1,
}

jest.mock('@/lib/store', () => ({
  getBooks: () => [testBook], getSettings: () => ({ apiKey: '' }),
  getAllCategories: () => [], getAllTags: () => [],
  updateBook: (...args: unknown[]) => updateBookMock(...args),
  flushPendingStoreWrites: () => flushMock(),
}))
jest.mock('../AuthGuard', () => ({ useAccountAccess: () => ({ isAuthenticated: true, requestLogin: jest.fn() }) }))
jest.mock('../Charts', () => ({ LibraryAnalytics: () => null }))
jest.mock('../BookListManager', () => ({ __esModule: true, default: () => null }))
jest.mock('../DocumentUpload', () => ({ __esModule: true, default: () => null }))
jest.mock('@/lib/deepseek', () => ({ createDeepSeekClient: jest.fn(), generateBookTags: jest.fn() }))

import Bookshelf from '../Bookshelf'

class ControlledReader {
  static instances: ControlledReader[] = []
  result: string | null = null
  readyState = 0
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  onabort: (() => void) | null = null
  readAsDataURL = jest.fn(() => { this.readyState = 1 })
  abort = jest.fn(() => { this.readyState = 2; this.onabort?.() })
  constructor() { ControlledReader.instances.push(this) }
  complete(value: string) { this.result = value; this.readyState = 2; this.onload?.() }
}

const originalReader = globalThis.FileReader
function openEditor() {
  const view = render(<Bookshelf lang="zh" onSelectBook={jest.fn()} />)
  fireEvent.click(screen.getByTitle('编辑'))
  return view
}
function selectCover(file = new File(['image'], 'cover.png', { type: 'image/png' })) {
  fireEvent.change(screen.getByLabelText('封面图片文件'), { target: { files: [file] } })
  return ControlledReader.instances.at(-1)!
}

describe('bookshelf cover editing', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    flushMock.mockResolvedValue(undefined)
    ControlledReader.instances = []
    globalThis.FileReader = ControlledReader as unknown as typeof FileReader
  })
  afterEach(() => { globalThis.FileReader = originalReader })

  it('sends explicit clearing values for cover, author, description, and all tags', async () => {
    openEditor()
    fireEvent.change(screen.getByDisplayValue('测试作者'), { target: { value: '' } })
    fireEvent.change(screen.getByDisplayValue('测试介绍'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: '移除图片' }))
    fireEvent.click(screen.getByRole('button', { name: '移除标签 测试标签' }))
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => expect(updateBookMock).toHaveBeenCalledWith(testBook.id, {
      name: testBook.name, author: '', description: '', cover: '', tags: [],
    }))
  })

  it('keeps save disabled until the latest selected file finishes and ignores an older callback', () => {
    openEditor()
    const first = selectCover()
    expect(screen.getByRole('button', { name: '保存' })).toBeDisabled()
    expect(screen.getByRole('status')).toHaveTextContent('正在读取封面图片')
    const second = selectCover(new File(['second'], 'second.png', { type: 'image/png' }))
    expect(first.abort).toHaveBeenCalled()
    act(() => second.complete('data:image/png;base64,bmV3'))
    act(() => first.complete('data:image/png;base64,b2xkZXI='))
    expect(screen.getByAltText('Cover')).toHaveAttribute('src', 'data:image/png;base64,bmV3')
    expect(screen.getByRole('button', { name: '保存' })).toBeEnabled()
  })

  it('a late read callback cannot restore a removed cover', () => {
    openEditor()
    const reader = selectCover()
    fireEvent.click(screen.getByRole('button', { name: '移除图片' }))
    act(() => reader.complete('data:image/png;base64,c3RhbGU='))
    expect(reader.abort).toHaveBeenCalled()
    expect(screen.queryByAltText('Cover')).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '保存' })).toBeEnabled()
  })

  it('closing and reopening the editor invalidates a previous file read', () => {
    openEditor()
    const reader = selectCover()
    fireEvent.click(screen.getByRole('button', { name: '关闭书籍窗口' }))
    fireEvent.click(screen.getByTitle('编辑'))
    act(() => reader.complete('data:image/png;base64,c3RhbGU='))
    expect(screen.getByAltText('Cover')).toHaveAttribute('src', testBook.cover)
    expect(screen.getByRole('button', { name: '保存' })).toBeEnabled()
  })

  it('clears the file input so selecting the same file can trigger another read', () => {
    openEditor()
    const input = screen.getByLabelText('封面图片文件') as HTMLInputElement
    Object.defineProperty(input, 'value', { configurable: true, writable: true, value: 'C:\\fakepath\\cover.png' })
    const file = new File(['image'], 'cover.png', { type: 'image/png' })
    selectCover(file)
    expect(input.value).toBe('')
    selectCover(file)
    expect(ControlledReader.instances).toHaveLength(2)
  })

  it('shows a failed read and allows recovery by selecting a valid image', () => {
    openEditor()
    const reader = selectCover()
    act(() => reader.onerror?.())
    expect(screen.getByRole('alert')).toHaveTextContent('封面图片读取失败')
    expect(screen.getByRole('button', { name: '保存' })).toBeDisabled()
    const retry = selectCover()
    act(() => retry.complete('data:image/png;base64,bmV3'))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '保存' })).toBeEnabled()
  })

  it('rejects unsupported file results visibly instead of storing an invisible cover', () => {
    openEditor()
    const reader = selectCover()
    act(() => reader.complete('data:text/plain;base64,dGV4dA=='))
    expect(screen.getByRole('alert')).toHaveTextContent('封面图片读取失败')
    expect(screen.getByAltText('Cover')).toHaveAttribute('src', testBook.cover)
    expect(updateBookMock).not.toHaveBeenCalled()
  })

  it('keeps the modal open and cover controls locked while saving', async () => {
    let finish!: () => void
    flushMock.mockReturnValueOnce(new Promise<void>(resolve => { finish = resolve }))
    const view = openEditor()
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    expect(screen.getByRole('button', { name: '保存中...' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '上传封面' })).toBeDisabled()
    fireEvent.click(view.container.querySelector('.modal-overlay')!)
    expect(screen.getByRole('heading', { name: '编辑书籍' })).toBeInTheDocument()
    await act(async () => { finish() })
    expect(screen.queryByRole('heading', { name: '编辑书籍' })).not.toBeInTheDocument()
  })

  it('aborts pending cover work when the bookshelf unmounts', () => {
    const view = openEditor()
    const reader = selectCover()
    view.unmount()
    expect(reader.abort).toHaveBeenCalled()
    act(() => reader.complete('data:image/png;base64,c3RhbGU='))
    expect(updateBookMock).not.toHaveBeenCalled()
  })
})
