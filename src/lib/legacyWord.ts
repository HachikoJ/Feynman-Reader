// 旧版 Word（.doc，Word 97-2003 二进制格式）文本提取。
// 纯浏览器实现：先解析 OLE 复合文档，取出 WordDocument 与 0Table / 1Table 流，
// 再按 FIB 中的分片表（piece table）还原正文，不依赖 Node API 或额外依赖。

const COMPOUND_FILE_SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]
/** 复合文档链尾标记；FREESECT / FATSECT 等特殊值同样不再指向有效扇区。 */
const END_OF_CHAIN = 0xfffffffe
/** FAT 与迷你 FAT 中可作为普通扇区号使用的最大值。 */
const MAX_SECTOR = 0xfffffffa
const DIRECTORY_ENTRY_SIZE = 128
/** 防止损坏文件造成死循环。 */
const MAX_CHAIN_LENGTH = 200_000

const WORD_IDENTIFIER_8 = 0xa5ec
const WORD_IDENTIFIER_6 = 0xa5dc
const FIB_FLAG_ENCRYPTED = 0x0100
const FIB_FLAG_WHICH_TABLE = 0x0200
/** FibRgFcLcb97 中 fcClx / lcbClx 的固定偏移。 */
const FIB_OFFSET_FC_CLX = 0x01a2
const FIB_OFFSET_LCB_CLX = 0x01a6
const FIB_OFFSET_FC_MIN = 0x0018
const FIB_OFFSET_FC_MAC = 0x001c

export function isCompoundFile(bytes: Uint8Array): boolean {
  if (bytes.length < COMPOUND_FILE_SIGNATURE.length) return false
  return COMPOUND_FILE_SIGNATURE.every((byte, index) => bytes[index] === byte)
}

function readUint16(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] || 0) | ((bytes[offset + 1] || 0) << 8)
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset] || 0) |
    ((bytes[offset + 1] || 0) << 8) |
    ((bytes[offset + 2] || 0) << 16) |
    ((bytes[offset + 3] || 0) << 24)
  ) >>> 0
}

function concatChunks(chunks: Uint8Array[], totalLength: number): Uint8Array {
  const output = new Uint8Array(totalLength)
  let offset = 0
  for (const chunk of chunks) {
    if (offset + chunk.length > totalLength) break
    output.set(chunk, offset)
    offset += chunk.length
  }
  return output
}

const decoderCache = new Map<string, TextDecoder | null>()

function decodeBytes(bytes: Uint8Array, encoding: string): string {
  if (!decoderCache.has(encoding)) {
    let decoder: TextDecoder | null = null
    try {
      decoder = new TextDecoder(encoding)
    } catch {
      decoder = null
    }
    decoderCache.set(encoding, decoder)
  }
  const decoder = decoderCache.get(encoding)
  if (decoder) return decoder.decode(bytes)
  // 运行环境缺少该代码页时退回单字节解码，至少保留可读的拉丁字符
  let output = ''
  for (const byte of bytes) output += String.fromCharCode(byte)
  return output
}

interface CompoundDirectoryEntry {
  name: string
  type: number
  startSector: number
  size: number
}

/**
 * 读取 OLE 复合文档中的所有流（不解析存储层级的父子关系，直接按名字索引）。
 * 仅供 .doc 读取使用，遇到结构异常时抛出可读错误而不是崩溃。
 */
