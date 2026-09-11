import { readFileSync } from 'fs'
import path from 'path'
import { extractLegacyWordText, isCompoundFile, readCompoundStreams } from '../legacyWord'
import { buildLegacyWordDoc, latin1Bytes, utf16leBytes } from './fixtures/legacyWordFixture'

function realSampleBytes(): Uint8Array {
  const file = path.join(__dirname, 'fixtures', 'legacy-word-sample.doc')
  return new Uint8Array(readFileSync(file))
}

describe('legacy Word (.doc) text extraction', () => {
  it('extracts text from a real Word 97-2003 binary with mixed Chinese and English', () => {
    const bytes = realSampleBytes()
    expect(isCompoundFile(bytes)).toBe(true)

    const text = extractLegacyWordText(bytes)
    expect(text).toContain('费曼学习法强调以教代学，检验自己是否真的理解。')
    expect(text).toContain('Chapter Two in English.')
    expect(text).toContain('第三章 结束语')
    // 段落标记要转换成换行，且不残留 \r
    expect(text).not.toContain('\r')
    expect(text.split('\n\n').length).toBeGreaterThan(1)
  })

  it('reads compressed single-byte pieces at half the stored offset', () => {
    const doc = buildLegacyWordDoc({
      languageId: 0x0804,
      pieces: [{ raw: latin1Bytes('Chapter One'), characters: 11, compressed: true }]
    })

    expect(extractLegacyWordText(doc)).toBe('Chapter One')
  })

  it('decodes compressed pieces with the code page implied by the language ID', () => {
    // 0xE9 在 windows-1252 下是 é，用来确认压缩分片走的是文档代码页
    const doc = buildLegacyWordDoc({
      languageId: 0x0409,
      pieces: [{ raw: latin1Bytes('caf\u00e9 au lait'), characters: 12, compressed: true }]
    })

    expect(extractLegacyWordText(doc)).toBe('café au lait')
  })

  it('mixes compressed and UTF-16LE pieces in one piece table', () => {
    const doc = buildLegacyWordDoc({
      pieces: [
        { raw: latin1Bytes('Chapter 1\r'), characters: 10, compressed: true },
        { raw: utf16leBytes('第二章\r'), characters: 4, compressed: false }
      ]
    })

    expect(extractLegacyWordText(doc)).toBe('Chapter 1\n第二章\n')
  })

  it('falls back to fcMin…fcMac and the code page when the piece table is missing', () => {
    const doc = buildLegacyWordDoc({
      withoutPieceTable: true,
      languageId: 0x0804,
      pieces: [{ raw: Uint8Array.from([0xd6, 0xd0, 0xce, 0xc4]), characters: 2, compressed: true }]
    })

    expect(extractLegacyWordText(doc)).toBe('中文')
  })

  it('detects UTF-16LE text on the fallback path', () => {
    const doc = buildLegacyWordDoc({
      withoutPieceTable: true,
      pieces: [{ raw: utf16leBytes('Fallback text'), characters: 13, compressed: false }]
    })

    expect(extractLegacyWordText(doc)).toBe('Fallback text')
  })

  it('reads the fallback text from the 0Table stream when the flag says so', () => {
    const doc = buildLegacyWordDoc({
      useOneTable: false,
      pieces: [{ raw: latin1Bytes('Plain ASCII body'), characters: 16, compressed: true }]
    })

    expect(extractLegacyWordText(doc)).toBe('Plain ASCII body')
  })

  it('rejects Word 6 / 95 documents with a migration hint', () => {
    const doc = buildLegacyWordDoc({
      identifier: 0xa5dc,
      pieces: [{ raw: latin1Bytes('old'), characters: 3, compressed: true }]
    })

    expect(() => extractLegacyWordText(doc)).toThrow('Word 6.0 / 95')
  })

  it('refuses encrypted documents instead of returning garbage', () => {
    const doc = buildLegacyWordDoc({
      encrypted: true,
      pieces: [{ raw: latin1Bytes('secret'), characters: 6, compressed: true }]
    })

    expect(() => extractLegacyWordText(doc)).toThrow('密码保护')
  })

  it('reports a readable error for non-compound and empty documents', () => {
    expect(isCompoundFile(new Uint8Array([1, 2, 3]))).toBe(false)
    expect(() => readCompoundStreams(new Uint8Array([1, 2, 3]))).toThrow('不是有效的 OLE 复合文档')

    const blank = buildLegacyWordDoc({
      pieces: [{ raw: latin1Bytes('\r\r'), characters: 2, compressed: true }]
    })
    expect(() => extractLegacyWordText(blank)).toThrow('未能从这个 .doc 文件中提取到文字')
  })
})
