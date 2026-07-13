/** @jest-environment jsdom */

import 'openai/shims/node'
import { act, fireEvent, render, screen } from '@testing-library/react'
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
  })

  it('explains the missing API key instead of disabling AI analysis silently', () => {
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

    const analyzeButton = screen.getByRole('button', { name: /开始 AI 深度分析/ })
    expect((analyzeButton as HTMLButtonElement).disabled).toBe(false)
    expect(screen.queryByText(/尚未配置 DeepSeek API Key/)).toBeNull()

    fireEvent.click(analyzeButton)

    expect(screen.getByText('使用 AI 深度分析前，请先前往设置填写并保存 DeepSeek API Key。')).toBeTruthy()
    expect(screen.getAllByRole('alert')).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: '前往设置' }))
    expect(onOpenSettings).toHaveBeenCalledTimes(1)
  })

  it('only shows the consent guidance after the user requests AI analysis', async () => {
    render(
      <ReadingView
        book={book}
        apiKey="sk-test"
        lang="zh"
        onBack={jest.fn()}
        onOpenSettings={jest.fn()}
      />
    )

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(screen.queryByText(/AI 功能尚未启用/)).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /开始 AI 深度分析/ }))

    expect(screen.getByText('请先在设置中同意 AI 数据传输。')).toBeTruthy()
    expect(screen.getAllByRole('alert')).toHaveLength(1)
  })
})
