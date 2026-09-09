/** @jest-environment node */

jest.mock('../accountClient', () => ({ isLocalAuthBypassEnabled: () => false }))

import {
  initializeStore, resetStoreCache, getBook, getBooks, updateBook, deleteBook,
  flushPendingStoreWrites, reloadBookFromPersistence, reloadBooksFromPersistence,
  reloadBookOrganizationFromPersistence, getBookLists, getBookRelations,
  updateBookList, deleteBookList, deleteBookRelation, setBookListMembership,
  addAIUsageRecord, type Book,
} from '../store'

const book = (id: string): Book => ({
  id, name: id, author: 'Author', cover: 'https://example.test/old.png', description: 'Description',
  tags: [{ category: 'Topic', name: 'Novel' }], status: 'reading', currentPhase: 1,
  bestScore: 0, responses: { background: 'Saved analysis' }, noteRecords: [],
  practiceRecords: [], qaPracticeRecords: [], createdAt: 1, updatedAt: 2,
})
const snapshot = (books: Book[]) => ({
  version: 5, exportDate: 3, settings: {}, books, aiUsageRecords: [],
  bookLists: [{ id: 'list-1', name: 'List', description: 'Keep me', bookIds: ['book-1'], createdAt: 1, updatedAt: 2 }],
  bookRelations: [{ id: 'relation-1', fromBookId: 'book-1', toBookId: 'book-2', type: 'series', createdAt: 1 }],
})
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}

