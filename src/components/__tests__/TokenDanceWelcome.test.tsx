/** @jest-environment jsdom */

import '@testing-library/jest-dom'
import { fireEvent, render, screen } from '@testing-library/react'
import TokenDanceWelcome, {
  TOKENDANCE_WELCOME_KEY,
  TOKENDANCE_WELCOME_VERSION
} from '../TokenDanceWelcome'

describe('TokenDanceWelcome', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('explains the limited-time offer without forcing API authorization', () => {
    render(<TokenDanceWelcome lang="zh" onContinue={jest.fn()} />)

    expect(screen.getByRole('img', { name: 'TokenDance' })).toBeInTheDocument()
    expect(screen.getByText('观猹登录')).toBeInTheDocument()
    expect(screen.getByText('账号云端')).toBeInTheDocument()
    expect(screen.getByText('TokenDance AI')).toBeInTheDocument()
    expect(screen.getByText(/DeepSeek V4 Flash 峰时最高约省 20%/)).toBeInTheDocument()
    expect(screen.getByText(/实际价格、适用线路、时段及活动期限/)).toBeInTheDocument()
    expect(screen.queryByText(/向作者提供分润/)).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /查看 TokenDance 实时价目/ })).toHaveAttribute(
      'href',
      'https://tokendance.space/models/deepseek-v4-flash-0731'
    )
    expect(screen.queryByRole('button', { name: /授权|配置 API/ })).not.toBeInTheDocument()
  })

  it('records completion and enters the product', () => {
    const onContinue = jest.fn()
    const setItem = jest.spyOn(Storage.prototype, 'setItem')
    render(<TokenDanceWelcome lang="zh" onContinue={onContinue} />)

    fireEvent.click(screen.getByRole('button', { name: '了解并进入书架' }))

    expect(setItem).toHaveBeenCalledWith(TOKENDANCE_WELCOME_KEY, TOKENDANCE_WELCOME_VERSION)
    expect(onContinue).toHaveBeenCalledTimes(1)
    setItem.mockRestore()
  })

  it('provides the same disclosure in English', () => {
    render(<TokenDanceWelcome lang="en" onContinue={jest.fn()} />)

    expect(screen.getByText(/Up to about 20% off DeepSeek V4 Flash at peak hours/)).toBeInTheDocument()
    expect(screen.getByText(/Actual prices, eligible routes, periods, and offer dates/)).toBeInTheDocument()
    expect(screen.queryByText(/share revenue with the author/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Continue to bookshelf' })).toBeInTheDocument()
  })
})
