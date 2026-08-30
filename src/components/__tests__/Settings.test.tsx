/** @jest-environment jsdom */

import { fireEvent, render, screen, waitFor } from '@testing-library/react'

jest.mock('qrcode', () => ({
  __esModule: true,
  default: {
    toDataURL: jest.fn(() => Promise.resolve('data:image/png;base64,ZmFrZS1xcg=='))
  }
}))

jest.mock('@/lib/store', () => ({
  SERVER_MANAGED_API_KEY: 'server-managed',
  getBooks: jest.fn(() => []),
  getAIUsageRecords: jest.fn(() => []),
  getAIUsageSummary: jest.fn(() => ({
    requestCount: 0,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    lastUsedAt: null
  })),
  subscribeToAIUsage: jest.fn(() => () => {}),
  getSettings: jest.fn(),
  saveBooks: jest.fn(),
  saveSetting: jest.fn(),
  saveSettings: jest.fn(),
  downloadDataBackup: jest.fn(),
  previewImportBackupFiles: jest.fn(),
  applyImportData: jest.fn(),
  getDataStats: jest.fn(() => ({
    totalBooks: 0,
    totalNotes: 0,
    totalPractices: 0,
    totalQARecords: 0,
    dataSize: '0 B'
  })),
  resetStoreCache: jest.fn(),
  flushPendingStoreWrites: jest.fn(() => Promise.resolve()),
  initializeStore: jest.fn(() => Promise.resolve()),
  reloadBooksFromPersistence: jest.fn(() => Promise.resolve([])),
  reloadSettingsFromPersistence: jest.fn(),
  replaceAIUsageRecords: jest.fn()
}))

jest.mock('@/lib/db', () => ({
  getDatabaseStats: jest.fn(() => new Promise(() => {})),
  migrateFromLocalStorage: jest.fn()
}))

jest.mock('@/lib/deepseek', () => ({
  DEEPSEEK_API_KEY_INVALID: 'DEEPSEEK_API_KEY_INVALID',
  validateDeepSeekApiKey: jest.fn(() => Promise.resolve())
}))

jest.mock('@/lib/tokendance', () => ({
  createTokendanceAuthorizationUrl: jest.fn(),
  exchangeTokendanceCode: jest.fn(),
  fetchTokendanceBalance: jest.fn(),
  createTokendancePaymentSession: jest.fn(),
  getTokendancePaymentSession: jest.fn(() => new Promise(() => {}))
}))

jest.mock('@/lib/accountClient', () => ({
  saveApiKey: jest.fn(() => Promise.resolve()),
  deleteApiKey: jest.fn(() => Promise.resolve())
}))

const mockAccountAccess: {
  user: { id: string } | null
  configured: boolean
  checking: boolean
  isAuthenticated: boolean
  hasSignedInAccount: boolean
  requestLogin: jest.Mock
} = {
  user: { id: 'user-1' },
  configured: true,
  checking: false,
  isAuthenticated: true,
  hasSignedInAccount: true,
  requestLogin: jest.fn()
}

jest.mock('../AuthGuard', () => ({
  useAccountAccess: () => mockAccountAccess
}))

import Settings from '../Settings'
import AppDialogHost from '../AppDialogHost'
import * as store from '@/lib/store'
import * as tokendance from '@/lib/tokendance'
import * as accountClient from '@/lib/accountClient'
import type { AppSettings } from '@/lib/store'

const getSettingsMock = store.getSettings as jest.MockedFunction<typeof store.getSettings>
const saveSettingsMock = store.saveSettings as jest.MockedFunction<typeof store.saveSettings>
const createTokendancePaymentSessionMock = tokendance.createTokendancePaymentSession as jest.MockedFunction<typeof tokendance.createTokendancePaymentSession>
const saveAccountApiKeyMock = accountClient.saveApiKey as jest.MockedFunction<typeof accountClient.saveApiKey>
const deleteAccountApiKeyMock = accountClient.deleteApiKey as jest.MockedFunction<typeof accountClient.deleteApiKey>
const savedApiKey = ['test', 'api', 'key', 'for', 'settings'].join('-')

const savedSettings: AppSettings = {
  apiKey: savedApiKey,
  language: 'zh',
  theme: 'light',
  hideApiKeyAlert: true,
  aiDataConsent: true,
  quotes: [{ text: '测试金句', author: '测试', isPreset: true }],
  quotesInitialized: true
}

