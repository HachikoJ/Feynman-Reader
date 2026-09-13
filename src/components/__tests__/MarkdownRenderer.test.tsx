/** @jest-environment jsdom */

import '@testing-library/jest-dom'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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

  it('renders H1-H6 without letting code fences produce headings or anchor offsets', () => {
    const content = [
      '# 一级标题',
      '##二级标题',
      '### 三级标题 ###',
      '#### 四级标题',
      '##### 五级标题',
      '###### 六级标题',
      '',
      '```md',
      '# 代码里的伪标题',
      '```'
    ].join('\n')
    const { container } = render(<MarkdownRenderer content={content} />)

    expect(screen.getByRole('heading', { level: 2, name: '一级标题' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 3, name: '二级标题' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 4, name: '三级标题' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 5, name: '四级标题' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 6, name: '五级标题' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 6, name: '六级标题' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '代码里的伪标题' })).not.toBeInTheDocument()
    expect(screen.getByText('# 代码里的伪标题')).toBeInTheDocument()
    // 同一分节里的标题各自带遍历行偏移，目录、书签才能区分同名章节下的多个子标题。
    expect(container.querySelectorAll('[data-reader-heading]')).toHaveLength(6)
  })

  it('adds book-level heading offsets when a base offset is provided', () => {
    const content = '# 一级\n\n正文\n\n#### 无空格\n\n结尾。'
    const { container } = render(<MarkdownRenderer content={content} headingOffsetBase={100} />)

    const headings = [...container.querySelectorAll<HTMLElement>('[data-reader-heading]')]
    expect(headings.map(node => node.getAttribute('data-reader-offset')))
      .toEqual(['100', String(100 + content.indexOf('#### 无空格'))])
  })

  it('renders inline images before link syntax without leaking a stray bang', () => {
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
    const { container } = render(
      <MarkdownRenderer content={`说明：![内嵌占位图片](${png})**粗体**与[普通链接](https://example.com)。`} />
    )

    const image = screen.getByAltText('内嵌占位图片')
    expect(image).toBeInTheDocument()
    expect(image.tagName).toBe('IMG')
    expect(image).toHaveAttribute('src', png)
    expect(screen.getByRole('link', { name: '普通链接' })).toHaveAttribute('href', 'https://example.com')
    expect(screen.getByText('粗体')).toHaveClass('font-semibold')
    // 图片曾被普通链接分支抢先匹配，留下一个孤立的 `!`。
    expect(container.textContent).not.toContain('!')
  })

  it('degrades remote images to safe links and keeps unsupported sources as text', () => {
    const { container } = render(
      <MarkdownRenderer content={'![远程图片](https://example.com/a.png) 和 ![危险图片](javascript:alert(1))'} />
    )

    const remote = screen.getByRole('link', { name: '远程图片' })
    expect(remote).toHaveAttribute('href', 'https://example.com/a.png')
    expect(container.querySelectorAll('img')).toHaveLength(0)
    expect(screen.queryByText('!')).not.toBeInTheDocument()
    expect(container.textContent).toContain('危险图片')
    expect(container.textContent).not.toContain('javascript:')
  })

  it('keeps ordered list numbering continuous across loose lists and honours explicit starts', () => {
    const { container } = render(
      <MarkdownRenderer content={'3. 第三步\n\n4. 第四步\n\n普通段落\n\n5) 第五步\n6) 第六步'} />
    )

    const lists = [...container.querySelectorAll('ol')]
    expect(lists.map(list => list.getAttribute('start'))).toEqual(['3', '5'])
    expect(lists.map(list => (list as HTMLElement).style.getPropertyValue('--list-start'))).toEqual(['2', '4'])
  })

  it('maps H1-H6 to decreasing heading levels and sizes without leaking hash markers', () => {
    const content = [1, 2, 3, 4, 5, 6]
      .map(level => `${'#'.repeat(level)} ${level} 级标题`)
      .join('\n\n')
    const { container } = render(<MarkdownRenderer content={content} />)

    const headings = [...container.querySelectorAll<HTMLElement>('[data-reader-heading]')]
    expect(headings.map(node => node.tagName)).toEqual(['H2', 'H3', 'H4', 'H5', 'H6', 'H6'])
    ;['text-2xl', 'text-xl', 'text-lg', 'text-base', 'text-sm', 'text-[13px]'].forEach((size, index) => {
      expect(headings[index]).toHaveClass(size)
    })
    expect(screen.queryByText(/#+ \d 级标题/)).not.toBeInTheDocument()
  })

  it('keeps raw heading anchors when annotations inject highlight markers above them', () => {
    const raw = '# 第一章\n\n这里有重点。\n\n## 第一节\n\n正文。'
    const annotated = raw.replace('这里有重点。', '这里有<mark data-highlight-id="n1">重点</mark>。')
    // 注入标记后按渲染文本回推的偏移会整体后移，锚点必须沿用原始扫描结果。
    expect(annotated.indexOf('## 第一节')).toBeGreaterThan(raw.indexOf('## 第一节'))

    const { container } = render(
      <MarkdownRenderer
        content={annotated}
        headingOffsetBase={0}
        headingOffsets={[0, raw.indexOf('## 第一节')]}
      />
    )
    const headings = [...container.querySelectorAll<HTMLElement>('[data-reader-heading]')]
    expect(headings.map(node => node.getAttribute('data-reader-offset')))
      .toEqual(['0', String(raw.indexOf('## 第一节'))])
  })

  it('renders highlight markers inside a heading title without exposing the markup', () => {
    const content = '# 第一<mark data-highlight-id="n1">章</mark> 认知\n\n正文。'
    const { container } = render(<MarkdownRenderer content={content} headingOffsetBase={0} headingOffsets={[0]} />)

    // 行内 HTML 片段会让无障碍名称按元素边界断词，可见文本仍是「第一章 认知」。
    expect(screen.getByRole('heading', { level: 2, name: /第一\s*章\s*认知/ })).toBeInTheDocument()
    expect(container.querySelector('h2')).toHaveAttribute('data-reader-offset', '0')
    expect(container.textContent).not.toContain('<mark')
  })

  it('anchors Setext headings at the title line and consumes the underline row', () => {
    const content = '正文段落。\n\n标题一\n===\n\n标题二\n---\n\n结尾。'
    const { container } = render(<MarkdownRenderer content={content} headingOffsetBase={50} />)

    const headings = [...container.querySelectorAll<HTMLElement>('[data-reader-heading]')]
    expect(headings.map(node => node.tagName)).toEqual(['H2', 'H3'])
    expect(headings.map(node => node.getAttribute('data-reader-offset')))
      .toEqual([String(50 + content.indexOf('标题一')), String(50 + content.indexOf('标题二'))])
    expect(container.textContent).not.toContain('===')
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

  it('preserves nested blockquote levels instead of flattening them', () => {
    const { container } = render(
      <MarkdownRenderer content={'> 第一层引用\n>\n> > 第二层引用\n>\n> 回到第一层引用'} />
    )

    const outer = container.querySelector('blockquote')
    expect(outer).toHaveTextContent('第一层引用')
    expect(outer?.querySelector('blockquote')).toHaveTextContent('第二层引用')
    expect(outer?.querySelectorAll(':scope > p')).toHaveLength(2)
    expect(container.textContent).not.toContain('> 第二层引用')
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

  it('offers assistant, quote and copy actions for selected learning content', async () => {
    const saveQuote = jest.fn().mockResolvedValue(undefined)
    const writeText = jest.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    const openEvents: Array<CustomEvent> = []
    const onOpen = (event: Event) => openEvents.push(event as CustomEvent)
    window.addEventListener('feynman-open-assistant', onOpen)

    render(
      <MarkdownRenderer
        content="虚构故事让人类能够大规模协作。"
        lang="zh"
        onQuoteSelected={saveQuote}
        selectionSource={{
          id: 'phase:book-1:overview',
          kind: 'phase',
          bookId: 'book-1',
          phaseId: 'overview',
          label: '阶段学习',
          title: '《人类简史》· 全书概览'
        }}
      />
    )

    const paragraph = screen.getByText('虚构故事让人类能够大规模协作。')
    const textNode = paragraph.firstChild as Node
    const selection = {
      isCollapsed: false,
      rangeCount: 1,
      anchorNode: textNode,
      focusNode: textNode,
      toString: () => '虚构故事让人类能够大规模协作。',
      getRangeAt: () => ({ getBoundingClientRect: () => ({ left: 20, top: 20, bottom: 40, width: 180, height: 20 }) })
    }
    jest.spyOn(window, 'getSelection').mockReturnValue(selection as unknown as Selection)

    fireEvent.mouseUp(paragraph)
    const toolbar = await screen.findByRole('toolbar', { name: '选中文本操作' })
    fireEvent.click(within(toolbar).getByRole('button', { name: '加入金句' }))
    await waitFor(() => expect(saveQuote).toHaveBeenCalledWith('虚构故事让人类能够大规模协作。'))

    fireEvent.click(within(toolbar).getByRole('button', { name: '复制选中内容' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('虚构故事让人类能够大规模协作。'))

    fireEvent.click(within(toolbar).getByRole('button', { name: '向费曼小助手提问' }))
    expect(openEvents).toHaveLength(1)
    expect(openEvents[0].detail).toEqual(expect.objectContaining({
      bookId: 'book-1',
      source: expect.objectContaining({
        kind: 'phase',
        phaseId: 'overview',
        excerpt: '虚构故事让人类能够大规模协作。'
      })
    }))
    window.removeEventListener('feynman-open-assistant', onOpen)
  })
})
