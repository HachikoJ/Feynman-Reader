import type { Page } from '@playwright/test'

export async function prepareAppForE2E(page: Page) {
  await page.goto('/')
  await page.evaluate(async () => {
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
      const transaction = db.transaction('settings', 'readwrite')
      transaction.onerror = () => reject(transaction.error)
      transaction.oncomplete = () => resolve()
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
    })
    db.close()
  })
  await page.reload()
  await page.getByRole('heading', { name: '我的书架', exact: true }).waitFor({ state: 'visible' })
}

export async function addBookForE2E(page: Page, name: string) {
  await page.getByTestId('add-book-button').click()
  await page.getByPlaceholder('输入书名...').fill(name)
  await page.getByPlaceholder('输入作者...').fill('测试作者')
  await page.getByRole('button', { name: '添加', exact: true }).click()
  await page.getByRole('heading', { name, exact: true }).waitFor({ state: 'visible' })
}
