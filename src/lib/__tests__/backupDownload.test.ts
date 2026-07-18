/** @jest-environment jsdom */

import { TextDecoder, TextEncoder } from 'util'
import { downloadDataBackup, previewImportBackupFiles } from '../store'

Object.defineProperty(global, 'TextEncoder', { configurable: true, value: TextEncoder })
Object.defineProperty(global, 'TextDecoder', { configurable: true, value: TextDecoder })

describe('downloadDataBackup', () => {
  const anchorClick = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

  beforeEach(() => {
    anchorClick.mockClear()
    Object.defineProperty(window, 'showSaveFilePicker', {
      configurable: true,
      writable: true,
      value: undefined
    })
    Object.defineProperty(window, 'showDirectoryPicker', {
      configurable: true,
      writable: true,
      value: undefined
    })
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      writable: true,
      value: jest.fn(() => 'blob:backup')
    })
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      writable: true,
      value: jest.fn()
    })
  })

  afterAll(() => {
    anchorClick.mockRestore()
  })

  it('reports saved only after the system file writer completes', async () => {
    const write = jest.fn().mockResolvedValue(undefined)
    const close = jest.fn().mockResolvedValue(undefined)
    const showSaveFilePicker = jest.fn().mockResolvedValue({
      createWritable: jest.fn().mockResolvedValue({ write, close })
    })
    Object.defineProperty(window, 'showSaveFilePicker', {
      configurable: true,
      writable: true,
      value: showSaveFilePicker
    })

    await expect(downloadDataBackup()).resolves.toEqual({
      status: 'saved',
      fileCount: 1,
      format: 'json'
    })

    expect(write).toHaveBeenCalledWith(expect.any(Blob))
    expect(close).toHaveBeenCalledTimes(1)
    expect(anchorClick).not.toHaveBeenCalled()
  })

  it('requires user confirmation when the browser only starts a download', async () => {
    await expect(downloadDataBackup()).resolves.toEqual({
      status: 'download-started',
      fileCount: 1,
      format: 'json'
    })
    expect(anchorClick).toHaveBeenCalledTimes(1)
  })

  it('rejects a single-file threshold that the importer cannot accept', async () => {
    await expect(downloadDataBackup({
      singleFileLimitBytes: Number.MAX_SAFE_INTEGER
    })).rejects.toThrow('备份分卷参数无效')
  })

  it('writes oversized backups as importable parts', async () => {
    const savedParts: Array<{ name: string; blob: Blob }> = []
    const getFileHandle = jest.fn(async (name: string) => ({
      createWritable: jest.fn(async () => ({
        write: jest.fn(async (blob: Blob) => {
          savedParts.push({ name, blob })
        }),
        close: jest.fn(async () => undefined)
      }))
    }))
    Object.defineProperty(window, 'showDirectoryPicker', {
      configurable: true,
      writable: true,
      value: jest.fn().mockResolvedValue({ getFileHandle })
    })

    const result = await downloadDataBackup({
      singleFileLimitBytes: 1,
      partPayloadBytes: 64
    })

    expect(result.status).toBe('saved')
    expect(result.format).toBe('multipart')
    expect(result.fileCount).toBeGreaterThan(1)
    expect(savedParts).toHaveLength(result.fileCount)
    expect(savedParts.every(part => part.name.endsWith('.feynman-part'))).toBe(true)

    const files = savedParts
      .map(part => new File([part.blob], part.name, { type: part.blob.type }))
      .reverse()
    const preview = await previewImportBackupFiles(files)

    expect(preview.valid).toBe(true)
    expect(preview.data).toMatchObject({
      version: 5,
      books: [],
      aiUsageRecords: [],
      bookLists: [],
      bookRelations: []
    })

    const incomplete = await previewImportBackupFiles(files.slice(1))
    expect(incomplete).toMatchObject({ valid: false })
    expect(incomplete.error).toContain('分卷不完整')
  })
})
