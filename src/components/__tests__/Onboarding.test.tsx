/** @jest-environment jsdom */

import '@testing-library/jest-dom'
import { fireEvent, render, screen } from '@testing-library/react'
import Onboarding, { ONBOARDING_VERSION } from '../Onboarding'

describe('Onboarding implemented-feature copy', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  const next = () => {
    fireEvent.click(screen.getByRole('button', { name: '下一步' }))
  }

  it('allows users to return to the previous step', () => {
    render(<Onboarding lang="zh" aiConfigured={false} onComplete={jest.fn()} />)

    expect(screen.queryByRole('button', { name: '上一步' })).not.toBeInTheDocument()
    next()
    expect(screen.getByText('每天用 5 分钟复习')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '上一步' }))

    expect(screen.getByText('先看一本完整示例')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '上一步' })).not.toBeInTheDocument()
  })

  it('describes the implemented workflow and highlights key facts', () => {
    render(<Onboarding lang="zh" aiConfigured={false} onComplete={jest.fn()} />)

    expect(ONBOARDING_VERSION).toBe('6')
    expect(screen.getByText('先看一本完整示例')).toBeInTheDocument()
    expect(screen.getByText('六阶段分析').tagName).toBe('STRONG')

    next()
    expect(screen.getByText('今日复习').tagName).toBe('STRONG')
    expect(screen.getByText('当前浏览器').tagName).toBe('STRONG')

    next()
    expect(screen.getByText('需要新分析时，再连接 TokenDance')).toBeInTheDocument()
    expect(screen.getByText('TokenDance').tagName).toBe('STRONG')
    expect(screen.getByText('官方实时标准及后续通知').tagName).toBe('STRONG')
  })

  it('offers API configuration after the three-step tour for users without AI setup', () => {
    const onComplete = jest.fn()
    const onConfigureApi = jest.fn()
    render(<Onboarding lang="zh" aiConfigured={false} onComplete={onComplete} onConfigureApi={onConfigureApi} />)

    next()
    next()
    expect(screen.getByRole('button', { name: '去配置 API' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '去配置 API' }))

    expect(onComplete).toHaveBeenCalledTimes(1)
    expect(onConfigureApi).toHaveBeenCalledTimes(1)
  })

  it('does not ask users to configure an API key again after setup is complete', () => {
    render(<Onboarding lang="zh" aiConfigured onComplete={jest.fn()} />)

    next()
    next()

    expect(screen.getByText('TokenDance 已连接')).toBeInTheDocument()
    expect(screen.getByText('均已配置完成')).toBeInTheDocument()
    expect(screen.queryByText('填写 TokenDance API Key')).not.toBeInTheDocument()
  })
})
