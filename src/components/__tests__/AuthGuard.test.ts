import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import AuthGuard from '../AuthGuard'

describe('AuthGuard', () => {
  it('renders the product without writing activation or trial state', () => {
    const setItem = jest.mocked(localStorage.setItem)
    setItem.mockClear()

    const html = renderToStaticMarkup(
      React.createElement(AuthGuard, null, React.createElement('div', null, '产品内容'))
    )

    expect(html).toContain('产品内容')
    expect(setItem).not.toHaveBeenCalled()
  })
})
