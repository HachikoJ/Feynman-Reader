import { expect, test, type Page } from '@playwright/test'

interface SeedBook {
  id: string
  name: string
  author?: string
  description?: string
  tags?: Array<{ name: string; category: string }>
  status: 'unread' | 'reading' | 'finished'
  currentPhase: number
  noteRecords: Array<Record<string, unknown>>
  responses: Record<string, string>
  practiceRecords: Array<Record<string, unknown>>
  qaPracticeRecords: Array<Record<string, unknown>>
  recommendations?: string
  bestScore: number
  createdAt: number
  updatedAt: number
}

function emptyBook(index: number): SeedBook {
  return {
    id: `virtual-book-${index}`,
    name: `虚拟书 ${index}`,
    author: `作者 ${index}`,
    description: `用于验证长书架虚拟列表的第 ${index} 本书。`,
    tags: [{ name: '虚拟列表', category: '测试' }],
    status: 'unread',
    currentPhase: 0,
    noteRecords: [],
    responses: {},
    practiceRecords: [],
    qaPracticeRecords: [],
    bestScore: 0,
    createdAt: index,
    updatedAt: index
  }
}

async function seedLocalData(
  page: Page,
  books: SeedBook[],
  organization: { lists: unknown[]; relations: unknown[] } = { lists: [], relations: [] }
) {
  await page.goto('/')
  await page.evaluate(async ({ books: seededBooks, organization: seededOrganization }) => {
    localStorage.setItem('feynman-data-risk-acknowledged', '3')
    localStorage.setItem('feynman-onboarding-completed', '5')
    localStorage.setItem('feynman-last-successful-backup-at-v1', String(Date.now()))

    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('FeynmanReadingDB', 1)
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve(request.result)
      request.onupgradeneeded = () => {
        const database = request.result
        if (!database.objectStoreNames.contains('settings')) database.createObjectStore('settings', { keyPath: 'id' })
        if (!database.objectStoreNames.contains('books')) database.createObjectStore('books', { keyPath: 'id' })
        if (!database.objectStoreNames.contains('metadata')) database.createObjectStore('metadata', { keyPath: 'key' })
      }
    })

    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(['settings', 'books', 'metadata'], 'readwrite')
      transaction.onerror = () => reject(transaction.error)
      transaction.oncomplete = () => resolve()
      const booksStore = transaction.objectStore('books')
      booksStore.clear()
      seededBooks.forEach(book => booksStore.put(book))
      transaction.objectStore('settings').put({
        id: 'app',
        apiKey: '',
        language: 'zh',
        theme: 'light',
        hideApiKeyAlert: true,
        aiDataConsent: false,
        quotes: [],
        quotesInitialized: true
      })
      transaction.objectStore('metadata').put({ key: 'ai-usage', records: [] })
      transaction.objectStore('metadata').put({ key: 'book-organization', ...seededOrganization })
    })
    db.close()
  }, { books, organization })
  await page.reload()
}

