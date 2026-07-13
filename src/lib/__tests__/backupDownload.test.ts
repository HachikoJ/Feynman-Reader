/** @jest-environment jsdom */

import { downloadDataBackup } from '../store'

describe('downloadDataBackup', () => {
  const anchorClick = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

  beforeEach(() => {
    anchorClick.mockClear()
    Object.defineProperty(window, 'showSaveFilePicker', {
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

    await expect(downloadDataBackup()).resolves.toBe('saved')

    expect(write).toHaveBeenCalledWith(expect.any(Blob))
    expect(close).toHaveBeenCalledTimes(1)
    expect(anchorClick).not.toHaveBeenCalled()
  })

  it('requires user confirmation when the browser only starts a download', async () => {
    await expect(downloadDataBackup()).resolves.toBe('download-started')
    expect(anchorClick).toHaveBeenCalledTimes(1)
  })
})
