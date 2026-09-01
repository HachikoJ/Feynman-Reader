/** @jest-environment jsdom */

import '@testing-library/jest-dom'
import { fireEvent, render, screen } from '@testing-library/react'
import TokenDanceMigrationNotice, {
  TOKENDANCE_MIGRATION_NOTICE_KEY,
  TOKENDANCE_MIGRATION_NOTICE_VERSION
} from '../TokenDanceMigrationNotice'

describe('TokenDanceMigrationNotice', () => {
  const previousTokenDance = process.env.NEXT_PUBLIC_FEYNMAN_TOKENDANCE_ENABLED

  beforeEach(() => {
    window.localStorage.clear()
    process.env.NEXT_PUBLIC_FEYNMAN_TOKENDANCE_ENABLED = 'true'
  })

  afterAll(() => {
    if (previousTokenDance === undefined) delete process.env.NEXT_PUBLIC_FEYNMAN_TOKENDANCE_ENABLED
    else process.env.NEXT_PUBLIC_FEYNMAN_TOKENDANCE_ENABLED = previousTokenDance
  })

  it('explains account cloud storage and protects historical data', () => {
    render(<TokenDanceMigrationNotice lang="zh" onClose={jest.fn()} />)

    expect(screen.getByText(/账号与云端保存已升级/)).toBeInTheDocument()
    expect(screen.getByText(/迁移窗口内完成迁移/)).toBeInTheDocument()
    expect(screen.getByText(/只有服务端确认迁移写入成功后/)).toBeInTheDocument()
    expect(screen.getByText(/永久关闭自动提醒/)).toBeInTheDocument()
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

    fireEvent.click(screen.getByRole('button', { name: '配置 TokenDance' }))

    expect(setItem).toHaveBeenCalledWith(TOKENDANCE_MIGRATION_NOTICE_KEY, TOKENDANCE_MIGRATION_NOTICE_VERSION)
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onOpenSettings).toHaveBeenCalledTimes(1)
    setItem.mockRestore()
  })

  it('keeps the same migration facts in English', () => {
    render(<TokenDanceMigrationNotice lang="en" onClose={jest.fn()} />)

    expect(screen.getByText(/Accounts and cloud storage have been upgraded/)).toBeInTheDocument()
    expect(screen.getByText(/during the migration window/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open Account Center' })).toHaveAttribute('href', '/account?tab=data')
  })

  it('keeps a recovery notice without exposing disabled TokenDance actions', () => {
    process.env.NEXT_PUBLIC_FEYNMAN_TOKENDANCE_ENABLED = 'false'
    render(<TokenDanceMigrationNotice lang="zh" onClose={jest.fn()} onOpenSettings={jest.fn()} />)

    expect(screen.getByText(/TokenDance 配置将在备案完成后恢复/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '配置 TokenDance' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /查看 TokenDance 实时价目/ })).not.toBeInTheDocument()
  })
})
