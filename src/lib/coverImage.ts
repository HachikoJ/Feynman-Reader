'use client'

import { getSafeImageSrc } from './safeUrl'

export const MAX_COVER_DATA_URL_LENGTH = 5_000_000

export function isAcceptableCoverDataUrl(value: unknown): value is string {
  return typeof value === 'string' &&
    value.startsWith('data:image/') &&
    value.length <= MAX_COVER_DATA_URL_LENGTH &&
    Boolean(getSafeImageSrc(value))
}

/**
 * 读取封面图片为 data URL。返回 null 表示读取失败或图片不可用。
 * 调用方需自行取消（组件卸载时通过 AbortSignal 传入）。
 */
export function readCoverFile(file: File, signal?: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    if (typeof FileReader === 'undefined') {
      reject(new Error('COVER_READER_UNAVAILABLE'))
      return
    }
    const reader = new FileReader()
    const abort = () => {
      try {
        reader.abort()
      } catch {
        // 已经结束的读取无法中止，忽略即可。
      }
    }
    if (signal?.aborted) {
      reject(new Error('COVER_READ_ABORTED'))
      return
    }
    signal?.addEventListener('abort', abort, { once: true })
    const cleanup = () => signal?.removeEventListener('abort', abort)
    reader.onload = () => {
      cleanup()
      const result = reader.result
      if (!isAcceptableCoverDataUrl(result)) {
        reject(new Error('COVER_READ_INVALID'))
        return
      }
      resolve(result)
    }
    reader.onerror = () => {
      cleanup()
      reject(new Error('COVER_READ_FAILED'))
    }
    reader.onabort = () => {
      cleanup()
      reject(new Error('COVER_READ_ABORTED'))
    }
    try {
      reader.readAsDataURL(file)
    } catch {
      cleanup()
      reject(new Error('COVER_READ_FAILED'))
    }
  })
}

export function coverReadErrorMessage(error: unknown, lang: 'zh' | 'en'): string {
  if (error instanceof Error && error.message === 'COVER_READ_INVALID') {
    return lang === 'zh'
      ? '封面图片过大或格式不受支持，请选择 5MB 以内的 PNG、JPEG、WebP、GIF 图片。'
      : 'The cover is too large or unsupported. Choose a PNG, JPEG, WebP, or GIF under 5 MB.'
  }
  return lang === 'zh'
    ? '封面图片读取失败，请重新选择图片。'
    : 'Could not read the cover image. Select the image again.'
}
