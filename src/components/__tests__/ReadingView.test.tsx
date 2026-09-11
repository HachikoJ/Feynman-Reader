/** @jest-environment jsdom */

import 'openai/shims/node'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import ReadingView from '../ReadingView'
import { Book } from '@/lib/store'
import * as store from '@/lib/store'
import * as deepseek from '@/lib/deepseek'

jest.mock('@/lib/deepseek', () => ({ __esModule: true, ...jest.requireActual('@/lib/deepseek') }))
jest.mock('@/lib/store', () => ({ __esModule: true, ...jest.requireActual('@/lib/store') }))

const book: Book = {
  id: 'book-1',
  name: '测试书籍',
  status: 'unread',
  currentPhase: 0,
  noteRecords: [],
  responses: {},
  practiceRecords: [],
  qaPracticeRecords: [],
  bestScore: 0,
  createdAt: 1,
  updatedAt: 1
}

describe('ReadingView practice submission feedback', () => {
  const teaching = '用自己的话解释核心观点，并用生活中的例子检验理解。'.repeat(12)
  const evaluation = JSON.stringify({
    scores: { accuracy: 72, completeness: 70, clarity: 76, overall: 73 },
    review: '核心观点准确，建议增加一个反例说明适用边界。',
  })
  let latestBook: Book

  beforeEach(() => {
    latestBook = { ...book, practiceRecords: [] }
    window.scrollTo = jest.fn()
    HTMLElement.prototype.scrollIntoView = jest.fn()
    jest.spyOn(deepseek, 'createDeepSeekClient').mockResolvedValue({} as Awaited<ReturnType<typeof deepseek.createDeepSeekClient>>)
    jest.spyOn(deepseek, 'chatJson').mockResolvedValue(evaluation)
    jest.spyOn(store, 'flushPendingStoreWrites').mockResolvedValue()
    jest.spyOn(store, 'getBook').mockImplementation(() => latestBook)
    jest.spyOn(store, 'reloadBookFromPersistence').mockResolvedValue(book)
    jest.spyOn(store, 'addPracticeRecord').mockImplementation((bookId, record) => {
      const saved = { ...record, bookId, id: 'saved-practice', createdAt: Date.now() }
      latestBook = { ...latestBook, practiceRecords: [saved] }
      return saved
    })
  })

  afterEach(() => jest.restoreAllMocks())

  async function openPractice() {
    render(<ReadingView book={book} apiKey="server-managed" lang="zh" onBack={jest.fn()} onOpenSettings={jest.fn()} />)
    await act(async () => { await Promise.resolve() })
    fireEvent.click(screen.getByTestId('reading-tab-practice'))
    const input = screen.getByRole('textbox') as HTMLTextAreaElement
    fireEvent.change(input, { target: { value: teaching } })
    return input
  }

  it('keeps the input visible while evaluating and shows the review before saving completes', async () => {
    let finishEvaluation!: (result: string) => void
    let finishSave!: () => void
    jest.mocked(deepseek.chatJson).mockReturnValue(new Promise(resolve => { finishEvaluation = resolve }))
    jest.mocked(store.flushPendingStoreWrites).mockReturnValue(new Promise(resolve => { finishSave = resolve }))
    const input = await openPractice()
    fireEvent.click(screen.getByRole('button', { name: '提交评估' }))
    expect(screen.getByText('正在评估教学内容，请稍候…')).toBeVisible()
    expect(input).toBeVisible()
    expect(input).toHaveValue(teaching)
    expect(input.readOnly).toBe(true)
    expect(screen.getByRole('button', { name: '处理中…' })).toBeDisabled()
    await act(async () => { finishEvaluation(evaluation) })
    expect(screen.getByRole('region', { name: '本次评估结果' })).toHaveTextContent('核心观点准确')
    expect(screen.getByText('评估已完成，正在保存实践记录…')).toBeVisible()
    await act(async () => { finishSave() })
    expect(screen.getByText('评估完成，已保存到实践记录。')).toBeVisible()
    expect(screen.getByText('核心观点准确，建议增加一个反例说明适用边界。').closest('details')).toHaveAttribute('open')
    expect(input).toHaveValue('')
  })

  it('retains the evaluation and input when persistence fails', async () => {
    jest.mocked(store.flushPendingStoreWrites).mockRejectedValue(new Error('Cloud unavailable'))
    const input = await openPractice()
    fireEvent.click(screen.getByRole('button', { name: '提交评估' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('保存记录失败')
    expect(screen.getByRole('region', { name: '本次评估结果' })).toHaveTextContent('核心观点准确')
    expect(input).toHaveValue(teaching)
    expect(screen.getByRole('button', { name: '提交评估' })).toBeEnabled()
    expect(screen.queryByText('评估完成，已保存到实践记录。')).not.toBeInTheDocument()
  })

  it.each([
    ['request failure', () => jest.mocked(deepseek.chatJson).mockRejectedValue(new Error('Network unavailable'))],
    ['invalid evaluation', () => jest.mocked(deepseek.chatJson).mockResolvedValue('{}')],
  ])('shows an error and preserves the input for %s', async (_name, setup) => {
    setup()
    const input = await openPractice()
    fireEvent.click(screen.getByRole('button', { name: '提交评估' }))
    expect(await screen.findByRole('alert')).toBeVisible()
    expect(input).toHaveValue(teaching)
    expect(store.addPracticeRecord).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: '提交评估' })).toBeEnabled()
  })

  it('does not silently clear the input when the saved book is missing from the cache', async () => {
    jest.mocked(store.getBook).mockReturnValue(undefined)
    const input = await openPractice()
    fireEvent.click(screen.getByRole('button', { name: '提交评估' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('保存记录失败')
    expect(input).toHaveValue(teaching)
    expect(screen.getByRole('region', { name: '本次评估结果' })).toHaveTextContent('核心观点准确')
  })
})

describe('ReadingView API key guidance', () => {
  beforeEach(() => {
    window.localStorage.clear()
    Object.defineProperty(window, 'scrollTo', { value: jest.fn(), writable: true })
    HTMLElement.prototype.scrollIntoView = jest.fn()
  })

  it('routes missing API key users directly to TokenDance setup without a failed analysis state', () => {
    const onOpenSettings = jest.fn()
    render(
      <ReadingView
        book={book}
        apiKey=""
        lang="zh"
        onBack={jest.fn()}
        onOpenSettings={onOpenSettings}
      />
    )

    const analyzeButton = screen.getByRole('button', { name: /配置 TokenDance，开始分析/ })
    expect((analyzeButton as HTMLButtonElement).disabled).toBe(false)
    expect(screen.queryByRole('alert')).toBeNull()

    fireEvent.click(analyzeButton)

    expect(onOpenSettings).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('routes users with a key but missing consent directly to settings', async () => {
    const onOpenSettings = jest.fn()
    render(
      <ReadingView
        book={book}
        apiKey="sk-test"
        lang="zh"
        onBack={jest.fn()}
        onOpenSettings={onOpenSettings}
      />
    )

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    fireEvent.click(screen.getByRole('button', { name: /配置 TokenDance，开始分析/ }))

    expect(onOpenSettings).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('ReadingView navigation position', () => {
  const sampleBook: Book = {
    ...book,
    id: 'sample-book',
    status: 'finished',
    currentPhase: 6,
    isSample: true,
    responses: {
      background: '## 第一阶段内容\n\n背景内容\n\n## 作者生平\n\n作者信息',
      overview: '## 第二阶段内容\n\n概览内容',
      deepDive: '## 第三阶段内容\n\n拆解内容',
      critical: '## 第四阶段内容\n\n批判内容',
      reception: '## 第五阶段内容\n\n评价内容',
      synthesis: '## 第六阶段内容\n\n总结内容'
    }
  }

  beforeEach(() => {
    window.localStorage.clear()
    Object.defineProperty(window, 'scrollTo', { value: jest.fn(), writable: true })
    HTMLElement.prototype.scrollIntoView = jest.fn()
  })

  it('lets sample users continue to the next phase and moves to its content top', async () => {
    render(
      <ReadingView
        book={sampleBook}
        apiKey=""
        lang="zh"
        onBack={jest.fn()}
        onOpenSettings={jest.fn()}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: '下一阶段：全书概览' }))

    expect(await screen.findByRole('heading', { name: '全书概览' })).toBeInTheDocument()
    await waitFor(() => expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'start'
    }))
  })

  it('continues from the final sample phase to the top of Feynman Practice', async () => {
    render(
      <ReadingView
        book={sampleBook}
        apiKey=""
        lang="zh"
        onBack={jest.fn()}
        onOpenSettings={jest.fn()}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: '第 6 阶段：融会贯通' }))
    fireEvent.click(await screen.findByRole('button', { name: '进入费曼实践' }))

    expect((await screen.findAllByRole('heading', { name: '教学模拟' })).length).toBeGreaterThan(0)
    await waitFor(() => expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalled())
  })

  it('moves back to the reading workspace top when switching main tabs', async () => {
    render(
      <ReadingView
        book={sampleBook}
        apiKey=""
        lang="zh"
        onBack={jest.fn()}
        onOpenSettings={jest.fn()}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: '我的笔记' }))

    expect(await screen.findByRole('heading', { name: '阅读笔记' })).toBeInTheDocument()
    await waitFor(() => expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'start'
    }))
  })

  it('keeps every mobile main-tab label on one line', () => {
    render(
      <ReadingView
        book={sampleBook}
        apiKey=""
        lang="zh"
        onBack={jest.fn()}
        onOpenSettings={jest.fn()}
      />
    )

    for (const tab of ['phase', 'practice', 'notes', 'recommendations']) {
      const button = screen.getByTestId(`reading-tab-${tab}`)
      expect(button.querySelector('.sm\\:hidden')).toHaveClass('whitespace-nowrap')
    }
  })

  it('returns to learning progress when expanding all phase sections', async () => {
    render(
      <ReadingView
        book={sampleBook}
        apiKey=""
        lang="zh"
        onBack={jest.fn()}
        onOpenSettings={jest.fn()}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: '展开全部' }))

    await waitFor(() => expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'start'
    }))
  })
})

