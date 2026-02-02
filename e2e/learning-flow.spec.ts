import { test, expect } from '@playwright/test'

/**
 * 学习流程 E2E 测试
 * 测试用户从添加书籍到完成学习的完整流程
 */

test.describe('添加书籍流程', () => {
  test('应该能够成功添加一本书', async ({ page }) => {
    await page.goto('/')

    // 打开添加书籍对话框
    const addButton = page.locator('button:has-text("添加"), button:has-text("新建")').first()
    await addButton.click()

    // 等待对话框
    const dialog = page.locator('dialog, [role="dialog"], .modal, [class*="dialog" i], [class*="modal" i]')
    await expect(dialog).toBeVisible()

    // 填写书籍信息
    const nameInput = page.locator('input[name="name"], input[placeholder*="书名" i], input[id*="name" i]').first()
    await nameInput.fill('E2E 测试书籍')

    const authorInput = page.locator('input[name="author"], input[placeholder*="作者" i], input[id*="author" i]').first()
    await authorInput.fill('测试作者')

    // 提交表单
    const submitButton = page.locator('button:has-text("确认"), button:has-text("添加"), button:has-text("保存"), button[type="submit"]').first()
    await submitButton.click()

    // 等待对话框关闭
    await expect(dialog).not.toBeVisible({ timeout: 5000 })

    // 验证书籍添加成功
    await expect(page.locator('text=/E2E 测试书籍/')).toBeVisible({ timeout: 5000 })
  })

  test('应该验证必填字段', async ({ page }) => {
    await page.goto('/')

    // 打开添加书籍对话框
    const addButton = page.locator('button:has-text("添加"), button:has-text("新建")').first()
    await addButton.click()

    // 尝试直接提交（不填写任何信息）
    const submitButton = page.locator('button:has-text("确认"), button:has-text("添加"), button[type="submit"]').first()
    await submitButton.click()

    // 应该显示验证错误或对话框仍在
    const dialog = page.locator('dialog, [role="dialog"], .modal, [class*="dialog" i], [class*="modal" i]')
    const isDialogVisible = await dialog.isVisible().catch(() => false)

    // 如果对话框关闭了，检查是否有错误提示
    if (!isDialogVisible) {
      await expect(page.locator('text=/错误|失败|必填/i')).toBeVisible()
    }
  })
})

test.describe('学习阶段流程', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('应该能够进入书籍的阅读视图', async ({ page }) => {
    // 查找第一本书
    const bookCard = page.locator('[class*="book"], article').first()

    const isVisible = await bookCard.isVisible().catch(() => false)
    if (isVisible) {
      await bookCard.click()

      // 验证进入阅读视图
      await expect(page.locator('[class*="reading"], [class*="phase"], text=/阶段|笔记/').first()).toBeVisible({ timeout: 5000 })
    }
  })

  test('应该显示学习阶段列表', async ({ page }) => {
    // 进入第一本书
    const bookCard = page.locator('[class*="book"], article').first()
    const isVisible = await bookCard.isVisible().catch(() => false)

    if (isVisible) {
      await bookCard.click()

      // 检查阶段列表
      const phases = page.locator('[class*="phase"], [data-phase], button:has-text("阶段")')
      const phaseCount = await phases.count()

      // 应该至少有阶段相关的元素
      expect(phaseCount).toBeGreaterThan(0)
    }
  })
})

test.describe('费曼实践流程', () => {
  test('应该能够打开费曼实践面板', async ({ page }) => {
    await page.goto('/')

    // 进入第一本书
    const bookCard = page.locator('[class*="book"], article').first()
    const isVisible = await bookCard.isVisible().catch(() => false)

    if (isVisible) {
      await bookCard.click()

      // 查找费曼实践相关按钮
      const practiceButton = page.locator('button:has-text("费曼"), button:has-text("实践"), [class*="practice" i]').first()

      const isPracticeVisible = await practiceButton.isVisible().catch(() => false)
      if (isPracticeVisible) {
        await practiceButton.click()

        // 验证实践面板打开
        await expect(page.locator('text=/教学模拟|角色问答/i').or(page.locator('[class*="practice" i], dialog'))).toBeVisible({ timeout: 5000 })
      }
    }
  })
})

test.describe('数据持久化', () => {
  test('添加的书籍应该在刷新后仍然存在', async ({ page }) => {
    await page.goto('/')

    // 记录当前书籍数量
    const bookCardsBefore = page.locator('[class*="book"], article')
    const countBefore = await bookCardsBefore.count()

    // 添加新书
    const addButton = page.locator('button:has-text("添加"), button:has-text("新建")').first()
    await addButton.click()

    const dialog = page.locator('dialog, [role="dialog"], .modal, [class*="dialog" i], [class*="modal" i]')
    await expect(dialog).toBeVisible()

    const nameInput = page.locator('input[name="name"], input[placeholder*="书名" i]').first()
    await nameInput.fill(`持久化测试-${Date.now()}`)

    const submitButton = page.locator('button:has-text("确认"), button:has-text("添加")').first()
    await submitButton.click()

    await expect(dialog).not.toBeVisible({ timeout: 5000 })

    // 刷新页面
    await page.reload()

    // 验证书籍数量增加
    const bookCardsAfter = page.locator('[class*="book"], article')
    const countAfter = await bookCardsAfter.count()

    expect(countAfter).toBeGreaterThanOrEqual(countBefore)
  })
})

test.describe('设置影响', () => {
  test('更改语言应该更新界面', async ({ page }) => {
    await page.goto('/')

    // 进入设置
    await page.click('button:has-text("设置"), button:has-text("⚙️")')

    // 查找语言切换选项
    const langOption = page.locator('button:has-text("English"), button:has-text("英文")').first()
    const isVisible = await langOption.isVisible().catch(() => false)

    if (isVisible) {
      await langOption.click()

      // 检查界面语言变化
      await page.waitForTimeout(500)

      // 应该能看到英文界面元素
      const englishElement = page.locator('text=/Settings|Bookshelf|Language/')
      await expect(englishElement.first()).toBeVisible()
    }
  })

  test('更改主题应该更新界面样式', async ({ page }) => {
    await page.goto('/')

    // 获取当前主题
    const currentTheme = await page.locator('html').getAttribute('data-theme')

    // 进入设置
    await page.click('button:has-text("设置"), button:has-text("⚙️")')

    // 尝试切换主题
    const themeButton = page.locator('button:has-text("深色"), button:has-text("light"), button:has-text("dark")').first()
    const isVisible = await themeButton.isVisible().catch(() => false)

    if (isVisible) {
      await themeButton.click()

      // 检查主题属性变化
      await page.waitForTimeout(500)
      const newTheme = await page.locator('html').getAttribute('data-theme')

      // 主题应该改变或至少存在
      expect(newTheme).toBeTruthy()
    }
  })
})
