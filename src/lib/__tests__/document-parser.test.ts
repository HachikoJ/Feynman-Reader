import { readFileSync } from 'fs'
import path from 'path'
import {
  MAX_DOCUMENT_FILE_SIZE,
  MAX_DOCUMENT_TEXT_LENGTH,
  describeUnsupportedFormat,
  htmlToPlainText,
  cleanExtractedText,
  parseDocument,
  reconstructPdfText,
  rtfToPlainText,
} from '../document-parser'

function makeFile(name: string, content: string, size = content.length): File {
  const bytes = new TextEncoder().encode(content)
  return {
    name,
    size,
    text: async () => content,
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  } as File
}

function makeBinaryFile(name: string, bytes: Uint8Array): File {
  return {
    name,
    size: bytes.length,
    text: async () => new TextDecoder().decode(bytes),
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  } as File
}

function expectChapterComposition(parsed: Awaited<ReturnType<typeof parseDocument>>) {
  expect(parsed.chapters).toBeDefined()
  expect(parsed.content).toBe(parsed.chapters!.map(chapter => `${chapter.title}\n\n${chapter.content}`).join('\n\n'))
}

describe('parseDocument upload boundaries', () => {
  it('parses supported text files', async () => {
    await expect(parseDocument(makeFile('notes.txt', '核心概念'))).resolves.toEqual(
      expect.objectContaining({
        content: '正文\n\n核心概念',
        fileName: 'notes.txt',
        fileType: 'txt',
      })
    )
  })

  it('rejects unsupported and removed spreadsheet formats', async () => {
    await expect(parseDocument(makeFile('payload.exe', 'data'))).rejects.toThrow('暂不支持 .exe 格式')
    await expect(parseDocument(makeFile('book.xlsx', 'data'))).rejects.toThrow('暂不支持 .xlsx 格式')
  })

  it('explains known-but-unsupported book formats with a migration path', async () => {
    await expect(parseDocument(makeFile('scan.djvu', 'data'))).rejects.toThrow('转换为 PDF')
    expect(describeUnsupportedFormat('azw4', 'en')).toContain('.azw4')
  })

  it('rejects files larger than 20MB before parsing', async () => {
    const file = makeFile('large.txt', 'data', MAX_DOCUMENT_FILE_SIZE + 1)
    await expect(parseDocument(file)).rejects.toThrow('文件大小不能超过 20MB')
  })

  it('rejects extracted text that exceeds the character limit', async () => {
    const content = 'a'.repeat(MAX_DOCUMENT_TEXT_LENGTH + 1)
    await expect(parseDocument(makeFile('large.txt', content))).rejects.toThrow('最多 100 万字符')
  })

  it('rejects empty extracted content', async () => {
    await expect(parseDocument(makeFile('empty.txt', '   '))).rejects.toThrow('文件内容为空')
  })
})