describe('ReadingView assistant source targets', () => {
  const sourceBook: Book = {
    ...book,
    status: 'finished',
    currentPhase: 6,
    responses: {
      background: '背景阶段内容',
      overview: '概览阶段内容'
    },
    noteRecords: [{
      id: 'note-target',
      type: 'note',
      content: '需要定位的读书笔记',
      createdAt: 2
    }],
    practiceRecords: [{
      id: 'practice-target',
      bookId: 'book-1',
      content: '需要定位的费曼实践',
      aiReview: '需要定位的实践点评',
      scores: { accuracy: 80, completeness: 80, clarity: 80, overall: 80 },
      passed: true,
      createdAt: 3
    }],
    qaPracticeRecords: [{
      id: 'qa-target',
      bookId: 'book-1',
      questions: [
        {
          persona: 'elementary',
          personaName: '小学生',
          question: '第一个角色问题',
          userAnswer: '第一条回答',
          aiReview: '第一条点评',
          score: 70,
          passed: true,
          answeredAt: 4,
          reviewedAt: 4
        },
        {
          persona: 'professional',
          personaName: '专业人士',
          question: '需要定位的角色问题',
          userAnswer: '第二条回答',
          aiReview: '第二条点评',
          score: 70,
          passed: true,
          answeredAt: 5,
          reviewedAt: 5
        }
      ],
      allPassed: true,
      createdAt: 4,
      updatedAt: 5
    }]
  }

  beforeEach(() => {
    window.localStorage.clear()
    Object.defineProperty(window, 'scrollTo', { value: jest.fn(), writable: true })
    HTMLElement.prototype.scrollIntoView = jest.fn()
    jest.spyOn(store, 'getBook').mockImplementation(() => sourceBook)
    jest.spyOn(store, 'getQAPracticeRecords').mockReturnValue(sourceBook.qaPracticeRecords || [])
  })

  afterEach(() => jest.restoreAllMocks())

  function renderWithSource(sourceTarget: NonNullable<React.ComponentProps<typeof ReadingView>['sourceTarget']>) {
    return render(
      <ReadingView
        book={sourceBook}
        apiKey=""
        lang="zh"
        sourceTarget={sourceTarget}
        onBack={jest.fn()}
        onOpenSettings={jest.fn()}
      />
    )
  }

  it('opens the notes tab and highlights the referenced note', async () => {
    renderWithSource({ kind: 'note', bookId: 'book-1', recordId: 'note-target' })

    const note = await screen.findByText('需要定位的读书笔记')
    const card = note.closest('[data-reading-source-kind="note"]')
    await waitFor(() => expect(card).toHaveClass('reading-source-highlight'))
    expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'center'
    })
  })

  it('opens practice history and expands the referenced practice record', async () => {
    renderWithSource({ kind: 'practice', bookId: 'book-1', recordId: 'practice-target' })

    const review = await screen.findByText('需要定位的实践点评')
    const card = review.closest('[data-reading-source-kind="practice"]')
    expect(review.closest('details')).toHaveAttribute('open')
    await waitFor(() => expect(card).toHaveClass('reading-source-highlight'))
  })

  it('switches to the referenced learning phase and highlights its content', async () => {
    renderWithSource({ kind: 'phase', bookId: 'book-1', phaseId: 'overview' })

    await screen.findByRole('heading', { name: '全书概览' })
    const section = document.querySelector(
      '[data-reading-source-kind="phase"][data-reading-source-id="overview"]'
    )
    await waitFor(() => expect(section).toHaveClass('reading-source-highlight'))
  })

  it('opens Q&A history and highlights the referenced historical question', async () => {
    const { container } = renderWithSource({
      kind: 'question',
      bookId: 'book-1',
      recordId: 'qa-target',
      questionIndex: 1
    })

    const target = await waitFor(() => {
      const element = container.querySelector<HTMLElement>(
        '[data-reading-source-kind="question"] [data-reading-source-question-index="1"]'
      )
      expect(element).not.toBeNull()
      return element!
    })
    await waitFor(() => expect(target).toHaveClass('reading-source-highlight'))
    expect(target).toHaveTextContent('需要定位的角色问题')
  })
})

