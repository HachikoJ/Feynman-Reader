import type { Book } from './store'
import sampleBookData from './sampleBookData.json'

export const SAMPLE_BOOK_ID = 'sample-the-kite-runner'
export const SAMPLE_BOOK_DATA_VERSION = 3
export const SAMPLE_BOOK_SEEDED_KEY = 'feynman-sample-book-seeded-v3'

/** Human-reviewed sample record imported from the author's local library. */
export function createSampleBook(): Book {
  return {
    ...(structuredClone(sampleBookData) as unknown as Book),
    id: SAMPLE_BOOK_ID,
    cover: '/kite-runner-cover.png',
    isSample: true,
    sampleDataVersion: SAMPLE_BOOK_DATA_VERSION
  }
}