describe('structured ebook formats', () => {
  it('reconstructs PDF lines without inserting spaces into Chinese and preserves paragraphs', () => {
    const parsed = reconstructPdfText([
      [
        { str: '这是', transform: [12, 0, 0, 12, 40, 760], width: 24, height: 12 },
        { str: '一段中文', transform: [12, 0, 0, 12, 64, 760], width: 48, height: 12 },
        { str: '正文。', transform: [12, 0, 0, 12, 112, 760], width: 36, height: 12 },
        { str: '第二段内容。', transform: [12, 0, 0, 12, 40, 720], width: 72, height: 12 }
      ]
    ])
    expect(parsed).toContain('这是一段中文正文。')
    expect(parsed).toContain('\n\n第二段内容。')
    expect(parsed).not.toContain('这 是')
  })

  it('removes repeated page headers and footers while joining wrapped English words', () => {
    const page = (body: string, pageNumber: number) => [
      { str: '书籍标题', transform: [10, 0, 0, 10, 40, 800], width: 40, height: 10 },
      { str: body, transform: [10, 0, 0, 10, 40, 760], width: 160, height: 10 },
      { str: `页脚 ${pageNumber}`, transform: [10, 0, 0, 10, 40, 30], width: 40, height: 10 }
    ]
    const parsed = reconstructPdfText([
      page('learn-', 1),
      [
        { str: '书籍标题', transform: [10, 0, 0, 10, 40, 800], width: 40, height: 10 },
        { str: 'ing matters.', transform: [10, 0, 0, 10, 40, 740], width: 90, height: 10 },
        { str: '页脚 2', transform: [10, 0, 0, 10, 40, 30], width: 40, height: 10 }
      ]
    ])
    expect(parsed).toContain('learning matters.')
    expect(parsed).not.toContain('书籍标题')
    expect(parsed).not.toContain('页脚 1')
  })

  it('splits markdown files into chapters by heading', async () => {
    const markdown = '# 第一章\n\n开篇内容\n\n## 第二章\n\n后续内容'
    const parsed = await parseDocument(makeFile('book.md', markdown))
    expect(parsed.chapters?.map(chapter => chapter.title)).toEqual(['第一章', '第二章'])
    expect(parsed.chapters?.[1].content).toContain('后续内容')
    expectChapterComposition(parsed)
  })

  it('does not treat headings inside fenced Markdown code as chapters', async () => {
    const markdown = '# 第一章\n\n```md\n# 这是代码\n```\n\n正文\n\n## 第二章\n后续内容'
    const parsed = await parseDocument(makeFile('code.md', markdown))
    expect(parsed.chapters?.map(chapter => chapter.title)).toEqual(['第一章', '第二章'])
    expect(parsed.chapters?.[0].content).toContain('# 这是代码')
  })

  it('preserves HTML headings, lists, quotes, tables and code as safe semantic text', async () => {
    const html = `<html><head><title>论学习</title><style>p{color:red}</style></head><body>
      <h1>论学习</h1><p>第一段&amp;<strong>重点</strong></p>
      <h2>方法</h2><ol><li>观察</li><li>解释</li></ol><blockquote>保持怀疑</blockquote>
      <table><tr><th>概念</th><th>解释</th></tr><tr><td>反馈</td><td>校准理解</td></tr></table>
      <pre><code>const answer = 42;\n  return answer;</code></pre></body></html>`
    const parsed = await parseDocument(makeFile('lesson.html', html))
    expect(parsed.title).toBe('论学习')
    expect(parsed.chapters?.map(chapter => chapter.title)).toEqual(['论学习', '方法'])
    expect(parsed.content).toContain('第一段&**重点**')
    expect(parsed.content).toContain('1. 观察\n2. 解释')
    expect(parsed.content).toContain('> 保持怀疑')
    expect(parsed.content).toContain('| 概念 | 解释 |')
    expect(parsed.content).toContain('```\nconst answer = 42;\n  return answer;\n```')
    expect(parsed.content).not.toContain('color:red')
    expectChapterComposition(parsed)
  })

  it('extracts text from RTF control words and escapes', () => {
    expect(rtfToPlainText('{\\rtf1\\ansi 你好\\par 第二段}')).toBe('你好\n\n第二段')
    expect(rtfToPlainText("{\\rtf1\\ansi\\ansicpg936 \\'c4\\'e3\\par}")).toContain('你')
    expect(rtfToPlainText('{\\rtf1\\ansi\\bullet 第一项\\par\\bullet 第二项}')).toContain('- 第一项\n\n- 第二项')
    expect(rtfToPlainText('{\\rtf1\\ansi 第一格\\cell 第二格\\cell\\row}')).toContain('第一格 | 第二格 |')
  })

  it('normalizes TXT chapters and pretty-prints valid JSON', async () => {
    const text = await parseDocument(makeFile('novel.txt', '序言\n\n第一章 开始\n第一段\n\n第二章 继续\n第二段'))
    expect(text.chapters?.map(chapter => chapter.title)).toEqual(['序', '第一章 开始', '第二章 继续'])
    expectChapterComposition(text)

    const json = await parseDocument(makeFile('data.json', '{"concept":"反馈","steps":[1,2]}'))
    expect(json.content).toContain('```json\n{\n  "concept": "反馈"')
    expectChapterComposition(json)
    await expect(parseDocument(makeFile('broken.json', '{bad'))).rejects.toThrow('JSON 解析失败')
  })

  it('preserves DOCX heading, list and table structure', async () => {
    const { Document, HeadingLevel, Packer, Paragraph, Table, TableCell, TableRow } = await import('docx')
    const document = new Document({
      sections: [{
        children: [
          new Paragraph({ text: '学习方法', heading: HeadingLevel.HEADING_1 }),
          new Paragraph({ text: '先观察事实。' }),
          new Paragraph({ text: '再复述概念。', bullet: { level: 0 } }),
          new Table({
            rows: [
              new TableRow({ children: [new TableCell({ children: [new Paragraph('步骤')] }), new TableCell({ children: [new Paragraph('目的')] })] }),
              new TableRow({ children: [new TableCell({ children: [new Paragraph('复述')] }), new TableCell({ children: [new Paragraph('发现缺口')] })] })
            ]
          })
        ]
      }]
    })
    const buffer = await Packer.toBuffer(document)
    const parsed = await parseDocument(makeBinaryFile('method.docx', new Uint8Array(buffer)))
    expect(parsed.chapters?.[0].title).toBe('学习方法')
    expect(parsed.content).toContain('- 再复述概念。')
    expect(parsed.content).toContain('| 步骤 | 目的 |')
    expect(parsed.content).toContain('| --- | --- |')
    expect(parsed.content).toContain('| 复述 | 发现缺口 |')
    expectChapterComposition(parsed)
  })

  it('parses FB2 metadata and sections', async () => {
    const fb2 = `<?xml version="1.0" encoding="utf-8"?>
<FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0">
  <description><title-info>
    <book-title>深度工作</book-title>
    <author><first-name>卡尔</first-name><last-name>纽波特</last-name></author>
    <annotation>专注力的价值</annotation>
  </title-info></description>
  <body>
    <section><title><p>第一章</p></title><p>专注是一种能力。</p>
      <section><title><p>练习</p></title><p>每天安排专注时段。</p></section>
    </section>
    <section><title>第二章</title><p>分心是默认状态。</p></section>
  </body>
</FictionBook>`
    const parsed = await parseDocument(makeFile('deep-work.fb2', fb2))
    expect(parsed.title).toBe('深度工作')
    expect(parsed.author).toContain('纽波特')
    expect(parsed.description).toBe('专注力的价值')
    expect(parsed.chapters?.map(chapter => chapter.title)).toEqual(['第一章', '第二章'])
    expect(parsed.chapters?.[0].content).toContain('## 练习')
    expectChapterComposition(parsed)
  })

  it('extracts a FB2 cover from a self-closing image reference', async () => {
    const coverBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])
    const base64 = Buffer.from(coverBytes).toString('base64')
    const fb2 = `<FictionBook><description><title-info><book-title>封面书</book-title></title-info></description><coverpage><image l:href="#cover"/></coverpage><body><section><p>正文</p></section></body><binary id="cover" content-type="image/jpeg">${base64}</binary></FictionBook>`
    const parsed = await parseDocument(makeFile('cover.fb2', fb2))
    expect(parsed.cover?.startsWith('data:image/jpeg;base64,')).toBe(true)
  })

  it('parses an EPUB package with metadata, spine order and cover', async () => {
    const JSZip = (await import('jszip')).default
    const zip = new JSZip()
    zip.file('mimetype', 'application/epub+zip')
    zip.file('META-INF/container.xml', `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`)
    zip.file('OEBPS/content.opf', `<?xml version="1.0"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>思考，快与慢</dc:title>
    <dc:creator>丹尼尔·卡尼曼</dc:creator>
    <dc:description>两套思维系统</dc:description>
    <meta name="cover" content="cover-image"/>
  </metadata>
  <manifest>
    <item id="chapter1" href="ch1.xhtml" media-type="application/xhtml+xml"/>
    <item id="chapter2" href="ch2.xhtml" media-type="application/xhtml+xml"/>
    <item id="cover-image" href="cover.jpg" media-type="image/jpeg" properties="cover-image"/>
  </manifest>
  <spine><itemref idref="chapter1"/><itemref idref="chapter2"/></spine>
</package>`)
    zip.file('OEBPS/ch1.xhtml', '<html><body><h1>系统一</h1><p>快速直觉。</p></body></html>')
    zip.file('OEBPS/ch2.xhtml', '<html><body><h1>系统二</h1><p>缓慢理性。</p></body></html>')
    zip.file('OEBPS/cover.jpg', new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]))
    const bytes = await zip.generateAsync({ type: 'uint8array' })
    const file = {
      name: 'thinking.epub',
      size: bytes.byteLength,
      arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    } as unknown as File

    const parsed = await parseDocument(file)
    expect(parsed.title).toBe('思考，快与慢')
    expect(parsed.author).toBe('丹尼尔·卡尼曼')
    expect(parsed.cover?.startsWith('data:image/jpeg;base64,')).toBe(true)
    expect(parsed.chapters?.map(chapter => chapter.title)).toEqual(['系统一', '系统二'])
    expect(parsed.content).toContain('快速直觉')
    expectChapterComposition(parsed)
  })

  it('uses EPUB navigation labels when chapter pages have no headings', async () => {
    const JSZip = (await import('jszip')).default
    const zip = new JSZip()
    zip.file('META-INF/container.xml', '<container><rootfiles><rootfile full-path="OEBPS/book.opf"/></rootfiles></container>')
    zip.file('OEBPS/book.opf', `<package xmlns:dc="http://purl.org/dc/elements/1.1/"><metadata><dc:title>目录测试</dc:title></metadata><manifest>
      <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="c1" href="text/ch1.xhtml" media-type="application/xhtml+xml"/>
    </manifest><spine><itemref idref="c1"/></spine></package>`)
    zip.file('OEBPS/nav.xhtml', '<nav epub:type="toc"><ol><li><a href="text/ch1.xhtml">第一部分 · 导航标题</a></li></ol></nav>')
    zip.file('OEBPS/text/ch1.xhtml', '<html><body><p>没有页面标题，但有正文。</p></body></html>')
    const bytes = await zip.generateAsync({ type: 'uint8array' })
    const parsed = await parseDocument({ name: 'nav.epub', size: bytes.length, arrayBuffer: async () => bytes.buffer } as unknown as File)
    expect(parsed.chapters?.[0].title).toBe('第一部分 · 导航标题')
  })

  it('rejects DRM protected EPUB files without crashing', async () => {
    const JSZip = (await import('jszip')).default
    const zip = new JSZip()
    zip.file('META-INF/container.xml', '<container/>')
    zip.file('META-INF/encryption.xml', '<encryption><EncryptedData/></encryption>')
    const bytes = await zip.generateAsync({ type: 'uint8array' })
    const file = {
      name: 'drm.epub',
      size: bytes.byteLength,
      arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    } as unknown as File
    await expect(parseDocument(file)).rejects.toThrow('DRM')
  })
})

