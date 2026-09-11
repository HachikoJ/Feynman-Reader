// 测试夹具：手工构造最小的 OLE 复合文档与 Word 97-2003 分片表，
// 覆盖真实 .doc 文件里无法稳定复现的分支（压缩分片、代码页、异常头信息）。

const SECTOR_SIZE = 512
const END_OF_CHAIN = 0xfffffffe
const FREE_SECTOR = 0xffffffff
const FAT_SECTOR = 0xfffffffd
const MINI_STREAM_CUTOFF = 4096

const FIB_OFFSET_FC_CLX = 0x01a2
const FIB_OFFSET_LCB_CLX = 0x01a6
const FIB_OFFSET_FC_MIN = 0x0018
const FIB_OFFSET_FC_MAC = 0x001c
const FIB_FLAG_ENCRYPTED = 0x0100
const FIB_FLAG_WHICH_TABLE = 0x0200
const WORD_IDENTIFIER_8 = 0xa5ec

/** 正文在 WordDocument 流里的起始位置（位于 fibRgFcLcb 之后）。 */
const TEXT_OFFSET = 0x600

export interface FixturePiece {
  /** 压缩分片填单字节代码页编码的字节；非压缩分片填 UTF-16LE 字节。 */
  raw: Uint8Array
  /** 该分片的字符数，写入 CP 表。 */
  characters: number
  compressed: boolean
}

export interface LegacyWordFixtureOptions {
  pieces: FixturePiece[]
  /** FIB 里的语言 ID，决定压缩分片使用哪个代码页。 */
  languageId?: number
  /** 是否把正文表放在 1Table 流（默认 true）。 */
  useOneTable?: boolean
  /** 标记为加密文档。 */
  encrypted?: boolean
  /** 覆盖 wIdent，用来模拟 Word 6 / 95 文档。 */
  identifier?: number
  /** 故意不写分片表，用来覆盖 fcMin…fcMac 回退路径。 */
  withoutPieceTable?: boolean
}

/** ASCII / Latin-1 文本按单字节写入。 */
export function latin1Bytes(text: string): Uint8Array {
  return Uint8Array.from(Buffer.from(text, 'latin1'))
}

export function utf16leBytes(text: string): Uint8Array {
  return Uint8Array.from(Buffer.from(text, 'utf16le'))
}

function writeUint16(target: Uint8Array, offset: number, value: number): void {
  target[offset] = value & 0xff
  target[offset + 1] = (value >>> 8) & 0xff
}

function writeUint32(target: Uint8Array, offset: number, value: number): void {
  target[offset] = value & 0xff
  target[offset + 1] = (value >>> 8) & 0xff
  target[offset + 2] = (value >>> 16) & 0xff
  target[offset + 3] = (value >>> 24) & 0xff
}

