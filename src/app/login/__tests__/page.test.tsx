/** @jest-environment jsdom */

import { render, screen, waitFor } from '@testing-library/react'
import LoginPage from '../page'

jest.mock('@/lib/accountClient', () => {
  const actual = jest.requireActual('@/lib/accountClient')
  return { ...actual, getAccount: jest.fn(async () => ({ user: null, configured: true })) }
})

describe('login page authentication transition', () => {
  const previousWatcha = process.env.NEXT_PUBLIC_FEYNMAN_WATCHA_OAUTH_ENABLED
  const previousBypass = process.env.NEXT_PUBLIC_FEYNMAN_LOCAL_AUTH_BYPASS

  afterEach(() => {
    if (previousWatcha === undefined) delete process.env.NEXT_PUBLIC_FEYNMAN_WATCHA_OAUTH_ENABLED
    else process.env.NEXT_PUBLIC_FEYNMAN_WATCHA_OAUTH_ENABLED = previousWatcha
    if (previousBypass === undefined) delete process.env.NEXT_PUBLIC_FEYNMAN_LOCAL_AUTH_BYPASS
    else process.env.NEXT_PUBLIC_FEYNMAN_LOCAL_AUTH_BYPASS = previousBypass
  })

  it('shows only password account controls during filing review', async () => {
    process.env.NEXT_PUBLIC_FEYNMAN_WATCHA_OAUTH_ENABLED = 'false'
    process.env.NEXT_PUBLIC_FEYNMAN_LOCAL_AUTH_BYPASS = 'false'
    render(<LoginPage />)
    await waitFor(() => expect(screen.getByRole('button', { name: '登录' })).toBeInTheDocument())
    expect(screen.getByRole('button', { name: '注册账号' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '使用观猹登录' })).not.toBeInTheDocument()
  })

  it('shows only Watcha login after OAuth is enabled', async () => {
    process.env.NEXT_PUBLIC_FEYNMAN_WATCHA_OAUTH_ENABLED = 'true'
    process.env.NEXT_PUBLIC_FEYNMAN_LOCAL_AUTH_BYPASS = 'false'
    render(<LoginPage />)
    await waitFor(() => expect(screen.getByRole('link', { name: '使用观猹登录' })).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: '登录' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '注册账号' })).not.toBeInTheDocument()
  })

  it('keeps Watcha as the only entry when a stale local bypass flag remains', async () => {
    process.env.NEXT_PUBLIC_FEYNMAN_WATCHA_OAUTH_ENABLED = 'true'
    process.env.NEXT_PUBLIC_FEYNMAN_LOCAL_AUTH_BYPASS = 'true'
    render(<LoginPage />)
    await waitFor(() => expect(screen.getByRole('link', { name: '使用观猹登录' })).toBeInTheDocument())
    expect(screen.queryByText('备案期间使用本地模式')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '登录' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '注册账号' })).not.toBeInTheDocument()
  })
})
