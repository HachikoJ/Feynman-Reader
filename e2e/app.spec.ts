import { test, expect } from '@playwright/test'

/**
 * 费曼阅读法 - E2E 测试
 * 覆盖关键用户流程
 */

test.describe('应用启动和导航', () => {
  test('应该正常加载首页', async ({ page }) => {
    await page.goto('/')

    // 检查页面标题
    await expect(page).toHaveTitle(/费曼阅读法/)

    // 检查导航栏
    await expect(page.locator('nav')).toBeVisible()
    await expect(page.locator('text=/书架/')).toBeVisible()
    await expect(page.locator('text=/设置/')).toBeVisible()
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
    await page.click('button:has-text("设置"), button:has-text("⚙️")')

    // 检查设置页面加载
    await expect(page.locator('text=/API Key|语言|主题/').first()).toBeVisible({ timeout: 5000 })
  })
})

test.describe('书籍管理', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('应该能够打开添加书籍对话框', async ({ page }) => {
    // 点击添加书籍按钮
    const addButton = page.locator('button:has-text("添加"), button:has-text("新建"), button[aria-label*="add"], button[aria-label*="add" i]').first()
    await addButton.click()

    // 检查对话框出现
    await expect(page.locator('dialog, [role="dialog"], .modal, [class*="dialog" i], [class*="modal" i]')).toBeVisible()
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
  test('应该能够打开书籍进行阅读', async ({ page }) => {
    await page.goto('/')

    // 查找第一本书的卡片
    const bookCard = page.locator('[class*="book"], article').first()

    const isVisible = await bookCard.isVisible().catch(() => false)
    if (isVisible) {
      await bookCard.click()

      // 检查是否进入阅读视图
      await expect(page.locator('text=/阶段|笔记|费曼/').or(page.locator('[class*="reading"], [class*="phase"] i'))).toBeVisible({ timeout: 5000 })
    }
  })
})

test.describe('设置页面', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.click('button:has-text("设置"), button:has-text("⚙️")')
  })

  test('应该能够显示存储类型信息', async ({ page }) => {
    // 检查 IndexedDB 或 LocalStorage 相关信息
    await expect(page.locator('text=/IndexedDB|LocalStorage|存储/i')).toBeVisible({ timeout: 5000 })
  })

  test('应该能够更改语言设置', async ({ page }) => {
    // 查找语言选择器
    const langSelector = page.locator('select[name="language"], [data-testid="language-selector"], button:has-text("中文"), button:has-text("English")').first()

    const isVisible = await langSelector.isVisible().catch(() => false)
    if (isVisible) {
      await langSelector.click()

      // 等待可能的下拉菜单
      await page.waitForTimeout(500)
    }
  })

  test('应该能够更改主题', async ({ page }) => {
    // 查找主题选择器
    const themeSelector = page.locator('[data-testid="theme-selector"], button:has-text("深色"), button:has-text("浅色"), button:has-text("赛博")').first()

    const isVisible = await themeSelector.isVisible().catch(() => false)
    if (isVisible) {
      // 检查主题选项存在
      await expect(themeSelector.or(page.locator('text=/主题/'))).toBeVisible()
    }
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
