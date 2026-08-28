/** @jest-environment jsdom */

import '@testing-library/jest-dom'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import MarkdownRenderer from '../MarkdownRenderer'

const renderMermaid = jest.fn()

jest.mock('mermaid', () => ({
  __esModule: true,
  default: {
    initialize: jest.fn(),
    render: (...args: unknown[]) => renderMermaid(...args)
  }
}))

describe('MarkdownRenderer', () => {
  beforeEach(() => {
    renderMermaid.mockReset()
  })
  it('renders headings, emphasis, highlights, lists and code blocks', () => {
    render(
      <MarkdownRenderer
        content={'# 章节标题\n\n## 核心观点\n\n**重要**、__补充__、*提醒*、~~删除~~ 和 ==重点==\n\n- 第一条\n- 第二条\n\n1. 第一步\n2. 第二步\n\n```ts\nconst answer = 42\n```'}
      />
    )

    expect(screen.getByRole('heading', { level: 2, name: '章节标题' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 3, name: '核心观点' })).toBeInTheDocument()
    expect(screen.getByText('重要')).toHaveClass('font-semibold')
    expect(screen.getByText('补充')).toHaveClass('font-semibold')
    expect(screen.getByText('提醒')).toHaveClass('italic')
    expect(screen.getByText('删除')).toHaveClass('line-through')
    expect(screen.getByText('重点')).toHaveAttribute('class', expect.stringContaining('bg-amber'))
    expect(screen.getByText('第一条')).toBeInTheDocument()
    expect(screen.getByText('第二条')).toBeInTheDocument()
    expect(screen.getByText('第一步').closest('ol')).toBeInTheDocument()
    expect(screen.getByText('第二步').closest('ol')).toBeInTheDocument()
    expect(screen.getByText('const answer = 42')).toBeInTheDocument()
  })

  it('filters unsafe links while preserving safe external links', () => {
    render(
      <MarkdownRenderer
        content={'[安全链接](https://example.com)\n\n[危险链接](javascript:alert(1))'}
      />
    )

    expect(screen.getByRole('link', { name: '安全链接' })).toHaveAttribute('href', 'https://example.com')
    expect(screen.queryByRole('link', { name: '危险链接' })).not.toBeInTheDocument()
    expect(screen.getByText('危险链接')).toBeInTheDocument()
  })

  it('renders markdown tables with aligned cells and copy controls for code', () => {
    render(
      <MarkdownRenderer
        content={'| 概念 | 说明 | 数值 |\n| :--- | :---: | ---: |\n| `复利` | ==重点== | 42 |\n\n```js\nconst answer = 42\n```'}
      />
    )

    const table = screen.getByRole('table')
    expect(table).toBeInTheDocument()
    expect(screen.getAllByRole('columnheader')).toHaveLength(3)
    expect(screen.getByRole('columnheader', { name: '概念' })).toHaveStyle({ textAlign: 'left' })
    expect(screen.getByRole('columnheader', { name: '说明' })).toHaveStyle({ textAlign: 'center' })
    expect(screen.getByRole('columnheader', { name: '数值' })).toHaveStyle({ textAlign: 'right' })
    expect(screen.getByText('复利')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /复制代码/ })).toHaveLength(2)
    expect(screen.getByText('js')).toBeInTheDocument()
  })

  it('renders task list items as checkboxes instead of markdown text', () => {
    render(<MarkdownRenderer content={'- [x] 已完成\n- [ ] 待办'} />)

    expect(screen.getByLabelText('已完成')).toHaveTextContent('✓')
    expect(screen.getByLabelText('未完成')).toHaveTextContent('')
    expect(screen.queryByText('[x]')).not.toBeInTheDocument()
  })

  it('copies the exact inline code or code block value', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    render(<MarkdownRenderer content={'Use `npm run build`.\n\n```\nline one\nline two\n```'} />)

    const copyButtons = screen.getAllByRole('button', { name: /复制代码/ })
    fireEvent.click(copyButtons[0])
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('npm run build'))
    fireEvent.click(copyButtons[1])
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('line one\nline two'))
  })

  it('renders inline and block formulas without parsing formulas inside code', () => {
    const { container } = render(<MarkdownRenderer content={'行内：$E=mc^2$。\n\n$$\n\\int_0^1 x dx\n$$\n\n`$not-math$`'} />)

    expect(container.querySelector('.markdown-math-inline[role="math"]')).toHaveAttribute('aria-label', '行内数学公式：E=mc^2')
    expect(container.querySelector('.markdown-math-block[role="math"]')).toHaveAttribute('aria-label', '块级数学公式：\\int_0^1 x dx')
    expect(screen.getByText('$not-math$')).toBeInTheDocument()
  })

  it('preserves nested mixed lists and wrapped list paragraphs', () => {
    const { container } = render(
      <MarkdownRenderer content={'- 第一层\n  1. 嵌套步骤\n  2. 第二步骤\n    - 更深一层\n- 第二层\n  续写内容'} />
    )

    expect(screen.getByText('嵌套步骤').closest('ol')).toBeInTheDocument()
    expect(screen.getByText('更深一层').closest('ul')).toBeInTheDocument()
    expect(screen.getByText('续写内容')).toBeInTheDocument()
    expect(container.querySelectorAll('ul').length).toBeGreaterThanOrEqual(2)
  })

  it('renders safe HTML fragments and removes unsafe content', () => {
    const { container } = render(
      <MarkdownRenderer content={'<mark>重点</mark> <sup>2</sup><br><kbd>⌘K</kbd>\n\n<table><tr><th>字段</th><td>值</td></tr></table>\n\n<script>alert(1)</script> <a href="javascript:alert(1)">危险</a>'} />
    )

    expect(container.querySelector('mark')).toHaveTextContent('重点')
    expect(container.querySelector('sup')).toHaveTextContent('2')
    expect(container.querySelector('kbd')).toHaveTextContent('⌘K')
    expect(container.querySelector('table')).toBeInTheDocument()
    expect(container.querySelector('script')).not.toBeInTheDocument()
    expect(screen.getByText('危险')).not.toHaveAttribute('href')
  })

  it('renders Mermaid through React state and can unmount after rendering', async () => {
    renderMermaid.mockResolvedValue({ svg: '<svg viewBox="0 0 100 40"><text>流程图</text></svg>' })
    const writeText = jest.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    const view = render(<MarkdownRenderer content={'~~~mmd\ngraph TD\n  A-->B\n~~~'} />)

    expect(screen.getByRole('figure', { name: 'Mermaid 图表 / Mermaid diagram' })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('流程图')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: '复制 Mermaid 源码 / Copy Mermaid source' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('graph TD\n  A-->B'))
    expect(screen.getByRole('button', { name: '已复制 Mermaid 源码 / Mermaid source copied' })).toBeInTheDocument()
    expect(() => view.unmount()).not.toThrow()
  })

  it('falls back to Mermaid source after a rendering error', async () => {
    renderMermaid.mockRejectedValue(new Error('invalid diagram'))
    render(<MarkdownRenderer content={'```mermaid\nnot a diagram\n```'} />)

    await waitFor(() => expect(screen.getByText('图表语法暂时无法渲染，已保留 Mermaid 源码。')).toBeInTheDocument())
    expect(screen.getByText('not a diagram')).toBeInTheDocument()
  })
})
