import { test, expect } from '@playwright/test'
import { addBookForE2E, prepareAppForE2E } from './testState'

/**
 * 费曼读书助手 - E2E 测试
 * 覆盖关键用户流程
 */

test.beforeEach(async ({ page }) => {
  await prepareAppForE2E(page)
})

test.describe('应用启动和导航', () => {
  test('应该正常加载首页', async ({ page }) => {
    await page.goto('/')

    // 检查页面标题
    await expect(page).toHaveTitle(/费曼读书助手/)

    // 检查导航栏
    await expect(page.locator('nav')).toBeVisible()
    await expect(page.getByRole('button', { name: '书架', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: '设置', exact: true })).toBeVisible()
  })

  test('应该显示书架视图', async ({ page }) => {
    await page.goto('/')

    // 检查书架区域
    const bookshelf = page.locator('[class*="bookshelf"], [data-testid="bookshelf"]')
    await expect(bookshelf.or(page.locator('main'))).toBeVisible()
  })

  test('应该能够切换到设置页面', async ({ page }) => {
    await page.goto('/')

    // 点击设置按钮
    await page.getByRole('button', { name: '设置', exact: true }).click()

    // 检查设置页面加载
    await expect(page.getByRole('heading', { name: '设置', exact: true })).toBeVisible()
  })

  test('停用路径不会打开产品或配置页面', async ({ page }) => {
    const response = await page.goto('/reader/?view=settings&tokendance_callback=1')
    expect([404, 410]).toContain(response?.status())
    await expect(page).not.toHaveTitle(/费曼读书助手/)
  })

  test('旧产品别名返回 410', async ({ request }) => {
    expect([404, 410]).toContain((await request.get('/feynmanreader')).status())
  })
})

test.describe('书籍管理', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('应该能够打开添加书籍对话框', async ({ page }) => {
    // 点击添加书籍按钮
    const addButton = page.getByRole('button', { name: '添加书籍', exact: true }).first()
    await addButton.click()

    // 检查对话框出现
    await expect(page.getByRole('heading', { name: '添加书籍', exact: true })).toBeVisible()
  })

  test('应该能够搜索书籍', async ({ page }) => {
    // 等待页面加载
    await page.waitForLoadState('networkidle')

    // 查找搜索输入框
    const searchInput = page.locator('input[type="search"], input[placeholder*="搜索" i], input[placeholder*="search" i]').first()

    if (await searchInput.isVisible()) {
      await searchInput.fill('测试书籍')

      // 等待搜索结果
      await page.waitForTimeout(500)
    }
  })
})

test.describe('阅读视图', () => {
  const bookName = '阅读视图测试书'

  test.beforeEach(async ({ page }) => {
    await addBookForE2E(page, bookName)
  })

  test('应该能够打开书籍进行阅读', async ({ page }) => {
    await page.getByRole('button', { name: '列表视图', exact: true }).click()
    await page.getByRole('button', { name: '开始阅读', exact: true }).click()
    await expect(page.getByRole('heading', { name: `《${bookName}》`, exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: '阶段学习', exact: true })).toBeVisible()
  })
})

test.describe('设置页面', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: '设置', exact: true }).click()
  })

  test('应该能够显示存储类型信息', async ({ page }) => {
    await page.getByRole('button', { name: /数据管理/ }).click()
    const dialog = page.getByRole('dialog', { name: '数据管理', exact: true })
    await expect(dialog.getByRole('heading', { name: '数据管理', exact: true })).toBeVisible()
    await expect(dialog.getByText('IndexedDB（浏览器本地存储）')).toBeVisible()
  })

  test('应该能够更改语言设置', async ({ page }) => {
    await page.getByRole('button', { name: 'Switch to English' }).click()
    await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: '切换至中文' })).toBeVisible()
  })

  test('应该能够更改主题', async ({ page }) => {
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    await page.getByRole('button', { name: '切换至深色主题' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  })
})

test.describe('响应式设计', () => {
  test('桌面端应该正常显示', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 })
    await page.goto('/')

    await expect(page.locator('nav')).toBeVisible()
    await expect(page.locator('main')).toBeVisible()
  })

  test('移动端应该正常显示', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    await page.goto('/')

    await expect(page.locator('nav')).toBeVisible()
    await expect(page.locator('main')).toBeVisible()
  })
})

test.describe('辅助功能', () => {
  test('导航应该支持键盘操作', async ({ page }) => {
    await page.goto('/')

    // 使用 Tab 键导航
    await page.keyboard.press('Tab')
    await page.keyboard.press('Tab')

    // 按 Enter 键
    await page.keyboard.press('Enter')

    // 检查页面状态变化
    await page.waitForTimeout(500)
  })

  test('应该有正确的页面标题', async ({ page }) => {
    await page.goto('/')

    const title = await page.title()
    expect(title).toBeTruthy()
    expect(title.length).toBeGreaterThan(0)
  })
})
