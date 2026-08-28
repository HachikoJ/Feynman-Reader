import { test, expect } from '@playwright/test'
import { addBookForE2E, prepareAppForE2E } from './testState'

/**
 * 学习流程 E2E 测试
 * 测试用户从添加书籍到完成学习的完整流程
 */

test.beforeEach(async ({ page }) => {
  await prepareAppForE2E(page)
})

test.describe('添加书籍流程', () => {
  test('应该能够成功添加一本书', async ({ page }) => {
    await page.goto('/')

    // 打开添加书籍对话框
    const addButton = page.getByRole('button', { name: '添加书籍', exact: true }).first()
    await addButton.click()

    // 等待对话框
    const dialogHeading = page.getByRole('heading', { name: '添加书籍', exact: true })
    await expect(dialogHeading).toBeVisible()

    // 填写书籍信息
    const nameInput = page.getByPlaceholder('输入书名...')
    await nameInput.fill('E2E 测试书籍')

    const authorInput = page.getByPlaceholder('输入作者...')
    await authorInput.fill('测试作者')

    // 提交表单
    const submitButton = page.getByRole('button', { name: '添加', exact: true })
    await submitButton.click()

    // 等待对话框关闭
    await expect(dialogHeading).not.toBeVisible({ timeout: 5000 })

    // 验证书籍添加成功
    await expect(page.getByRole('heading', { name: 'E2E 测试书籍', exact: true })).toBeVisible()
  })

  test('应该验证必填字段', async ({ page }) => {
    await page.goto('/')

    // 打开添加书籍对话框
    const addButton = page.getByRole('button', { name: '添加书籍', exact: true }).first()
    await addButton.click()

    const submitButton = page.getByRole('button', { name: '添加', exact: true })
    await expect(submitButton).toBeDisabled()
    await expect(page.getByRole('heading', { name: '添加书籍', exact: true })).toBeVisible()
  })
})

test.describe('学习阶段流程', () => {
  const bookName = '学习阶段测试书'

  test.beforeEach(async ({ page }) => {
    await addBookForE2E(page, bookName)
  })

  test('应该能够进入书籍的阅读视图', async ({ page }) => {
    await page.getByRole('button', { name: '列表视图', exact: true }).click()
    await page.getByRole('button', { name: '开始阅读', exact: true }).click()
    await expect(page.getByRole('heading', { name: `《${bookName}》`, exact: true })).toBeVisible()
  })

  test('应该显示学习阶段列表', async ({ page }) => {
    await page.getByRole('button', { name: '列表视图', exact: true }).click()
    await page.getByRole('button', { name: '开始阅读', exact: true }).click()
    await expect(page.getByRole('button', { name: '阶段学习', exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: '开始深度学习', exact: true })).toBeVisible()
  })
})

test.describe('费曼实践流程', () => {
  const bookName = '费曼实践测试书'

  test.beforeEach(async ({ page }) => {
    await addBookForE2E(page, bookName)
  })

  test('应该能够打开费曼实践面板', async ({ page }) => {
    await page.getByRole('button', { name: '列表视图', exact: true }).click()
    await page.getByRole('button', { name: '开始阅读', exact: true }).click()
    await page.getByRole('button', { name: '费曼实践', exact: true }).click()
    await expect(page.getByRole('heading', { name: '费曼实践', exact: true })).toBeVisible()
    await expect(page.getByText('AI 会分析你的教学实践内容，找出其中的漏洞和不足，然后从不同角色的视角提出针对性的问题')).toBeVisible()
  })
})

test.describe('数据持久化', () => {
  test('添加的书籍应该在刷新后仍然存在', async ({ page }) => {
    await page.goto('/')

    // 添加新书
    const addButton = page.getByRole('button', { name: '添加书籍', exact: true }).first()
    await addButton.click()

    const dialogHeading = page.getByRole('heading', { name: '添加书籍', exact: true })
    await expect(dialogHeading).toBeVisible()

    const bookName = `持久化测试-${Date.now()}`
    await page.getByPlaceholder('输入书名...').fill(bookName)

    const submitButton = page.getByRole('button', { name: '添加', exact: true })
    await submitButton.click()

    await expect(dialogHeading).not.toBeVisible({ timeout: 5000 })

    // 刷新页面
    await page.reload()

    // 验证刷新后书籍仍然存在
    await expect(page.getByRole('heading', { name: bookName, exact: true })).toBeVisible()
  })
})

test.describe('设置影响', () => {
  test('更改语言应该更新界面', async ({ page }) => {
    await page.goto('/')

    // 进入设置
    await page.getByRole('button', { name: '设置', exact: true }).click()
    await page.getByRole('button', { name: 'Switch to English' }).click()
    await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible()
  })

  test('更改主题应该更新界面样式', async ({ page }) => {
    await page.goto('/')

    // 获取当前主题
    const currentTheme = await page.locator('html').getAttribute('data-theme')

    // 进入设置
    await page.getByRole('button', { name: '设置', exact: true }).click()
    await page.getByRole('button', { name: '切换至深色主题' }).click()
    const newTheme = await page.locator('html').getAttribute('data-theme')

    expect(newTheme).toBeTruthy()
    expect(newTheme).not.toBe(currentTheme)
  })
})