describe('legacy .doc documents', () => {
  it('parses a real Word 97-2003 binary through the OLE reader', async () => {
    const bytes = new Uint8Array(readFileSync(path.join(__dirname, 'fixtures', 'legacy-word-sample.doc')))
    const parsed = await parseDocument(makeBinaryFile('费曼学习法示例.doc', bytes))

    expect(parsed.fileType).toBe('doc')
    expect(parsed.content).toContain('费曼学习法强调以教代学')
    expect(parsed.content).toContain('Chapter Two in English.')
    expect(parsed.chapters).toEqual([{ title: '正文', content: expect.stringContaining('第三章 结束语') }])
  })

  it('accepts RTF and HTML files that are only named .doc', async () => {
    await expect(parseDocument(makeFile('旧版文档.doc', '{\\rtf1\\ansi 旧版正文\\par 第二段}'))).resolves.toEqual(
      expect.objectContaining({ fileType: 'doc', content: '正文\n\n旧版正文\n\n第二段' })
    )
    await expect(parseDocument(makeFile('网页文档.doc', '<html><body><p>网页正文</p></body></html>'))).resolves.toEqual(
      expect.objectContaining({ fileType: 'doc', content: '正文\n\n网页正文' })
    )
  })

  it('asks for another export when the .doc structure is unrecognised', async () => {
    await expect(parseDocument(makeBinaryFile('broken.doc', new Uint8Array([1, 2, 3, 4]))))
      .rejects.toThrow('另存为 .docx')
  })
})

describe('htmlToPlainText', () => {
  it('decodes numeric and named entities and drops markup', () => {
    const text = htmlToPlainText('<div>你好&nbsp;世界&#33;</div><ul><li>要点一</li><li>要点二</li></ul>')
    expect(text).toContain('你好 世界!')
    expect(text).toContain('要点一')
    expect(text).not.toContain('<')
  })

  it('keeps footnote references readable and removes invisible extraction noise', () => {
    const text = htmlToPlainText('<p>正文<sup>1</sup></p><aside epub:type="footnote"><p>1 说明文字</p></aside>\u200B')
    expect(text).toContain('正文 [1]')
    expect(text).toContain('脚注：1 说明文字')
    expect(text).not.toContain('\u200B')
    expect(cleanExtractedText('\uFEFF甲\u0000乙\uE000丙')).toBe('甲乙丙')
  })
})
