import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import AuthGuard from '../AuthGuard'

describe('AuthGuard', () => {
  it('keeps the product available before login opens', () => {
    const setItem = jest.mocked(localStorage.setItem)
    setItem.mockClear()

    const html = renderToStaticMarkup(
      React.createElement(AuthGuard, null, React.createElement('div', null, '产品内容'))
    )

    expect(html).toContain('产品内容')
    expect(html).not.toContain('使用观猹登录')
    expect(setItem).not.toHaveBeenCalled()
  })
})
