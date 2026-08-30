import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import AuthGuard from '../AuthGuard'
import { dismissLocalMigrationNotice, migrationDismissedMarkerKey } from '@/lib/accountMigration'

describe('AuthGuard', () => {
  it('keeps public product content visible without an account', () => {
    const setItem = jest.mocked(localStorage.setItem)
    setItem.mockClear()

    const html = renderToStaticMarkup(
      React.createElement(AuthGuard, null, React.createElement('div', null, '产品内容'))
    )

    expect(html).toContain('产品内容')
    expect(html).not.toContain('请登录后继续使用')
    expect(setItem).not.toHaveBeenCalled()
  })

  it('permanently dismisses migration reminders without clearing local data', () => {
    const setItem = jest.mocked(localStorage.setItem)
    const removeItem = jest.mocked(localStorage.removeItem)
    setItem.mockClear()
    removeItem.mockClear()

    dismissLocalMigrationNotice()

    expect(setItem).toHaveBeenCalledWith(migrationDismissedMarkerKey(), 'true')
    expect(removeItem).not.toHaveBeenCalled()
  })
})