describe('cloud persistence round trips', () => {
  const environment = process.env.NODE_ENV
  const originalFetch = global.fetch
  let remote: ReturnType<typeof snapshot>
  let requests: { url: string; method: string; body?: Record<string, unknown> }[]
  let handle: (url: string, init?: RequestInit) => Promise<Response>

  beforeEach(async () => {
    Object.defineProperty(process.env, 'NODE_ENV', { value: 'production', configurable: true, writable: true })
    Object.defineProperty(global, 'window', { value: {}, configurable: true })
    resetStoreCache()
    remote = snapshot([book('book-1'), book('book-2')])
    requests = []
    handle = async (url, init) => {
      const method = init?.method || 'GET'
      const body = init?.body ? JSON.parse(String(init.body)) : undefined
      requests.push({ url, method, body })
      if (url.includes('api-key')) return Response.json({ configured: false })
      if (url.includes('/account/data/')) return Response.json(remote)
      if (url === '/api/account/books/' && method === 'PUT') {
        const incoming = body.book as Book
        const written = incoming._summaryOnly
          ? { name: incoming.name, author: incoming.author, cover: incoming.cover, description: incoming.description, tags: incoming.tags, updatedAt: incoming.updatedAt }
          : incoming
        remote.books = remote.books.map(saved => saved.id === incoming.id ? { ...saved, ...written } : saved)
        return Response.json({ ok: true })
      }
      if (url.includes('/account/books/') && method === 'GET') {
        return Response.json({ book: remote.books.find(saved => url.includes(`/${saved.id}/`)) })
      }
      if (url.includes('/book-organization/')) {
        if (body.kind === 'list') remote.bookLists = method === 'DELETE'
          ? remote.bookLists.filter(saved => saved.id !== body.id)
          : remote.bookLists.map(saved => saved.id === body.record.id ? body.record : saved)
        else remote.bookRelations = remote.bookRelations.filter(saved => saved.id !== body.id)
      }
      return Response.json({ ok: true })
    }
    global.fetch = jest.fn((input, init) => handle(String(input), init))
    await initializeStore({ authenticated: true })
    requests = []
  })

  afterEach(async () => {
    await flushPendingStoreWrites().catch(() => undefined)
    resetStoreCache()
    Object.defineProperty(process.env, 'NODE_ENV', { value: environment, configurable: true, writable: true })
    global.fetch = originalFetch
    Reflect.deleteProperty(global, 'window')
  })

  it('persists replacement and explicit clearing across detail and bookshelf reloads', async () => {
    updateBook('book-1', { cover: 'data:image/png;base64,YQ==' })
    await flushPendingStoreWrites()
    expect((await reloadBookFromPersistence('book-1'))?.cover).toBe('data:image/png;base64,YQ==')
    updateBook('book-1', { cover: undefined, author: undefined, description: undefined, tags: undefined })
    await reloadBooksFromPersistence()
    expect(getBook('book-1')).toMatchObject({ cover: '', author: '', description: '', tags: [], responses: book('book-1').responses })
    expect(remote.books[0]).toMatchObject({ cover: '', author: '', description: '', tags: [] })
    expect(requests.some(request => request.url.includes('/import/'))).toBe(false)
  })

  it('preserves omitted metadata and makes timestamps advance even when the local clock is behind', async () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(1)
    updateBook('book-1', { name: 'Renamed' })
    now.mockRestore()
    await flushPendingStoreWrites()
    expect(remote.books[0]).toMatchObject({ name: 'Renamed', updatedAt: 3, cover: book('book-1').cover, author: 'Author' })
  })

  it('uses metadata-only writes even after full details were loaded, retaining newer server analysis', async () => {
    await reloadBookFromPersistence('book-1')
    remote.books[0].responses = { background: 'Newer analysis from another tab' }
    updateBook('book-1', { cover: '' })
    await flushPendingStoreWrites()
    expect(requests.find(request => request.method === 'PUT')?.body?.book).toMatchObject({ _summaryOnly: true, cover: '' })
    expect(remote.books[0].responses.background).toBe('Newer analysis from another tab')
    expect((await reloadBookFromPersistence('book-1'))?.responses.background).toBe('Newer analysis from another tab')
  })

  it('waits for queued saves before requesting a bookshelf reload', async () => {
    const gate = deferred<Response>()
    const originalHandle = handle
    handle = async (url, init) => init?.method === 'PUT' ? gate.promise : originalHandle(url, init)
    updateBook('book-1', { cover: '' })
    const reloading = reloadBooksFromPersistence()
    await Promise.resolve()
    expect(requests).toHaveLength(0)
    remote.books[0].cover = ''
    gate.resolve(Response.json({ ok: true }))
    await reloading
    expect(getBook('book-1')?.cover).toBe('')
  })

  it.each(['detail', 'bookshelf', 'delete'] as const)('does not let a delayed %s response replace later local changes', async mode => {
    const gate = deferred<Response>()
    const started = deferred<void>()
    const old = JSON.parse(JSON.stringify(remote))
    const originalHandle = handle
    handle = async (url, init) => {
      if (!init?.method) { started.resolve(); return gate.promise }
      return originalHandle(url, init)
    }
    const reloading = mode === 'bookshelf' ? reloadBooksFromPersistence() : reloadBookFromPersistence('book-1')
    await started.promise
    if (mode === 'delete') deleteBook('book-1')
    else updateBook('book-1', { cover: 'https://example.test/new.png' })
    gate.resolve(Response.json(mode === 'bookshelf' ? old : { book: old.books[0] }))
    await reloading
    expect(getBook('book-1')?.cover).toBe(mode === 'delete' ? undefined : 'https://example.test/new.png')
  })

  it('reloads authoritative data after a failed optimistic write and reports the failure despite another successful save', async () => {
    const originalHandle = handle
    handle = async (url, init) => {
      if (init?.method === 'PUT' && JSON.parse(String(init.body)).book?.id === 'book-1') {
        return Response.json({ error: 'Write conflict' }, { status: 409 })
      }
      return originalHandle(url, init)
    }
    updateBook('book-1', { cover: '' })
    updateBook('book-2', { name: 'Success' })
    await expect(flushPendingStoreWrites()).rejects.toThrow('Write conflict')
    await reloadBookFromPersistence('book-1')
    expect(getBook('book-1')?.cover).toBe(book('book-1').cover)
    expect(getBooks().find(saved => saved.id === 'book-2')?.name).toBe('Success')
  })

  it('persists organization removals using only the affected records', async () => {
    updateBookList('list-1', { name: 'Renamed' })
    expect(getBookLists()[0].description).toBe('Keep me')
    setBookListMembership('list-1', 'book-1', false)
    await reloadBookOrganizationFromPersistence()
    expect(getBookLists()[0].bookIds).toEqual([])
    deleteBookList('list-1')
    deleteBookRelation('relation-1')
    await reloadBookOrganizationFromPersistence()
    expect(getBookLists()).toEqual([])
    expect(getBookRelations()).toEqual([])
    expect(requests.filter(request => request.method !== 'GET').every(request => request.url === '/api/account/book-organization/')).toBe(true)
    expect(requests.filter(request => request.method === 'DELETE').map(request => request.body)).toEqual([
      { kind: 'list', id: 'list-1' }, { kind: 'relation', id: 'relation-1' },
    ])
  })

  it('appends AI usage without sending cached books, settings, or organization', async () => {
    const record = addAIUsageRecord({ task: 'analysis', model: 'test', promptTokens: 1, completionTokens: 2, totalTokens: 3, createdAt: 3, bookId: 'book-1' })
    await flushPendingStoreWrites()
    expect(requests).toEqual([{ url: '/api/account/ai-usage/', method: 'POST', body: { record } }])
  })
})
