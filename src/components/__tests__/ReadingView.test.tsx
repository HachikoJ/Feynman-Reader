/** @jest-environment jsdom */

import 'openai/shims/node'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import ReadingView from '../ReadingView'
import { Book } from '@/lib/store'

const book: Book = {
  id: 'book-1',
  name: '测试书籍',
  status: 'unread',
  currentPhase: 0,
  noteRecords: [],
  responses: {},
  practiceRecords: [],
  qaPracticeRecords: [],
  bestScore: 0,
  createdAt: 1,
  updatedAt: 1
}

describe('ReadingView API key guidance', () => {
  beforeEach(() => {
    window.localStorage.clear()
    Object.defineProperty(window, 'scrollTo', { value: jest.fn(), writable: true })
    HTMLElement.prototype.scrollIntoView = jest.fn()
  })

  it('routes missing API key users directly to TokenDance setup without a failed analysis state', () => {
    const onOpenSettings = jest.fn()
    render(
      <ReadingView
        book={book}
        apiKey=""
        lang="zh"
        onBack={jest.fn()}
        onOpenSettings={onOpenSettings}
      />
    )

    const analyzeButton = screen.getByRole('button', { name: /配置 TokenDance，开始分析/ })
    expect((analyzeButton as HTMLButtonElement).disabled).toBe(false)
    expect(screen.queryByRole('alert')).toBeNull()

    fireEvent.click(analyzeButton)

    expect(onOpenSettings).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('routes users with a key but missing consent directly to settings', async () => {
    const onOpenSettings = jest.fn()
    render(
      <ReadingView
        book={book}
        apiKey="sk-test"
        lang="zh"
        onBack={jest.fn()}
        onOpenSettings={onOpenSettings}
      />
    )

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    fireEvent.click(screen.getByRole('button', { name: /配置 TokenDance，开始分析/ }))

    expect(onOpenSettings).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('ReadingView navigation position', () => {
  const sampleBook: Book = {
    ...book,
    id: 'sample-book',
    status: 'finished',
    currentPhase: 6,
    isSample: true,
    responses: {
      background: '## 第一阶段内容\n\n背景内容\n\n## 作者生平\n\n作者信息',
      overview: '## 第二阶段内容\n\n概览内容',
      deepDive: '## 第三阶段内容\n\n拆解内容',
      critical: '## 第四阶段内容\n\n批判内容',
      reception: '## 第五阶段内容\n\n评价内容',
      synthesis: '## 第六阶段内容\n\n总结内容'
    }
  }

  beforeEach(() => {
    window.localStorage.clear()
    Object.defineProperty(window, 'scrollTo', { value: jest.fn(), writable: true })
    HTMLElement.prototype.scrollIntoView = jest.fn()
  })

  it('lets sample users continue to the next phase and moves to its content top', async () => {
    render(
      <ReadingView
        book={sampleBook}
        apiKey=""
        lang="zh"
        onBack={jest.fn()}
        onOpenSettings={jest.fn()}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: '下一阶段：全书概览' }))

    expect(await screen.findByRole('heading', { name: '全书概览' })).toBeInTheDocument()
    await waitFor(() => expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'start'
    }))
  })

  it('continues from the final sample phase to the top of Feynman Practice', async () => {
    render(
      <ReadingView
        book={sampleBook}
        apiKey=""
        lang="zh"
        onBack={jest.fn()}
        onOpenSettings={jest.fn()}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: '第 6 阶段：融会贯通' }))
    fireEvent.click(await screen.findByRole('button', { name: '进入费曼实践' }))

    expect((await screen.findAllByRole('heading', { name: '教学模拟' })).length).toBeGreaterThan(0)
    await waitFor(() => expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalled())
  })

  it('moves back to the reading workspace top when switching main tabs', async () => {
    render(
      <ReadingView
        book={sampleBook}
        apiKey=""
        lang="zh"
        onBack={jest.fn()}
        onOpenSettings={jest.fn()}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: '我的笔记' }))

    expect(await screen.findByRole('heading', { name: '阅读笔记' })).toBeInTheDocument()
    await waitFor(() => expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'start'
    }))
  })

  it('returns to learning progress when expanding all phase sections', async () => {
    render(
      <ReadingView
        book={sampleBook}
        apiKey=""
        lang="zh"
        onBack={jest.fn()}
        onOpenSettings={jest.fn()}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: '展开全部' }))

    await waitFor(() => expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'start'
    }))
  })
})