test.describe('completed retained features', () => {
  test('manages organization, charts and teaching practice', async ({ page }) => {
    const now = Date.now()
    const phaseResponses = Object.fromEntries([
      'background', 'overview', 'deepDive', 'critical', 'reception', 'synthesis'
    ].map(phase => [phase, `## ${phase}\n\n这是 ${phase} 阶段的完整分析内容。`]))
    const questions = ['elementary', 'professional', 'scientist'].map((persona, index) => ({
      persona,
      personaName: `角色 ${index + 1}`,
      question: `问题 ${index + 1}`,
      userAnswer: `回答 ${index + 1}`,
      answeredAt: now,
      aiReview: `点评 ${index + 1}`,
      score: 80,
      passed: true,
      reviewedAt: now,
      attempts: [{
        userAnswer: `回答 ${index + 1}`,
        answeredAt: now,
        aiReview: `点评 ${index + 1}`,
        score: 80,
        passed: true,
        reviewedAt: now
      }]
    }))
    const featureBook: SeedBook = {
      ...emptyBook(1),
      id: 'feature-book',
      name: '功能验证书',
      author: '费曼作者',
      status: 'finished',
      currentPhase: 6,
      responses: phaseResponses,
      noteRecords: [{ id: 'note-1', type: 'note', content: '本地笔记内容', createdAt: now }],
      practiceRecords: [{
        id: 'practice-1',
        bookId: 'feature-book',
        sessionId: 'session-1',
        content: '这是一段已经完成的教学模拟内容。'.repeat(20),
        aiReview: '教学模拟点评。',
        scores: { accuracy: 80, completeness: 80, clarity: 80, overall: 80 },
        passed: true,
        createdAt: now
      }],
      qaPracticeRecords: [{
        id: 'qa-1',
        bookId: 'feature-book',
        sessionId: 'session-1',
        questions,
        allPassed: true,
        createdAt: now,
        updatedAt: now
      }],
      recommendations: '推荐继续阅读同主题的其他作品。',
      bestScore: 80,
      createdAt: now,
      updatedAt: now
    }
    const relatedBook = { ...emptyBook(2), id: 'related-book', name: '关联验证书' }
    await seedLocalData(page, [featureBook, relatedBook], {
      lists: [{
        id: 'list-1',
        name: '核心书单',
        description: '端到端验证',
        bookIds: ['feature-book'],
        createdAt: now,
        updatedAt: now
      }],
      relations: [{
        id: 'relation-1',
        fromBookId: 'feature-book',
        toBookId: 'related-book',
        type: 'related',
        note: '对照阅读',
        createdAt: now
      }]
    })

    await expect(page.getByRole('heading', { name: '我的书架' })).toBeVisible()
    await page.getByRole('button', { name: '书单', exact: true }).click()
    await expect(page.getByRole('heading', { name: '核心书单' })).toBeVisible()
    await expect(page.getByRole('checkbox', { name: '从“核心书单”移出《功能验证书》' })).toBeChecked()
    await page.getByRole('button', { name: '删除书单' }).click()
    await expect(page.getByRole('heading', { name: '确认删除书单' })).toBeVisible()
    await page.getByRole('button', { name: '取消', exact: true }).click()
    await page.getByRole('button', { name: '关闭书单管理' }).click()

    await page.getByPlaceholder('搜索书名、作者、标签...').fill('功能验证书')
    await page.getByRole('button', { name: '列表视图' }).click()
    await page.getByRole('button', { name: '继续阅读' }).click()
    await expect(page.getByRole('heading', { name: '《功能验证书》' })).toBeVisible()
    await expect(page.getByRole('button', { name: '导出', exact: true })).toHaveCount(0)

    await page.getByRole('button', { name: '整理', exact: true }).click()
    await expect(page.getByRole('button', { name: '关联验证书 主题相关 对照阅读' })).toBeVisible()
    await page.getByRole('button', { name: '关闭书籍整理' }).click()

    await page.getByRole('button', { name: '费曼实践' }).click()
    await page.getByRole('button', { name: '查看学习分析' }).click()
    await expect(page.getByRole('heading', { name: '学习维度' })).toBeVisible()
    await expect(page.getByRole('heading', { name: '练习评分变化' })).toBeVisible()

    const freeInput = page.getByPlaceholder(/用你自己的话，像教小白一样解释这本书/)
    await expect(freeInput).toBeVisible()
    await expect(page.getByRole('button', { name: '分步引导' })).toHaveCount(0)
    const teachingAnswer = '这是用于验证教学输入可直接填写的完整讲解。'.repeat(20)
    await freeInput.fill(teachingAnswer)
    await expect(freeInput).toHaveValue(teachingAnswer)
  })

  test('keeps score trend labels and markers undistorted', async ({ page }) => {
    const now = Date.now()
    const personas = ['elementary', 'professional', 'scientist'] as const
    const questionsForScore = (score: number) => personas.map((persona, index) => ({
      persona,
      personaName: `角色 ${index + 1}`,
      question: `问题 ${index + 1}`,
      userAnswer: `回答 ${index + 1}`,
      answeredAt: now,
      aiReview: `点评 ${index + 1}`,
      score,
      passed: true,
      reviewedAt: now
    }))
    const trendBook: SeedBook = {
      ...emptyBook(1),
      id: 'trend-book',
      name: '趋势图验证书',
      status: 'reading',
      qaPracticeRecords: [
        {
          id: 'qa-trend-1',
          bookId: 'trend-book',
          sessionId: 'session-trend-1',
          questions: questionsForScore(83),
          allPassed: true,
          createdAt: now - 1_000,
          updatedAt: now - 1_000
        },
        {
          id: 'qa-trend-2',
          bookId: 'trend-book',
          sessionId: 'session-trend-2',
          questions: questionsForScore(82),
          allPassed: true,
          createdAt: now,
          updatedAt: now
        }
      ],
      updatedAt: now
    }

    await seedLocalData(page, [trendBook])
    await page.getByPlaceholder('搜索书名、作者、标签...').fill('趋势图验证书')
    await page.getByRole('button', { name: '列表视图' }).click()
    await page.getByRole('button', { name: '继续阅读' }).click()
    await page.getByRole('button', { name: '费曼实践' }).click()

    const progressSummary = page.locator('summary').filter({ hasText: '进步追踪' })
    await expect(progressSummary).toHaveCount(1)
    await progressSummary.click()

    const label = page.getByTestId('latest-score-label')
    const plot = page.getByTestId('score-trend-plot')
    await expect(label).toHaveText('82')

    const labelBox = await label.boundingBox()
    const plotBox = await plot.boundingBox()
    if (!labelBox || !plotBox) throw new Error('Score trend geometry is unavailable')
    expect(labelBox.width).toBeGreaterThan(10)
    expect(labelBox.width).toBeLessThan(40)
    expect(labelBox.height).toBeGreaterThan(10)
    expect(labelBox.x).toBeGreaterThanOrEqual(plotBox.x)
    expect(labelBox.x + labelBox.width).toBeLessThanOrEqual(plotBox.x + plotBox.width)

    const markerGeometry = await page.getByTestId('score-point').evaluateAll(points => points.map(point => {
      const marker = point.querySelector<HTMLElement>('span:last-child')
      if (!marker) return null
      const rect = marker.getBoundingClientRect()
      return { width: rect.width, height: rect.height }
    }))
    expect(markerGeometry).toHaveLength(2)
    markerGeometry.forEach(marker => {
      expect(marker).not.toBeNull()
      expect(Math.abs(marker!.width - marker!.height)).toBeLessThan(0.5)
    })
  })

  test('virtualizes a long mobile shelf and reveals safe swipe actions', async ({ page }, testInfo) => {
    test.skip(!testInfo.project.name.startsWith('Mobile '), 'Mobile-only interaction coverage')

    await seedLocalData(page, Array.from({ length: 35 }, (_, index) => emptyBook(index + 1)))
    await page.getByRole('button', { name: '列表视图' }).click()

    const virtualList = page.getByTestId('bookshelf-virtual-list')
    await expect(virtualList).toBeVisible()
    const renderedCards = page.getByTestId('mobile-swipe-card')
    expect(await renderedCards.count()).toBeLessThan(35)
    await expect(page.getByRole('heading', { name: '虚拟书 35' })).toBeVisible()

    const firstCard = renderedCards.filter({ hasText: '虚拟书 35' })
    const swipeSurface = firstCard.locator(':scope > div.relative')
    const box = await firstCard.boundingBox()
    if (!box) throw new Error('Swipe card has no bounding box')
    const startX = box.x + box.width * 0.75
    const endX = startX - 110
    const y = box.y + box.height / 2
    await swipeSurface.dispatchEvent('touchstart', { touches: [{ identifier: 1, clientX: startX, clientY: y }] })
    await swipeSurface.dispatchEvent('touchmove', { touches: [{ identifier: 1, clientX: endX, clientY: y }] })
    await swipeSurface.dispatchEvent('touchend', { touches: [], changedTouches: [{ identifier: 1, clientX: endX, clientY: y }] })
    await expect.poll(() => swipeSurface.evaluate(element => (element as HTMLElement).style.transform)).toBe('translateX(-92px)')
    await expect(firstCard.locator(':scope > button[aria-label="编辑"]')).toBeVisible()

    await virtualList.evaluate(element => { element.scrollTop = element.scrollHeight })
    await expect(page.getByRole('heading', { name: '虚拟书 1' })).toBeVisible()

    await page.evaluate(() => window.scrollTo(0, 500))
    await expect(page.getByRole('button', { name: 'Back to top' })).toBeHidden()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  })
})