export function readCompoundStreams(bytes: Uint8Array): Map<string, Uint8Array> {
  if (!isCompoundFile(bytes)) throw new Error('不是有效的 OLE 复合文档')

  const sectorSize = 1 << readUint16(bytes, 0x1e)
  const miniSectorSize = 1 << readUint16(bytes, 0x20)
  const miniStreamCutoff = readUint32(bytes, 0x38)
  const directoryStart = readUint32(bytes, 0x30)
  const miniFatStart = readUint32(bytes, 0x3c)
  const miniFatCount = readUint32(bytes, 0x40)
  const difatStart = readUint32(bytes, 0x44)
  const difatCount = readUint32(bytes, 0x48)

  if (sectorSize < 128 || sectorSize > 1 << 20 || miniSectorSize < 16 || miniSectorSize > sectorSize) {
    throw new Error('复合文档头部信息异常')
  }

  const sectorOffset = (sector: number) => (sector + 1) * sectorSize
  const hasSector = (sector: number) =>
    sector <= MAX_SECTOR && sectorOffset(sector) + sectorSize <= bytes.length

  // FAT 扇区位置：头部内联 109 项，超出部分放在 DIFAT 扇区里
  const fatSectors: number[] = []
  for (let index = 0; index < 109; index++) {
    const sector = readUint32(bytes, 0x4c + index * 4)
    if (sector > MAX_SECTOR) break
    fatSectors.push(sector)
  }
  let difatSector = difatStart
  for (let index = 0; index < difatCount && hasSector(difatSector); index++) {
    const base = sectorOffset(difatSector)
    const entriesPerDifatSector = sectorSize / 4 - 1
    for (let entry = 0; entry < entriesPerDifatSector; entry++) {
      const sector = readUint32(bytes, base + entry * 4)
      if (sector <= MAX_SECTOR) fatSectors.push(sector)
    }
    difatSector = readUint32(bytes, base + sectorSize - 4)
  }

  const entriesPerSector = sectorSize / 4
  const fat = new Uint32Array(Math.max(1, fatSectors.length * entriesPerSector))
  fatSectors.forEach((sector, index) => {
    if (!hasSector(sector)) return
    const base = sectorOffset(sector)
    for (let entry = 0; entry < entriesPerSector; entry++) {
      fat[index * entriesPerSector + entry] = readUint32(bytes, base + entry * 4)
    }
  })

  const readRegularChain = (startSector: number, size: number): Uint8Array => {
    const chunks: Uint8Array[] = []
    let sector = startSector
    let remaining = size
    let collected = 0
    let guard = 0
    while (remaining > 0 && hasSector(sector) && guard < MAX_CHAIN_LENGTH) {
      const base = sectorOffset(sector)
      const length = Math.min(sectorSize, remaining)
      chunks.push(bytes.subarray(base, base + length))
      remaining -= length
      collected += length
      sector = sector < fat.length ? fat[sector] : END_OF_CHAIN
      guard += 1
    }
    return concatChunks(chunks, collected)
  }

  const directory = readRegularChain(directoryStart, Number.POSITIVE_INFINITY)
  const entries: CompoundDirectoryEntry[] = []
  for (let offset = 0; offset + DIRECTORY_ENTRY_SIZE <= directory.length; offset += DIRECTORY_ENTRY_SIZE) {
    const type = directory[offset + 0x42]
    if (type !== 1 && type !== 2 && type !== 5) continue
    const nameLength = readUint16(directory, offset + 0x40)
    const nameByteLength = Math.max(0, Math.min(64, nameLength - 2))
    entries.push({
      name: nameByteLength > 0 ? decodeBytes(directory.subarray(offset, offset + nameByteLength), 'utf-16le') : '',
      type,
      startSector: readUint32(directory, offset + 0x74),
      size: readUint32(directory, offset + 0x78)
    })
  }

  const root = entries.find(entry => entry.type === 5)
  const miniStream = root && root.size > 0 ? readRegularChain(root.startSector, root.size) : new Uint8Array(0)
  const miniFat = miniFatCount > 0 ? readRegularChain(miniFatStart, miniFatCount * sectorSize) : new Uint8Array(0)

  const readMiniChain = (startSector: number, size: number): Uint8Array => {
    const chunks: Uint8Array[] = []
    let sector = startSector
    let remaining = size
    let collected = 0
    let guard = 0
    while (remaining > 0 && sector <= MAX_SECTOR && guard < MAX_CHAIN_LENGTH) {
      const offset = sector * miniSectorSize
      if (offset >= miniStream.length) break
      const length = Math.min(miniSectorSize, remaining, miniStream.length - offset)
      chunks.push(miniStream.subarray(offset, offset + length))
      remaining -= length
      collected += length
      sector = sector * 4 + 4 <= miniFat.length ? readUint32(miniFat, sector * 4) : END_OF_CHAIN
      guard += 1
    }
    return concatChunks(chunks, collected)
  }

  const streams = new Map<string, Uint8Array>()
  for (const entry of entries) {
    if (entry.type !== 2 || !entry.name) continue
    const data = entry.size === 0
      ? new Uint8Array(0)
      : entry.size < miniStreamCutoff && miniStream.length > 0
        ? readMiniChain(entry.startSector, entry.size)
        : readRegularChain(entry.startSector, entry.size)
    streams.set(entry.name, data)
  }
  return streams
}

