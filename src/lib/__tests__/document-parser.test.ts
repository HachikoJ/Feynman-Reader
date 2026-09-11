import { readFileSync } from 'fs'
import path from 'path'
import {
  MAX_DOCUMENT_FILE_SIZE,
  MAX_DOCUMENT_TEXT_LENGTH,
  describeUnsupportedFormat,
  htmlToPlainText,
  parseDocument,
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

describe('parseDocument upload boundaries', () => {
  it('parses supported text files', async () => {
    await expect(parseDocument(makeFile('notes.txt', '核心概念'))).resolves.toEqual(
      expect.objectContaining({
        content: '核心概念',
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
  it('splits markdown files into chapters by heading', async () => {
    const markdown = '# 第一章\n\n开篇内容\n\n## 第二章\n\n后续内容'
    const parsed = await parseDocument(makeFile('book.md', markdown))
    expect(parsed.chapters?.map(chapter => chapter.title)).toEqual(['第一章', '第二章'])
    expect(parsed.chapters?.[1].content).toContain('后续内容')
  })

  it('converts HTML to readable paragraphs and picks up the title', async () => {
    const html = '<html><head><title>论学习</title><style>p{color:red}</style></head><body><h1>论学习</h1><p>第一段&amp;重点</p><p>第二段</p></body></html>'
    const parsed = await parseDocument(makeFile('lesson.html', html))
    expect(parsed.title).toBe('论学习')
    expect(parsed.content).toContain('第一段&重点')
    expect(parsed.content).toContain('第二段')
    expect(parsed.content).not.toContain('color:red')
    expect(parsed.chapters).toHaveLength(1)
  })

  it('extracts text from RTF control words and escapes', () => {
    expect(rtfToPlainText('{\\rtf1\\ansi 你好\\par 第二段}')).toBe('你好\n第二段')
    expect(rtfToPlainText("{\\rtf1\\ansi\\ansicpg936 \\'c4\\'e3\\par}")).toContain('你')
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
    <section><title>第一章</title><p>专注是一种能力。</p></section>
    <section><title>第二章</title><p>分心是默认状态。</p></section>
  </body>
</FictionBook>`
    const parsed = await parseDocument(makeFile('deep-work.fb2', fb2))
    expect(parsed.title).toBe('深度工作')
    expect(parsed.author).toContain('纽波特')
    expect(parsed.description).toBe('专注力的价值')
    expect(parsed.chapters?.map(chapter => chapter.title)).toEqual(['第一章', '第二章'])
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
      expect.objectContaining({ fileType: 'doc', content: '旧版正文\n第二段' })
    )
    await expect(parseDocument(makeFile('网页文档.doc', '<html><body><p>网页正文</p></body></html>'))).resolves.toEqual(
      expect.objectContaining({ fileType: 'doc', content: '网页正文' })
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
})