function buildCompoundDocument(streams: { name: string; data: Uint8Array }[]): Uint8Array {
  const sectorCounts = streams.map(stream => Math.ceil(stream.data.length / SECTOR_SIZE))
  const totalSectors = 2 + sectorCounts.reduce((sum, count) => sum + count, 0)
  if (totalSectors > 128) throw new Error('测试夹具超出单个 FAT 扇区的容量')

  const file = new Uint8Array((totalSectors + 1) * SECTOR_SIZE)
  const sectorOffset = (sector: number) => (sector + 1) * SECTOR_SIZE

  // 扇区 0 是 FAT，扇区 1 是目录，之后依次排列各条流。
  const fat = new Uint32Array(128).fill(FREE_SECTOR)
  fat[0] = FAT_SECTOR
  fat[1] = END_OF_CHAIN
  let cursor = 2
  const placements = streams.map((stream, index) => {
    const start = cursor
    const count = sectorCounts[index]
    for (let step = 0; step < count; step++) {
      fat[start + step] = step === count - 1 ? END_OF_CHAIN : start + step + 1
    }
    cursor += count
    return { start, count }
  })
  for (let entry = 0; entry < fat.length; entry++) {
    writeUint32(file, sectorOffset(0) + entry * 4, fat[entry])
  }

  file.set([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1], 0)
  writeUint16(file, 0x18, 0x003e)
  writeUint16(file, 0x1a, 0x0003)
  writeUint16(file, 0x1c, 0xfffe)
  writeUint16(file, 0x1e, 9) // 扇区 512 字节
  writeUint16(file, 0x20, 6) // 迷你扇区 64 字节
  writeUint32(file, 0x2c, 1) // FAT 扇区数
  writeUint32(file, 0x30, 1) // 目录起始扇区
  writeUint32(file, 0x38, MINI_STREAM_CUTOFF)
  writeUint32(file, 0x3c, END_OF_CHAIN) // 不使用迷你 FAT
  writeUint32(file, 0x40, 0)
  writeUint32(file, 0x44, END_OF_CHAIN)
  writeUint32(file, 0x48, 0)
  writeUint32(file, 0x4c, 0) // DIFAT[0] 指向 FAT 扇区
  for (let entry = 1; entry < 109; entry++) writeUint32(file, 0x4c + entry * 4, FREE_SECTOR)

  const directoryOffset = sectorOffset(1)
  const writeDirectoryEntry = (
    index: number,
    name: string,
    type: number,
    startSector: number,
    size: number
  ) => {
    const base = directoryOffset + index * 128
    for (let position = 0; position < name.length && position < 31; position++) {
      writeUint16(file, base + position * 2, name.charCodeAt(position))
    }
    writeUint16(file, base + 0x40, (name.length + 1) * 2)
    file[base + 0x42] = type
    file[base + 0x43] = 1
    writeUint32(file, base + 0x44, 0xffffffff)
    writeUint32(file, base + 0x48, 0xffffffff)
    writeUint32(file, base + 0x4c, 0xffffffff)
    writeUint32(file, base + 0x74, startSector)
    writeUint32(file, base + 0x78, size)
  }

  writeDirectoryEntry(0, 'Root Entry', 5, END_OF_CHAIN, 0)
  streams.forEach((stream, index) => {
    writeDirectoryEntry(index + 1, stream.name, 2, placements[index].start, stream.data.length)
    file.set(stream.data, sectorOffset(placements[index].start))
  })

  return file
}

export function buildLegacyWordDoc(options: LegacyWordFixtureOptions): Uint8Array {
  const wordDocument = new Uint8Array(4096)
  const table = new Uint8Array(4096)
  const useOneTable = options.useOneTable !== false

  const cp = [0]
  const pieces: { fc: number }[] = []
  let cursor = TEXT_OFFSET
  for (const piece of options.pieces) {
    if (cursor % 2 !== 0) cursor += 1
    wordDocument.set(piece.raw, cursor)
    pieces.push({ fc: piece.compressed ? (cursor * 2) | 0x40000000 : cursor })
    cursor += piece.raw.length
    cp.push(cp[cp.length - 1] + piece.characters)
  }

  const clxOffset = 0x40
  let clxLength = 0
  if (!options.withoutPieceTable && pieces.length > 0) {
    const plcLength = 4 + 12 * pieces.length
    table[clxOffset] = 0x02
    writeUint32(table, clxOffset + 1, plcLength)
    const cpOffset = clxOffset + 5
    cp.forEach((value, index) => writeUint32(table, cpOffset + index * 4, value))
    const pcdOffset = cpOffset + (pieces.length + 1) * 4
    pieces.forEach((piece, index) => writeUint32(table, pcdOffset + index * 8 + 2, piece.fc))
    clxLength = 5 + plcLength
  }

  writeUint16(wordDocument, 0, options.identifier ?? WORD_IDENTIFIER_8)
  writeUint16(wordDocument, 2, 0x00c1)
  writeUint16(wordDocument, 6, options.languageId ?? 0x0804)
  let flags = useOneTable ? FIB_FLAG_WHICH_TABLE : 0
  if (options.encrypted) flags |= FIB_FLAG_ENCRYPTED
  writeUint16(wordDocument, 0x0a, flags)
  writeUint32(wordDocument, FIB_OFFSET_FC_MIN, TEXT_OFFSET)
  writeUint32(wordDocument, FIB_OFFSET_FC_MAC, cursor)
  writeUint32(wordDocument, FIB_OFFSET_FC_CLX, clxLength > 0 ? clxOffset : 0)
  writeUint32(wordDocument, FIB_OFFSET_LCB_CLX, clxLength)

  return buildCompoundDocument([
    { name: 'WordDocument', data: wordDocument },
    { name: useOneTable ? '1Table' : '0Table', data: table }
  ])
}