/** Word 压缩分片使用文档代码页，按 FIB 里的语言 ID 判断即可覆盖常见语言。 */
function ansiEncodingForLanguage(languageId: number): string {
  const primary = languageId & 0x03ff
  if (primary === 0x04) {
    return languageId === 0x0404 || languageId === 0x0c04 || languageId === 0x1404 ? 'big5' : 'gb18030'
  }
  if (primary === 0x11) return 'shift_jis'
  if (primary === 0x12) return 'euc-kr'
  return 'windows-1252'
}

interface WordTextPiece {
  start: number
  end: number
  compressed: boolean
}

/** 解析 Clx 中的 Pcdt，得到每段正文在 WordDocument 流里的字节范围。 */
function readPieceTable(table: Uint8Array, clxOffset: number, clxLength: number): WordTextPiece[] {
  const limit = Math.min(table.length, clxOffset + clxLength)
  let index = clxOffset
  while (index < limit) {
    const marker = table[index]
    if (marker === 0x01) {
      // Prc：整段属性，跳过
      index += 3 + readUint16(table, index + 1)
      continue
    }
    if (marker !== 0x02) return []

    const plcLength = readUint32(table, index + 1)
    const plcOffset = index + 5
    const plcEnd = Math.min(limit, plcOffset + plcLength)
    const count = Math.floor((plcLength - 4) / 12)
    const pieces: WordTextPiece[] = []
    for (let piece = 0; piece < count; piece++) {
      const cpStart = readUint32(table, plcOffset + piece * 4)
      const cpEnd = readUint32(table, plcOffset + (piece + 1) * 4)
      const descriptorOffset = plcOffset + (count + 1) * 4 + piece * 8
      if (descriptorOffset + 8 > plcEnd) break
      const characters = cpEnd - cpStart
      if (characters <= 0) continue
      const raw = readUint32(table, descriptorOffset + 2)
      const compressed = (raw & 0x40000000) !== 0
      const fc = raw & 0x3fffffff
      pieces.push(compressed
        ? { start: Math.floor(fc / 2), end: Math.floor(fc / 2) + characters, compressed: true }
        : { start: fc, end: fc + characters * 2, compressed: false })
    }
    return pieces
  }
  return []
}

/** 没有分片表时按 fcMin…fcMac 读取；用零字节分布判断是否为 UTF-16LE 正文。 */
function decodeContinuousText(bytes: Uint8Array, encoding: string): string {
  const sampleLength = Math.min(bytes.length, 4096)
  let oddZeros = 0
  let evenZeros = 0
  for (let index = 0; index + 1 < sampleLength; index += 2) {
    if (bytes[index + 1] === 0) oddZeros += 1
    if (bytes[index] === 0) evenZeros += 1
  }
  const pairs = Math.max(1, Math.floor(sampleLength / 2))
  if (oddZeros / pairs > 0.5 && evenZeros / pairs < 0.1) return decodeBytes(bytes, 'utf-16le')
  return decodeBytes(bytes, encoding)
}

