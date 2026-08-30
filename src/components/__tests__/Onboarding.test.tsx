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
    expect(screen.getByText('登录后，学习数据自动上云')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '上一步' }))

    expect(screen.getByText('先看一本完整示例')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '上一步' })).not.toBeInTheDocument()
  })

  it('describes the implemented workflow and highlights key facts', () => {
    render(<Onboarding lang="zh" aiConfigured={false} onComplete={jest.fn()} />)

    expect(ONBOARDING_VERSION).toBe('7')
    expect(screen.getByText('先看一本完整示例')).toBeInTheDocument()
    expect(screen.getByText('六阶段分析').tagName).toBe('STRONG')

    next()
    expect(screen.getByText('保存到账号云端').tagName).toBe('STRONG')
    expect(screen.getByText('账号中心').tagName).toBe('STRONG')

    next()
    expect(screen.getByText('今日复习').tagName).toBe('STRONG')
    expect(screen.getByText('不会跨用户调用').tagName).toBe('STRONG')

    next()
    expect(screen.getByText('需要 AI 时，配置 TokenDance')).toBeInTheDocument()
    expect(screen.getByText('最高约省 20%').tagName).toBe('STRONG')
    expect(screen.getByText('限时优惠').tagName).toBe('STRONG')
    expect(screen.getByText('官方实时标准及后续通知').tagName).toBe('STRONG')
  })

  it('offers API configuration after the tour for users without AI setup', () => {
    const onComplete = jest.fn()
    const onConfigureApi = jest.fn()
    render(<Onboarding lang="zh" aiConfigured={false} onComplete={onComplete} onConfigureApi={onConfigureApi} />)

    next()
    next()
    next()
    expect(screen.getByRole('button', { name: '配置 TokenDance' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '配置 TokenDance' }))

    expect(onComplete).toHaveBeenCalledTimes(1)
    expect(onConfigureApi).toHaveBeenCalledTimes(1)
  })

  it('does not ask users to configure an API key again after setup is complete', () => {
    render(<Onboarding lang="zh" aiConfigured onComplete={jest.fn()} />)

    next()
    next()
    next()

    expect(screen.getByText('TokenDance 已连接')).toBeInTheDocument()
    expect(screen.getByText('已加密保存')).toBeInTheDocument()
    expect(screen.queryByText('填写 TokenDance API Key')).not.toBeInTheDocument()
  })
})
