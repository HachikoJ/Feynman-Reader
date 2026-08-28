/** @jest-environment jsdom */

import { downloadMarkdownAsWord, downloadTableAsExcel, markdownToWordHtml } from '../markdownExport'
import { TextDecoder, TextEncoder } from 'util'
import JSZip from 'jszip'

jest.mock('../mathRendering', () => {
  const actual = jest.requireActual('../mathRendering')
  const image = { data: Uint8Array.from([137, 80, 78, 71]), width: 120, height: 32 }
  return {
    ...actual,
    renderFormulaImageMap: jest.fn(async (markdown: string) => {
      const images = new Map<string, typeof image>()
      actual.findMathExpressions(markdown).forEach((expression: { latex: string; display: boolean }) => {
        images.set(actual.formulaKey(expression.latex, expression.display), image)
      })
      return images
    })
  }
})

Object.assign(globalThis, { TextDecoder, TextEncoder })

describe('markdown exports', () => {
  let click: jest.SpyInstance
  let downloadedBlob: Blob | undefined
  const blobBuffer = (blob: Blob): Promise<ArrayBuffer> => new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as ArrayBuffer)
    reader.onerror = () => reject(reader.error)
    reader.readAsArrayBuffer(blob)
  })

  beforeEach(() => {
    click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    downloadedBlob = undefined
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: jest.fn().mockImplementation((blob: Blob) => { downloadedBlob = blob; return 'blob:markdown-export' }) })
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: jest.fn() })
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('downloads a styled OOXML Excel workbook', async () => {
    await downloadTableAsExcel({ headers: ['名称'], rows: [['**重点** 与 [链接](https://example.com)']] }, '结果/表格.xls')
    expect(click).toHaveBeenCalled()
    const zip = await JSZip.loadAsync(await blobBuffer(downloadedBlob!))
    const sheetXml = await zip.file('xl/worksheets/sheet1.xml')?.async('string')
    expect(sheetXml).toContain('名称')
    expect(sheetXml).toContain('重点 与 链接')
    expect(sheetXml).not.toContain('**重点**')
    expect(await zip.file('xl/styles.xml')?.async('string')).toContain('wrapText')
    const link = document.querySelector('a[download]')
    expect(link).toBeNull()
  })

  it('renders compatible HTML and downloads a page-view Word document', async () => {
    const html = markdownToWordHtml('# 标题\n\n**重点** 与 [链接](https://example.com)\n\n1. 步骤\n\n- [x] 已完成\n- [ ] 待办\n\n| 名称 | 值 |\n| --- | --- |\n| A | `42` |')
    expect(html).toContain('<h1>标题</h1>')
    expect(html).toContain('<strong>重点</strong>')
    expect(html).toContain('<a href="https://example.com">链接</a>')
    expect(html).toContain('<ol>')
    expect(html).toContain('&#9745;')
    expect(html).toContain('&#9744;')
    expect(html).toContain('<code>42</code>')
    expect(html).not.toContain('<script>')
    await downloadMarkdownAsWord('# 标题\n\n<script>alert(1)</script>')
    expect(click).toHaveBeenCalled()
    const zip = await JSZip.loadAsync(await blobBuffer(downloadedBlob!))
    const documentXml = await zip.file('word/document.xml')?.async('string')
    const settingsXml = await zip.file('word/settings.xml')?.async('string')
    expect(documentXml).toContain('标题')
    expect(settingsXml).toContain('w:val="print"')
  })

  it('embeds rendered formulas in Word while keeping print view', async () => {
    await downloadMarkdownAsWord('行内 $E=mc^2$\n\n$$\n\\int_0^1 x dx\n$$')

    const zip = await JSZip.loadAsync(await blobBuffer(downloadedBlob!))
    const documentXml = await zip.file('word/document.xml')?.async('string')
    const media = Object.keys(zip.files).filter(path => path.startsWith('word/media/'))
    expect(documentXml).toContain('<w:drawing>')
    expect(media.length).toBeGreaterThanOrEqual(2)
    expect(await zip.file('word/settings.xml')?.async('string')).toContain('w:val="print"')
  })

  it('embeds formula images in Excel and retains the original LaTeX text', async () => {
    await downloadTableAsExcel({ headers: ['名称', '公式'], rows: [['复利', '$A=P(1+r)^n$']] })

    const zip = await JSZip.loadAsync(await blobBuffer(downloadedBlob!))
    const sheetXml = await zip.file('xl/worksheets/sheet1.xml')?.async('string')
    expect(sheetXml).toContain('$A=P(1+r)^n$')
    expect(sheetXml).toContain('<drawing r:id="rId1"/>')
    expect(zip.file('xl/media/formula-1.png')).not.toBeNull()
    expect(await zip.file('xl/drawings/drawing1.xml')?.async('string')).toContain('descr="A=P(1+r)^n"')
    expect(await zip.file('xl/drawings/_rels/drawing1.xml.rels')?.async('string')).toContain('../media/formula-1.png')
  })

  it('converts safe HTML tables and inline formatting in Word exports', async () => {
    await downloadMarkdownAsWord('<table><thead><tr><th>字段</th><th>值</th></tr></thead><tbody><tr><td><strong>重点</strong></td><td><a href="https://example.com">链接</a></td></tr></tbody></table>')

    const zip = await JSZip.loadAsync(await blobBuffer(downloadedBlob!))
    const documentXml = await zip.file('word/document.xml')?.async('string')
    expect(documentXml).toContain('字段')
    expect(documentXml).toContain('重点')
    expect(documentXml).toContain('链接')
    expect(documentXml).toContain('<w:tbl>')
    expect(documentXml).not.toContain('&lt;table')
  })
})