describe('Settings AI privacy controls', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockAccountAccess.user = { id: 'user-1' }
    mockAccountAccess.isAuthenticated = true
    mockAccountAccess.hasSignedInAccount = true
    HTMLElement.prototype.scrollIntoView = jest.fn()
    getSettingsMock.mockReturnValue({ ...savedSettings })
    saveSettingsMock.mockImplementation(nextSettings => {
      getSettingsMock.mockReturnValue({ ...nextSettings })
    })
    ;(store.reloadSettingsFromPersistence as jest.MockedFunction<typeof store.reloadSettingsFromPersistence>)
      .mockResolvedValue({ ...savedSettings })
  })

  const renderSettings = (onSettingsChange = jest.fn()) => render(
    <>
      <Settings onSettingsChange={onSettingsChange} />
      <AppDialogHost lang="zh" />
    </>
  )

  it('requires Watcha sign-in before showing API configuration controls', async () => {
    mockAccountAccess.user = null
    mockAccountAccess.isAuthenticated = false
    mockAccountAccess.hasSignedInAccount = false
    getSettingsMock.mockReturnValue({ ...savedSettings, apiKey: '', aiDataConsent: false, aiProvider: 'tokendance' })

    renderSettings()

    expect(await screen.findByText('先使用观猹登录，再配置 TokenDance')).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('TokenDance API Key')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '使用观猹登录' }))
    expect(mockAccountAccess.requestLogin).toHaveBeenCalledWith(expect.stringContaining('请先使用观猹登录'))
    expect(saveAccountApiKeyMock).not.toHaveBeenCalled()
  })

  it('saves a new TokenDance key to the signed-in account vault', async () => {
    const onSettingsChange = jest.fn()
    getSettingsMock.mockReturnValue({ ...savedSettings, apiKey: '', aiDataConsent: true, aiProvider: 'tokendance' })
    renderSettings(onSettingsChange)

    fireEvent.change(await screen.findByPlaceholderText('TokenDance API Key'), { target: { value: savedApiKey } })
    fireEvent.click(screen.getByRole('button', { name: '验证并启用 AI' }))

    await waitFor(() => expect(saveAccountApiKeyMock).toHaveBeenCalledWith(savedApiKey))
    expect(saveSettingsMock).toHaveBeenCalledWith(expect.objectContaining({ apiKey: '', aiDataConsent: true }))
    expect(onSettingsChange).toHaveBeenCalledWith(expect.objectContaining({ apiKey: 'server-managed', aiDataConsent: true }))
  })

  it('persists consent withdrawal immediately', async () => {
    const onSettingsChange = jest.fn()
    renderSettings(onSettingsChange)
    fireEvent.click(screen.getByRole('button', { name: '管理连接' }))

    fireEvent.click(screen.getByRole('checkbox'))

    await waitFor(() => {
      expect(saveSettingsMock).toHaveBeenCalledWith(expect.objectContaining({
        apiKey: savedApiKey,
        aiDataConsent: false
      }))
    })
    expect(screen.getByRole('status')).toHaveTextContent('AI 数据传输同意已撤回')
    expect(onSettingsChange).toHaveBeenCalledWith(expect.objectContaining({ aiDataConsent: false }))
  })

  it('keeps consent acceptance in the draft until the API key is saved', async () => {
    getSettingsMock.mockReturnValue({ ...savedSettings, apiKey: '', aiDataConsent: false })
    renderSettings()

    await waitFor(() => expect(screen.getByPlaceholderText('sk-...')).toBeInTheDocument())
    saveSettingsMock.mockClear()

    fireEvent.change(screen.getByPlaceholderText('sk-...'), { target: { value: savedApiKey } })
    fireEvent.click(screen.getByRole('checkbox'))
    const policy = screen.getByRole('dialog', { name: '隐私政策' })
    const scrollContainer = policy.querySelector('[class*="overflow-y-auto"]') as HTMLElement
    Object.defineProperty(scrollContainer, 'scrollHeight', { configurable: true, value: 100 })
    Object.defineProperty(scrollContainer, 'clientHeight', { configurable: true, value: 100 })
    fireEvent.scroll(scrollContainer)
    fireEvent.click(screen.getByRole('button', { name: '已阅读并同意' }))

    await waitFor(() => expect(screen.queryByRole('dialog', { name: '隐私政策' })).not.toBeInTheDocument())
    expect(saveSettingsMock).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: '保存设置' }))
    await waitFor(() => {
      expect(saveSettingsMock).toHaveBeenCalledWith(expect.objectContaining({
        apiKey: savedApiKey,
        aiDataConsent: true
      }))
    })
  })

  it('deletes the saved API key and withdraws consent together', async () => {
    const onSettingsChange = jest.fn()
    getSettingsMock.mockReturnValue({ ...savedSettings, aiProvider: 'tokendance' })
    renderSettings(onSettingsChange)
    fireEvent.click(screen.getByRole('button', { name: '管理连接' }))

    fireEvent.change(screen.getByPlaceholderText('TokenDance API Key'), { target: { value: '' } })
    expect(screen.getByRole('button', { name: '删除 API Key' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '删除 API Key' }))

    expect(screen.getByRole('heading', { name: '确认删除 API Key' })).toBeInTheDocument()
    expect(saveSettingsMock).not.toHaveBeenCalledWith(expect.objectContaining({ apiKey: '' }))
    fireEvent.click(screen.getByRole('button', { name: '确认删除' }))

    await waitFor(() => {
      expect(deleteAccountApiKeyMock).toHaveBeenCalledTimes(1)
      expect(saveSettingsMock).toHaveBeenCalledWith(expect.objectContaining({
        apiKey: '',
        aiDataConsent: false,
        hideApiKeyAlert: false
      }))
    })
    expect(screen.getByRole('status')).toHaveTextContent('API Key 已删除')
    expect(screen.queryByRole('button', { name: '删除 API Key' })).not.toBeInTheDocument()
    expect(onSettingsChange).toHaveBeenCalledWith(expect.objectContaining({ apiKey: '', aiDataConsent: false }))
  })

  it('keeps the normal save validation when the API key is empty', async () => {
    getSettingsMock.mockReturnValue({ ...savedSettings, apiKey: '', aiDataConsent: false })
    renderSettings()

    await waitFor(() => expect(screen.getByPlaceholderText('sk-...')).toBeInTheDocument())
    saveSettingsMock.mockClear()

    fireEvent.click(screen.getByRole('button', { name: '保存设置' }))

    expect(screen.getByRole('alert')).toHaveTextContent('保存失败：请先填写 DeepSeek API Key')
    expect(saveSettingsMock).not.toHaveBeenCalled()
  })

  it('does not show a key or consent reminder when saved configuration is complete', async () => {
    getSettingsMock.mockReturnValue({ ...savedSettings, aiProvider: 'tokendance' })
    render(
      <>
        <Settings onSettingsChange={jest.fn()} />
        <AppDialogHost lang="zh" />
      </>
    )

    await waitFor(() => {
      expect(screen.getByText('TokenDance 合作接入已连接')).toBeInTheDocument()
    })
    expect(screen.queryByPlaceholderText('TokenDance API Key')).not.toBeInTheDocument()
    expect(screen.queryByText('请先填写 DeepSeek API Key，并在勾选同意后保存。')).not.toBeInTheDocument()
    expect(screen.queryByText('使用 AI 功能前，请先确认 AI 数据传输同意。')).not.toBeInTheDocument()
  })

  it('still shows the configuration reminder when no key has been saved', async () => {
    getSettingsMock.mockReturnValue({ ...savedSettings, apiKey: '', aiDataConsent: false })
    render(
      <>
        <Settings onSettingsChange={jest.fn()} focusApiConfigurationRequest={1} />
        <AppDialogHost lang="zh" />
      </>
    )

    expect(await screen.findByRole('alert')).toHaveTextContent('请先填写 DeepSeek API Key，并在勾选同意后保存。')
  })

  it('uses the English DeepSeek provider name in English mode', async () => {
    getSettingsMock.mockReturnValue({ ...savedSettings, language: 'en' })
    renderSettings()
    expect(await screen.findByText('DeepSeek Official API connected')).toBeInTheDocument()
    fireEvent.click(await screen.findByRole('button', { name: 'Manage connection' }))

    expect(await screen.findByText('DeepSeek Official API')).toBeInTheDocument()
    expect(screen.queryByText('DeepSeek 官方 API')).not.toBeInTheDocument()
  })

  it('does not expose TokenDance top-up until the key and consent are persisted', async () => {
    getSettingsMock.mockReturnValue({ ...savedSettings, apiKey: '', aiDataConsent: false, aiProvider: 'tokendance' })
    renderSettings()

    await waitFor(() => expect(screen.getByPlaceholderText('TokenDance API Key')).toBeInTheDocument())
    fireEvent.change(screen.getByPlaceholderText('TokenDance API Key'), { target: { value: savedApiKey } })

    expect(screen.queryByText('TokenDance 账户')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '创建充值会话' })).not.toBeInTheDocument()
  })

  it('explains the limited-time TokenDance discount with live pricing details', async () => {
    getSettingsMock.mockReturnValue({ ...savedSettings, apiKey: '', aiDataConsent: false, aiProvider: 'tokendance' })

    render(<Settings onSettingsChange={jest.fn()} />)

    await waitFor(() => expect(screen.getByText(/峰时路由到火山方舟端口，最高约省 20%/)).toBeInTheDocument())
    expect(screen.getByText(/适用线路、价格、时段和活动期限/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '查看 V4 Flash 实时价目' })).toHaveAttribute('href', 'https://tokendance.space/models/deepseek-v4-flash-0731')
    expect(screen.queryByText(/向作者分润/)).not.toBeInTheDocument()
    expect(screen.queryByText(/新分析所需的书籍信息/)).not.toBeInTheDocument()
    expect(screen.queryByText(/完整 Key 只在授权交换时返回/)).not.toBeInTheDocument()
  })

  it('keeps desktop users in settings and renders a payment QR session', async () => {
    getSettingsMock.mockReturnValue({ ...savedSettings, aiProvider: 'tokendance' })
    createTokendancePaymentSessionMock.mockResolvedValue({
      id: 'payment-1',
      amount: 10,
      status: 'pending',
      payment_url: 'https://pay.example.com/session-1',
      status_url: 'https://tokendance.space/portal/api/v1/payment/sessions/payment-1',
      expired_at: 1_900_000_000
    })
    const openSpy = jest.spyOn(window, 'open').mockImplementation(() => null)
    renderSettings()

    fireEvent.click(await screen.findByRole('button', { name: '管理连接' }))
    fireEvent.click(await screen.findByRole('button', { name: '创建充值会话' }))

    expect(await screen.findByText('充值状态：等待支付')).toBeInTheDocument()
    expect(screen.getByText('请使用手机扫描二维码完成支付，本页面会自动刷新到账状态。')).toBeInTheDocument()
    expect(await screen.findByRole('img', { name: 'TokenDance 充值支付二维码' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '打开支付页' })).toHaveAttribute('href', 'https://pay.example.com/session-1')
    expect(openSpy).not.toHaveBeenCalled()
    openSpy.mockRestore()
  })

  it('highlights a received top-up and confirms the balance update', async () => {
    getSettingsMock.mockReturnValue({ ...savedSettings, aiProvider: 'tokendance' })
    createTokendancePaymentSessionMock.mockResolvedValue({
      id: 'payment-paid',
      amount: 20,
      status: 'paid',
      payment_url: 'https://pay.example.com/session-paid',
      status_url: 'https://tokendance.space/portal/api/v1/payment/sessions/payment-paid',
      expired_at: 1_900_000_000
    })
    renderSettings()

    fireEvent.click(await screen.findByRole('button', { name: '管理连接' }))
    fireEvent.click(await screen.findByRole('button', { name: '创建充值会话' }))

    expect(await screen.findByText('充值已到账')).toBeInTheDocument()
    expect(screen.getByText('充值金额 ¥20 已到账，余额已更新。')).toBeInTheDocument()
  })

  it('shows direct support contact when a top-up fails', async () => {
    getSettingsMock.mockReturnValue({ ...savedSettings, aiProvider: 'tokendance' })
    createTokendancePaymentSessionMock.mockResolvedValue({
      id: 'payment-failed',
      amount: 10,
      status: 'failed',
      payment_url: 'https://pay.example.com/session-failed',
      status_url: 'https://tokendance.space/portal/api/v1/payment/sessions/payment-failed',
      expired_at: 1_900_000_000
    })
    renderSettings()

    fireEvent.click(await screen.findByRole('button', { name: '管理连接' }))
    fireEvent.click(await screen.findByRole('button', { name: '创建充值会话' }))

    expect(await screen.findByText('充值失败')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '联系客服：18682408521@163.com' })).toHaveAttribute('href', 'mailto:18682408521@163.com')
    expect(screen.getByText('微信：hostrow')).toBeInTheDocument()
  })

  it('moves data management to the account center', () => {
    renderSettings()

    expect(screen.getByRole('link', { name: '账号中心 · 云端数据与历史迁移' })).toHaveAttribute('href', '/account?tab=data')
    expect(screen.queryByRole('dialog', { name: '数据管理' })).not.toBeInTheDocument()
  })
})

describe('Settings quote manager', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockAccountAccess.user = { id: 'user-1' }
    mockAccountAccess.isAuthenticated = true
    mockAccountAccess.hasSignedInAccount = true
    HTMLElement.prototype.scrollIntoView = jest.fn()
    getSettingsMock.mockReturnValue({ ...savedSettings })
    saveSettingsMock.mockImplementation(nextSettings => {
      getSettingsMock.mockReturnValue({ ...nextSettings })
    })
    ;(store.reloadSettingsFromPersistence as jest.MockedFunction<typeof store.reloadSettingsFromPersistence>)
      .mockResolvedValue({ ...savedSettings })
  })

  it('moves quote management to the account center', async () => {
    render(
      <>
        <Settings onSettingsChange={jest.fn()} />
        <AppDialogHost lang="zh" />
      </>
    )

    expect(await screen.findByRole('link', { name: '账号中心 · 云端数据与历史迁移' })).toHaveAttribute('href', '/account?tab=data')
    expect(screen.queryByRole('dialog', { name: '金句管理' })).not.toBeInTheDocument()
  })
})