/** 把 Word 正文里的控制字符转换成换行 / 制表符，并丢弃域代码与图片占位符。 */
function cleanWordText(input: string): string {
  let output = ''
  let inFieldInstruction = false
  for (let index = 0; index < input.length; index++) {
    const code = input.charCodeAt(index)
    if (code === 0x13) {
      inFieldInstruction = true
      continue
    }
    if (code === 0x14 || code === 0x15) {
      inFieldInstruction = false
      continue
    }
    if (code === 0x0d || code === 0x0b || code === 0x0c || code === 0x0e) {
      output += '\n'
      continue
    }
    if (code === 0x07 || code === 0x09) {
      output += '\t'
      continue
    }
    if (code === 0x1e) {
      output += '-'
      continue
    }
    if (code === 0x1f || code === 0xa0) {
      if (code === 0xa0) output += ' '
      continue
    }
    if (code < 0x20) continue
    if (inFieldInstruction) continue
    output += input[index]
  }
  return output
}

/**
 * 从 .doc（Word 97-2003 二进制）文件字节里提取正文纯文本。
 * 解析失败时抛出带处理建议的错误，由调用方展示给用户。
 */
export function extractLegacyWordText(bytes: Uint8Array): string {
  const streams = readCompoundStreams(bytes)
  const wordDocument = streams.get('WordDocument')
  if (!wordDocument || wordDocument.length < 0x20) {
    throw new Error('这个 .doc 文件里没有 Word 正文数据，请用 Word / WPS 另存为 .docx 后重试。')
  }

  const identifier = readUint16(wordDocument, 0)
  if (identifier === WORD_IDENTIFIER_6) {
    throw new Error('这是 Word 6.0 / 95 格式的旧文档，请用 Word / WPS 另存为 .docx 后重试。')
  }
  if (identifier !== WORD_IDENTIFIER_8) {
    throw new Error('这个 .doc 文件的正文结构无法识别，请用 Word / WPS 另存为 .docx 后重试。')
  }

  const flags = readUint16(wordDocument, 0x0a)
  if (flags & FIB_FLAG_ENCRYPTED) {
    throw new Error('该 .doc 文档设置了密码保护，无法解析。请先取消密码保护，或另存为 .docx 后重试。')
  }

  const encoding = ansiEncodingForLanguage(readUint16(wordDocument, 0x06))
  const tableName = flags & FIB_FLAG_WHICH_TABLE ? '1Table' : '0Table'
  const table = streams.get(tableName) || streams.get(tableName === '1Table' ? '0Table' : '1Table')

  let pieces: WordTextPiece[] = []
  if (table && wordDocument.length >= FIB_OFFSET_LCB_CLX + 4) {
    const clxOffset = readUint32(wordDocument, FIB_OFFSET_FC_CLX)
    const clxLength = readUint32(wordDocument, FIB_OFFSET_LCB_CLX)
    if (clxOffset > 0 && clxLength > 0 && clxOffset + clxLength <= table.length) {
      pieces = readPieceTable(table, clxOffset, clxLength)
    }
  }

  let text = ''
  if (pieces.length > 0) {
    for (const piece of pieces) {
      const start = Math.max(0, Math.min(piece.start, wordDocument.length))
      const end = Math.max(start, Math.min(piece.end, wordDocument.length))
      if (end <= start) continue
      text += decodeBytes(wordDocument.subarray(start, end), piece.compressed ? encoding : 'utf-16le')
    }
  } else {
    const start = Math.min(readUint32(wordDocument, FIB_OFFSET_FC_MIN), wordDocument.length)
    const end = Math.min(Math.max(readUint32(wordDocument, FIB_OFFSET_FC_MAC), start), wordDocument.length)
    text = decodeContinuousText(wordDocument.subarray(start, end), encoding)
  }

  const cleaned = cleanWordText(text)
  if (!cleaned.trim()) {
    throw new Error('未能从这个 .doc 文件中提取到文字，可能是扫描件或受保护文档。')
  }
  return cleaned
}
