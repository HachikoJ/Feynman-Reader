/** @jest-environment jsdom */

import 'openai/shims/node'
import { fireEvent, render, screen, within } from '@testing-library/react'
import HighlightImportDialog from '../HighlightImportDialog'

jest.mock('@/lib/store', () => ({ __esModule: true, ...jest.requireActual('@/lib/store') }))

function renderDialog() {
  return render(<HighlightImportDialog lang="zh" onClose={jest.fn()} />)
}

describe('HighlightImportDialog wording', () => {
  it('calls the feature 导入笔记 instead of 导入划线笔记', () => {
    renderDialog()

    expect(screen.getByRole('heading', { name: '导入笔记' })).toBeInTheDocument()
    expect(screen.queryByText('导入划线笔记')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /导入文本/ })).toBeInTheDocument()
  })

  it('labels the export picker as 笔记来源 and explains how to export', () => {
    renderDialog()
    fireEvent.click(screen.getByRole('button', { name: /导入文本/ }))

    const source = screen.getByLabelText('笔记来源')
    expect(screen.getByText('导出步骤：')).toBeInTheDocument()
    expect(screen.getByText(/我 → 笔记 → 导出笔记/)).toBeInTheDocument()

    fireEvent.change(source, { target: { value: 'kindle' } })
    const kindleLink = screen.getByRole('link', { name: /Kindle Notebook/ })
    expect(kindleLink).toHaveAttribute('href', 'https://read.amazon.com/notebook')
    expect(kindleLink).toHaveAttribute('target', '_blank')
    expect(kindleLink).toHaveAttribute('rel', 'noopener noreferrer')
  })
})

describe('HighlightImportDialog platform support tab', () => {
  it('groups platforms and documents the official export path', () => {
    renderDialog()
    fireEvent.click(screen.getByRole('button', { name: /平台支持说明/ }))

    for (const group of ['官方 API 直连', '官方导出导入', '暂不接入']) {
      expect(screen.getByRole('heading', { name: group, level: 3 })).toBeInTheDocument()
    }

    // 导出类平台要给出步骤和官方链接
    expect(screen.getByRole('link', { name: /获取 Readwise 个人令牌/ }))
      .toHaveAttribute('href', 'https://readwise.io/access_token')
    expect(screen.getByText(/read.amazon.com\/notebook/)).toBeInTheDocument()
  })

  it('folds the un-integrated readers into a single 其他平台 card', () => {
    renderDialog()
    fireEvent.click(screen.getByRole('button', { name: /平台支持说明/ }))

    const card = screen.getByText('其他平台').closest('.rounded-lg')
    expect(card).not.toBeNull()
    const text = within(card as HTMLElement).getByText(/Get笔记/)
    for (const name of ['有道云笔记', '掌阅', '京东读书', '番茄', 'QQ 阅读']) {
      expect(text.textContent).toContain(name)
    }

    // 这些平台不再各自成卡片
    for (const name of ['掌阅', '京东读书', '番茄', 'QQ 阅读', '有道云笔记']) {
      expect(screen.queryByText(name, { exact: true })).not.toBeInTheDocument()
    }
    expect(screen.getByText(/不使用 cookie 抓取/)).toBeInTheDocument()
  })
})
