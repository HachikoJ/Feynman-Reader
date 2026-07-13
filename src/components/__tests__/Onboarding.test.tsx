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
    render(<Onboarding lang="zh" onComplete={jest.fn()} />)

    expect(screen.queryByRole('button', { name: '上一步' })).not.toBeInTheDocument()
    next()
    expect(screen.getByText('六阶段深度阅读')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '上一步' }))

    expect(screen.getByText('欢迎使用费曼读书助手')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '上一步' })).not.toBeInTheDocument()
  })

  it('describes the implemented workflow and highlights key facts', () => {
    render(<Onboarding lang="zh" onComplete={jest.fn()} />)

    expect(ONBOARDING_VERSION).toBe('5')
    expect(screen.getByText('欢迎使用费曼读书助手')).toBeInTheDocument()
    expect(screen.getByText('手动添加书籍').tagName).toBe('STRONG')

    next()
    for (const phase of ['背景探索', '全书概览', '深度拆解', '辩证分析', '众声回响', '融会贯通']) {
      expect(screen.getByText(phase)).toBeInTheDocument()
    }
    expect(screen.queryByText('阶段5：教学模拟')).not.toBeInTheDocument()

    next()
    expect(screen.getByText('60 分后')).toBeInTheDocument()
    expect(screen.getByText('全部通过后')).toBeInTheDocument()

    next()
    expect(screen.getByText('不进行 AI 评分')).toBeInTheDocument()
    expect(screen.getByText('直接加入书架')).toBeInTheDocument()

    next()
    const model = screen.getByText('DeepSeek V4 Flash')
    expect(model.tagName).toBe('STRONG')
    expect(model.className).toContain('text-[var(--accent)]')
    expect(screen.getByText('DeepSeek 官方价格和你控制台中的实际账单为准')).toBeInTheDocument()

    next()
    const localData = screen.getByText('平台服务器不保存')
    expect(localData.tagName).toBe('STRONG')
    expect(localData.className).toContain('text-emerald')
    expect(screen.getByText('自行妥善保管数据')).toBeInTheDocument()
  })
})