describe('ReadingView reader highlights', () => {
  const chapterOne = '第一章 认知革命\n\n虚构故事让智人得以大规模协作。'
  const chapterTwo = '第二章 农业革命\n\n农业革命是史上最大的骗局。'
  const documentContent = `${chapterOne}\n\n${chapterTwo}`
  const quote = '虚构故事让智人得以大规模协作。'
  const expectedOffset = documentContent.indexOf('虚构故事')

  const readerBook: Book = {
    ...book,
    status: 'reading',
    documentContent,
    chapters: [
      { title: '第一章 认知革命', start: 0, length: chapterOne.length },
      { title: '第二章 农业革命', start: chapterOne.length + 2, length: chapterTwo.length }
    ]
  }

  beforeEach(() => {
    window.localStorage.clear()
    Object.defineProperty(window, 'scrollTo', { value: jest.fn(), writable: true })
    HTMLElement.prototype.scrollIntoView = jest.fn()
    jest.spyOn(store, 'getBook').mockImplementation(() => readerBook)
    jest.spyOn(store, 'flushPendingStoreWrites').mockResolvedValue()
    jest.spyOn(store, 'updateBook').mockImplementation(() => undefined)
  })

  afterEach(() => jest.restoreAllMocks())

  function selectPassage(text: string) {
    const passage = screen.getByText(text)
    const range = {
      commonAncestorContainer: passage,
      getBoundingClientRect: () => ({ top: 120, left: 60, width: 140, height: 24, bottom: 144, right: 200 })
    }
    jest.spyOn(window, 'getSelection').mockReturnValue({
      isCollapsed: false,
      rangeCount: 1,
      getRangeAt: () => range,
      toString: () => text,
      removeAllRanges: jest.fn()
    } as unknown as Selection)
    fireEvent.mouseUp(passage)
  }

  it('stores the highlight offset and colour so it can be re-anchored later', async () => {
    render(<ReadingView book={readerBook} apiKey="" lang="zh" onBack={jest.fn()} onOpenSettings={jest.fn()} />)
    fireEvent.click(screen.getByTestId('reading-tab-reader'))

    selectPassage(quote)
    fireEvent.click(await screen.findByRole('button', { name: '划线' }))

    await waitFor(() => expect(store.updateBook).toHaveBeenCalledTimes(1))
    expect(store.updateBook).toHaveBeenCalledWith(readerBook.id, {
      noteRecords: [expect.objectContaining({
        type: 'note',
        quote,
        offset: expectedOffset,
        color: 'yellow',
        chapterIndex: 0,
        chapterTitle: '第一章 认知革命',
        source: 'reading'
      })]
    })
  })

  it('keeps the selection toolbar hidden outside the article text', async () => {
    render(<ReadingView book={readerBook} apiKey="" lang="zh" onBack={jest.fn()} onOpenSettings={jest.fn()} />)
    fireEvent.click(screen.getByTestId('reading-tab-reader'))

    const heading = screen.getByRole('heading', { name: '第一章 认知革命' })
    jest.spyOn(window, 'getSelection').mockReturnValue({
      isCollapsed: false,
      rangeCount: 1,
      getRangeAt: () => ({ commonAncestorContainer: document.body }),
      toString: () => quote,
      removeAllRanges: jest.fn()
    } as unknown as Selection)
    fireEvent.mouseUp(heading)

    expect(screen.queryByRole('button', { name: '划线并写笔记' })).not.toBeInTheDocument()
  })
})

