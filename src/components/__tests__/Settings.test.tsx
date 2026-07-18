/** @jest-environment jsdom */

import { fireEvent, render, screen, waitFor } from '@testing-library/react'

jest.mock('@/lib/store', () => ({
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

import Settings from '../Settings'
import AppDialogHost from '../AppDialogHost'
import * as store from '@/lib/store'
import type { AppSettings } from '@/lib/store'

const getSettingsMock = store.getSettings as jest.MockedFunction<typeof store.getSettings>
const saveSettingsMock = store.saveSettings as jest.MockedFunction<typeof store.saveSettings>
const savedApiKey = 'sk-1234567890abcdefghijklmnopqrstuv'

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

  it('persists consent withdrawal immediately', async () => {
    const onSettingsChange = jest.fn()
    renderSettings(onSettingsChange)

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

  it('deletes the saved API key and withdraws consent together', async () => {
    const onSettingsChange = jest.fn()
    renderSettings(onSettingsChange)

    fireEvent.change(screen.getByPlaceholderText('sk-...'), { target: { value: '' } })
    expect(screen.getByRole('button', { name: '删除 API Key' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '删除 API Key' }))

    expect(screen.getByRole('heading', { name: '确认删除 API Key' })).toBeInTheDocument()
    expect(saveSettingsMock).not.toHaveBeenCalledWith(expect.objectContaining({ apiKey: '' }))
    fireEvent.click(screen.getByRole('button', { name: '确认删除' }))

    await waitFor(() => {
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

  it('keeps the normal save validation when the API key is empty', () => {
    getSettingsMock.mockReturnValue({ ...savedSettings, apiKey: '', aiDataConsent: false })
    renderSettings()

    fireEvent.click(screen.getByRole('button', { name: '保存设置' }))

    expect(screen.getByRole('alert')).toHaveTextContent('保存失败：请先填写 DeepSeek API Key')
    expect(saveSettingsMock).not.toHaveBeenCalled()
  })

  it('does not show a key or consent reminder when saved configuration is complete', async () => {
    render(
      <>
        <Settings onSettingsChange={jest.fn()} focusApiConfigurationRequest={1} />
        <AppDialogHost lang="zh" />
      </>
    )

    await waitFor(() => {
      expect(screen.getByPlaceholderText('sk-...')).toHaveValue(savedApiKey)
    })
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

  it('shows backup plaintext risk and multipart import guidance in data management', () => {
    renderSettings()

    fireEvent.click(screen.getByRole('button', { name: /数据管理/ }))

    expect(screen.getByText('备份文件未加密：')).toBeInTheDocument()
    expect(document.body.textContent).toContain('数据较大时会自动分卷，导入时需一次选择全部分卷')
    expect(document.body.textContent).toContain('只有确认文件保存成功后才会记录备份时间')

    fireEvent.click(screen.getByRole('button', { name: '导入数据' }))
    const fileInput = document.querySelector('input[type="file"]')
    expect(fileInput).toHaveAttribute('multiple')
    expect(screen.getByRole('button', { name: '选择 JSON 或全部分卷文件' })).toBeInTheDocument()
  })
})
