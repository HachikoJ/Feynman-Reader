/** @jest-environment jsdom */

import '@testing-library/jest-dom'
import { fireEvent, render, screen } from '@testing-library/react'
import TokenDanceMigrationNotice, {
  TOKENDANCE_MIGRATION_NOTICE_KEY,
  TOKENDANCE_MIGRATION_NOTICE_VERSION
} from '../TokenDanceMigrationNotice'

describe('TokenDanceMigrationNotice', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('explains the DeepSeek sunset and protects historical data', () => {
    render(<TokenDanceMigrationNotice lang="zh" onClose={jest.fn()} />)

    expect(screen.getByText(/2026 年 10 月 1 日下线/)).toBeInTheDocument()
    expect(screen.getByText(/历史数据不会因本次更新被删除或覆盖/)).toBeInTheDocument()
    expect(screen.getByText(/当前版本不改变 IndexedDB 数据结构/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /查看 TokenDance 实时价目/ })).toHaveAttribute(
      'href',
      'https://tokendance.space/models/deepseek-v4-flash-0731'
    )
  })

  it('dismisses once and can open Settings for migration', () => {
    const onClose = jest.fn()
    const onOpenSettings = jest.fn()
    const setItem = jest.spyOn(Storage.prototype, 'setItem')
    render(<TokenDanceMigrationNotice lang="zh" onClose={onClose} onOpenSettings={onOpenSettings} />)

    fireEvent.click(screen.getByRole('button', { name: '前往设置配置' }))

    expect(setItem).toHaveBeenCalledWith(TOKENDANCE_MIGRATION_NOTICE_KEY, TOKENDANCE_MIGRATION_NOTICE_VERSION)
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onOpenSettings).toHaveBeenCalledTimes(1)
    setItem.mockRestore()
  })

  it('keeps the same migration facts in English', () => {
    render(<TokenDanceMigrationNotice lang="en" onClose={jest.fn()} />)

    expect(screen.getByText(/October 1, 2026/)).toBeInTheDocument()
    expect(screen.getByText(/does not delete or overwrite history/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Got it' })).toBeInTheDocument()
  })
})