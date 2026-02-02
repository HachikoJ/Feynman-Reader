import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright E2E 测试配置
 * 用于端到端测试，覆盖关键用户流程
 */
export default defineConfig({
  testDir: './e2e',

  /* 平行运行测试 */
  fullyParallel: true,

  /* 在 CI 环境失败时禁止重试 */
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,

  /* 并行工作进程数 */
  workers: process.env.CI ? 1 : undefined,

  /* 测试报告配置 */
  reporter: [
    ['html'],
    ['json', { outputFile: 'test-results/e2e-results.json' }],
    ['list']
  ],

  /* 全局设置 */
  use: {
    /* 基础 URL */
    baseURL: 'http://localhost:8080',

    /* 追踪重试（调试时使用） */
    trace: 'on-first-retry',

    /* 截图配置 */
    screenshot: 'only-on-failure',

    /* 视频录制 */
    video: 'retain-on-failure',

    /* 操作超时 */
    actionTimeout: 10 * 1000,
    navigationTimeout: 30 * 1000,
  },

  /* 测试项目配置 */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },

    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },

    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },

    /* 移动端测试 */
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'Mobile Safari',
      use: { ...devices['iPhone 12'] },
    },
  ],

  /* 测试前启动开发服务器 */
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:8080',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
})
