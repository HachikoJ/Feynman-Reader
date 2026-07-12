import {
  MAX_DOCUMENT_FILE_SIZE,
  MAX_DOCUMENT_TEXT_LENGTH,
  parseDocument,
} from '../document-parser'

function makeFile(name: string, content: string, size = content.length): File {
  return {
    name,
    size,
    text: async () => content,
  } as File
}

describe('parseDocument upload boundaries', () => {
  it('parses supported text files', async () => {
    await expect(parseDocument(makeFile('notes.md', '# 核心概念'))).resolves.toEqual({
      content: '# 核心概念',
      fileName: 'notes.md',
      fileType: 'md',
    })
  })

  it('rejects unsupported and removed spreadsheet formats', async () => {
    await expect(parseDocument(makeFile('payload.exe', 'data'))).rejects.toThrow('不支持该文件类型')
    await expect(parseDocument(makeFile('book.xlsx', 'data'))).rejects.toThrow('不支持该文件类型')
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