describe('ReadingView notes workspace', () => {
  const chapterOne = '第一章 认知革命\n\n虚构故事让智人得以大规模协作。'
  const chapterTwo = '第二章 农业革命\n\n农业革命是史上最大的骗局。'
  const documentContent = `${chapterOne}\n\n${chapterTwo}`
  const highlightQuote = '虚构故事让智人得以大规模协作。'

  const annotatedBook: Book = {
    ...book,
    status: 'reading',
    documentContent,
    chapters: [
      { title: '第一章 认知革命', start: 0, length: chapterOne.length },
      { title: '第二章 农业革命', start: chapterOne.length + 2, length: chapterTwo.length }
    ],
    noteRecords: [
      {
        id: 'note-1',
        type: 'note',
        content: '协作能力是智人的关键优势。',
        quote: highlightQuote,
        offset: documentContent.indexOf('虚构故事'),
        color: 'blue',
        chapterIndex: 0,
        chapterTitle: '第一章 认知革命',
        source: 'reading',
        tags: ['关键概念'],
        createdAt: 1
      },
      {
        id: 'note-2',
        type: 'note',
        content: '农业革命带来的影响。',
        source: 'practice',
        createdAt: 2
      }
    ],
    bookmarks: [
      {
        id: 'bookmark-1',
        chapterIndex: 1,
        offset: documentContent.indexOf('农业革命是史上'),
        chapterTitle: '第二章 农业革命',
        snippet: '农业革命是史上最大的骗局。',
        label: '回过头再看',
        color: 'green',
        createdAt: 2
      }
    ],
    readingProgress: { currentPage: 1, totalPages: 2, percentage: 50 }
  }

  beforeEach(() => {
    window.localStorage.clear()
    Object.defineProperty(window, 'scrollTo', { value: jest.fn(), writable: true })
    HTMLElement.prototype.scrollIntoView = jest.fn()
    jest.spyOn(store, 'getBook').mockImplementation(() => annotatedBook)
    jest.spyOn(store, 'flushPendingStoreWrites').mockResolvedValue()
    jest.spyOn(store, 'updateBook').mockImplementation(() => undefined)
  })

  afterEach(() => jest.restoreAllMocks())

  function renderNotes() {
    render(<ReadingView book={annotatedBook} apiKey="" lang="zh" onBack={jest.fn()} onOpenSettings={jest.fn()} />)
    fireEvent.click(screen.getByTestId('reading-tab-notes'))
  }

  it('aggregates bookmarks in the notes tab and returns to the bookmarked passage', async () => {
    const { container } = render(
      <ReadingView book={annotatedBook} apiKey="" lang="zh" onBack={jest.fn()} onOpenSettings={jest.fn()} />
    )
    fireEvent.click(screen.getByTestId('reading-tab-notes'))

    expect(await screen.findByRole('heading', { name: '书签 (1)' })).toBeInTheDocument()
    const card = container.querySelector('[data-reading-source-id="bookmark-1"]') as HTMLElement
    expect(card).not.toBeNull()
    expect(within(card).getByText('回过头再看')).toBeInTheDocument()
    expect(within(card).getByText('农业革命是史上最大的骗局。')).toBeInTheDocument()

    fireEvent.click(within(card).getByRole('button', { name: '回到原文' }))
    expect(await screen.findByRole('heading', { name: '第二章 农业革命' })).toBeInTheDocument()
  })

  it('shows highlight tags and filters the note list by tag', async () => {
    renderNotes()

    const filter = await screen.findByRole('button', { name: '关键概念' })
    expect(screen.getByText('协作能力是智人的关键优势。')).toBeInTheDocument()
    expect(screen.getByText('农业革命带来的影响。')).toBeInTheDocument()

    fireEvent.click(filter)
    expect(screen.getByText('协作能力是智人的关键优势。')).toBeInTheDocument()
    expect(screen.queryByText('农业革命带来的影响。')).not.toBeInTheDocument()
  })

  it('stores tags when saving a highlight with a note', async () => {
    render(<ReadingView book={annotatedBook} apiKey="" lang="zh" onBack={jest.fn()} onOpenSettings={jest.fn()} />)
    fireEvent.click(screen.getByTestId('reading-tab-reader'))

    const passage = screen.getByText(highlightQuote)
    jest.spyOn(window, 'getSelection').mockReturnValue({
      isCollapsed: false,
      rangeCount: 1,
      getRangeAt: () => ({
        commonAncestorContainer: passage,
        getBoundingClientRect: () => ({ top: 120, left: 60, width: 140, height: 24, bottom: 144, right: 200 })
      }),
      toString: () => highlightQuote,
      removeAllRanges: jest.fn()
    } as unknown as Selection)
    fireEvent.mouseUp(passage)

    fireEvent.click(await screen.findByRole('button', { name: '划线并写笔记' }))
    fireEvent.change(screen.getByPlaceholderText('写下这段原文对你的意义（可留空）'), {
      target: { value: '协作是认知革命的前提。' }
    })
    const tagInput = screen.getByLabelText('添加标签')
    fireEvent.change(tagInput, { target: { value: '关键概念' } })
    fireEvent.keyDown(tagInput, { key: 'Enter' })
    fireEvent.click(screen.getByRole('button', { name: '保存划线笔记' }))

    await waitFor(() => expect(store.updateBook).toHaveBeenCalledTimes(1))
    expect(store.updateBook).toHaveBeenCalledWith(annotatedBook.id, {
      noteRecords: expect.arrayContaining([
        expect.objectContaining({
          quote: highlightQuote,
          source: 'reading',
          color: 'yellow',
          tags: ['关键概念']
        })
      ])
    })
  })
})
