'use client'

import { useState, useEffect } from 'react'
import { Language } from '@/lib/i18n'
import { Theme } from '@/lib/store'
import {
  PersonalizationConfig,
  defaultPersonalizationConfig,
  loadPersonalization,
  savePersonalization,
  resetPersonalization,
  applyTheme,
  applyFontSize,
  applyAccessibilitySettings,
  presetThemes,
  createCustomTheme,
  generateColorScheme,
  validateThemeColor,
  fontSizes
} from '@/lib/personalization'

interface PersonalizationPanelProps {
  lang: Language
  onClose?: () => void
}

type Tab = 'theme' | 'layout' | 'learning' | 'shortcuts' | 'accessibility'

export default function PersonalizationPanel({ lang, onClose }: PersonalizationPanelProps) {
  const [config, setConfig] = useState<PersonalizationConfig>(defaultPersonalizationConfig)
  const [activeTab, setActiveTab] = useState<Tab>('theme')
  const [customAccent, setCustomAccent] = useState('#ff006e')
  const [previewTheme, setPreviewTheme] = useState<Theme | 'custom'>('cyber')

  useEffect(() => {
    const saved = loadPersonalization()
    setConfig(saved)
  }, [])

  const t = {
    zh: {
      title: '个性化设置',
      close: '关闭',
      save: '保存',
      reset: '重置',
      tabs: {
        theme: '主题',
        layout: '布局',
        learning: '学习偏好',
        shortcuts: '快捷键',
        accessibility: '无障碍'
      },
      theme: {
        title: '主题设置',
        preset: '预设主题',
        custom: '自定义主题',
        accentColor: '强调色',
        apply: '应用',
        fontSize: '字体大小',
        fontSizes: {
          small: '小',
          medium: '中',
          large: '大',
          'extra-large': '特大'
        }
      },
      layout: {
        title: '布局设置',
        density: '界面密度',
        densityOptions: {
          comfortable: '舒适',
          compact: '紧凑',
          spacious: '宽松'
        },
        cardSize: '卡片大小',
        cardSizes: {
          small: '小卡片',
          medium: '中卡片',
          large: '大卡片'
        },
        itemsPerRow: '每行显示',
        showStats: '显示统计信息',
        showProgress: '显示阅读进度',
        showQuickActions: '显示快捷操作'
      },
      learning: {
        title: '学习偏好',
        phaseMode: '阶段模式',
        phaseModes: {
          guided: '引导式',
          free: '自由式'
        },
        autoSave: '自动保存间隔（分钟）',
        remindReadingTime: '阅读提醒',
        readingGoal: '每日阅读目标（分钟）',
        remindPractice: '练习提醒',
        showQuotes: '显示励志金句',
        celebration: '完成庆祝动画'
      },
      shortcuts: {
        title: '快捷键设置',
        toggleSidebar: '切换侧边栏',
        quickAdd: '快速添加',
        search: '搜索',
        settings: '设置',
        undo: '撤销',
        redo: '重做'
      },
      accessibility: {
        title: '无障碍设置',
        reducedMotion: '减少动画',
        highContrast: '高对比度',
        fontSize: '字体大小'
      },
      saved: '设置已保存',
      resetConfirm: '设置已重置'
    },
    en: {
      title: 'Personalization',
      close: 'Close',
      save: 'Save',
      reset: 'Reset',
      tabs: {
        theme: 'Theme',
        layout: 'Layout',
        learning: 'Learning',
        shortcuts: 'Shortcuts',
        accessibility: 'Accessibility'
      },
      theme: {
        title: 'Theme Settings',
        preset: 'Preset Themes',
        custom: 'Custom Theme',
        accentColor: 'Accent Color',
        apply: 'Apply',
        fontSize: 'Font Size',
        fontSizes: {
          small: 'Small',
          medium: 'Medium',
          large: 'Large',
          'extra-large': 'Extra Large'
        }
      },
      layout: {
        title: 'Layout Settings',
        density: 'Interface Density',
        densityOptions: {
          comfortable: 'Comfortable',
          compact: 'Compact',
          spacious: 'Spacious'
        },
        cardSize: 'Card Size',
        cardSizes: {
          small: 'Small',
          medium: 'Medium',
          large: 'Large'
        },
        itemsPerRow: 'Items Per Row',
        showStats: 'Show Statistics',
        showProgress: 'Show Progress',
        showQuickActions: 'Show Quick Actions'
      },
      learning: {
        title: 'Learning Preferences',
        phaseMode: 'Phase Mode',
        phaseModes: {
          guided: 'Guided',
          free: 'Free'
        },
        autoSave: 'Auto Save Interval (min)',
        remindReadingTime: 'Reading Reminder',
        readingGoal: 'Daily Reading Goal (min)',
        remindPractice: 'Practice Reminder',
        showQuotes: 'Show Quotes',
        celebration: 'Completion Celebration'
      },
      shortcuts: {
        title: 'Keyboard Shortcuts',
        toggleSidebar: 'Toggle Sidebar',
        quickAdd: 'Quick Add',
        search: 'Search',
        settings: 'Settings',
        undo: 'Undo',
        redo: 'Redo'
      },
      accessibility: {
        title: 'Accessibility',
        reducedMotion: 'Reduce Motion',
        highContrast: 'High Contrast',
        fontSize: 'Font Size'
      },
      saved: 'Settings saved',
      resetConfirm: 'Settings reset'
    }
  }

  const text = t[lang]

  const handleSave = () => {
    savePersonalization(config)
    // 应用设置
    if (config.customTheme) {
      applyTheme(config.customTheme)
    }
    applyAccessibilitySettings({
      reducedMotion: config.reducedMotion,
      highContrast: config.highContrast,
      fontSize: config.fontSize
    })
    alert(text.saved)
    onClose?.()
  }

  const handleReset = () => {
    if (confirm(lang === 'zh' ? '确定要重置所有设置吗？' : 'Reset all settings?')) {
      resetPersonalization()
      setConfig(defaultPersonalizationConfig)
      setPreviewTheme('cyber')
      alert(text.resetConfirm)
    }
  }

  const handleThemeChange = (theme: Theme) => {
    setPreviewTheme(theme)
    applyTheme(theme)
  }

  const handleCustomThemeApply = () => {
    if (!validateThemeColor(customAccent)) {
      alert(lang === 'zh' ? '颜色格式不正确' : 'Invalid color format')
      return
    }

    const colorScheme = generateColorScheme(customAccent)
    const customTheme = createCustomTheme('dark', {
      displayName: 'Custom',
      colors: {
        ...colorScheme,
        accent: customAccent
      }
    })

    setConfig({ ...config, customTheme })
    setPreviewTheme('custom')
    applyTheme(customTheme)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-[var(--bg-primary)] rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-[var(--border)]">
          <h2 className="text-xl font-bold text-[var(--text-primary)]">{text.title}</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-[var(--bg-secondary)] rounded-lg transition-colors"
          >
            ✕
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar Tabs */}
          <div className="w-48 border-r border-[var(--border)] p-4">
            <nav className="space-y-1">
              {(Object.keys(text.tabs) as Tab[]).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`w-full px-4 py-2 rounded-lg text-left transition-colors ${
                    activeTab === tab
                      ? 'bg-[var(--accent)] text-white'
                      : 'text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]'
                  }`}
                >
                  {text.tabs[tab]}
                </button>
              ))}
            </nav>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {activeTab === 'theme' && (
              <div className="space-y-6">
                <h3 className="text-lg font-medium text-[var(--text-primary)]">{text.theme.title}</h3>

                {/* 预设主题 */}
                <div>
                  <label className="block text-sm font-medium text-[var(--text-secondary)] mb-3">
                    {text.theme.preset}
                  </label>
                  <div className="grid grid-cols-3 gap-3">
                    {(Object.keys(presetThemes) as Theme[]).map((theme) => (
                      <button
                        key={theme}
                        onClick={() => handleThemeChange(theme)}
                        className={`p-4 rounded-xl border-2 transition-all ${
                          previewTheme === theme
                            ? 'border-[var(--accent)] scale-105'
                            : 'border-[var(--border)] hover:border-[var(--text-secondary)]'
                        }`}
                        style={{
                          background: presetThemes[theme].colors.background,
                          borderColor: previewTheme === theme ? presetThemes[theme].colors.accent : undefined
                        }}
                      >
                        <div className="text-sm font-medium mb-2" style={{ color: presetThemes[theme].colors.text }}>
                          {presetThemes[theme].displayName}
                        </div>
                        <div className="flex gap-1">
                          {Object.values(presetThemes[theme].colors).slice(0, 5).map((color, i) => (
                            <div
                              key={i}
                              className="w-4 h-4 rounded-full"
                              style={{ backgroundColor: color }}
                            />
                          ))}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* 自定义主题 */}
                <div className="p-4 bg-[var(--bg-secondary)] rounded-xl">
                  <label className="block text-sm font-medium text-[var(--text-secondary)] mb-3">
                    {text.theme.custom}
                  </label>
                  <div className="flex items-center gap-4">
                    <input
                      type="color"
                      value={customAccent}
                      onChange={(e) => setCustomAccent(e.target.value)}
                      className="w-12 h-12 rounded cursor-pointer"
                    />
                    <input
                      type="text"
                      value={customAccent}
                      onChange={(e) => setCustomAccent(e.target.value)}
                      placeholder="#ff006e"
                      className="flex-1 px-4 py-2 bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg text-[var(--text-primary)]"
                    />
                    <button
                      onClick={handleCustomThemeApply}
                      className="px-4 py-2 bg-[var(--accent)] text-white rounded-lg hover:opacity-90"
                    >
                      {text.theme.apply}
                    </button>
                  </div>
                </div>

                {/* 字体大小 */}
                <div>
                  <label className="block text-sm font-medium text-[var(--text-secondary)] mb-3">
                    {text.theme.fontSize}
                  </label>
                  <div className="flex gap-2">
                    {(Object.keys(fontSizes) as Array<keyof typeof fontSizes>).map((size) => (
                      <button
                        key={size}
                        onClick={() => {
                          const newConfig = { ...config, fontSize: size }
                          setConfig(newConfig)
                          applyFontSize(size)
                        }}
                        className={`px-4 py-2 rounded-lg transition-colors ${
                          config.fontSize === size
                            ? 'bg-[var(--accent)] text-white'
                            : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)]'
                        }`}
                      >
                        {text.theme.fontSizes[size]}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'layout' && (
              <div className="space-y-6">
                <h3 className="text-lg font-medium text-[var(--text-primary)]">{text.layout.title}</h3>

                {/* 界面密度 */}
                <div>
                  <label className="block text-sm font-medium text-[var(--text-secondary)] mb-3">
                    {text.layout.density}
                  </label>
                  <div className="flex gap-2">
                    {(Object.keys(text.layout.densityOptions) as Array<keyof typeof text.layout.densityOptions>).map((density) => (
                      <button
                        key={density}
                        onClick={() => setConfig({ ...config, layout: { ...config.layout, density } })}
                        className={`px-4 py-2 rounded-lg transition-colors ${
                          config.layout.density === density
                            ? 'bg-[var(--accent)] text-white'
                            : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)]'
                        }`}
                      >
                        {text.layout.densityOptions[density]}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 卡片大小 */}
                <div>
                  <label className="block text-sm font-medium text-[var(--text-secondary)] mb-3">
                    {text.layout.cardSize}
                  </label>
                  <div className="flex gap-2">
                    {(Object.keys(text.layout.cardSizes) as Array<keyof typeof text.layout.cardSizes>).map((size) => (
                      <button
                        key={size}
                        onClick={() => setConfig({ ...config, layout: { ...config.layout, cardSize: size } })}
                        className={`px-4 py-2 rounded-lg transition-colors ${
                          config.layout.cardSize === size
                            ? 'bg-[var(--accent)] text-white'
                            : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)]'
                        }`}
                      >
                        {text.layout.cardSizes[size]}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 显示选项 */}
                <div className="space-y-3">
                  <label className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={config.layout.showBookshelfStats}
                      onChange={(e) => setConfig({
                        ...config,
                        layout: { ...config.layout, showBookshelfStats: e.target.checked }
                      })}
                      className="w-5 h-5 rounded"
                    />
                    <span className="text-[var(--text-primary)]">{text.layout.showStats}</span>
                  </label>

                  <label className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={config.layout.showReadingProgress}
                      onChange={(e) => setConfig({
                        ...config,
                        layout: { ...config.layout, showReadingProgress: e.target.checked }
                      })}
                      className="w-5 h-5 rounded"
                    />
                    <span className="text-[var(--text-primary)]">{text.layout.showProgress}</span>
                  </label>

                  <label className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={config.layout.showQuickActions}
                      onChange={(e) => setConfig({
                        ...config,
                        layout: { ...config.layout, showQuickActions: e.target.checked }
                      })}
                      className="w-5 h-5 rounded"
                    />
                    <span className="text-[var(--text-primary)]">{text.layout.showQuickActions}</span>
                  </label>
                </div>
              </div>
            )}

            {activeTab === 'learning' && (
              <div className="space-y-6">
                <h3 className="text-lg font-medium text-[var(--text-primary)]">{text.learning.title}</h3>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
                      {text.learning.phaseMode}
                    </label>
                    <select
                      value={config.learning.defaultPhaseMode}
                      onChange={(e) => setConfig({
                        ...config,
                        learning: { ...config.learning, defaultPhaseMode: e.target.value as 'guided' | 'free' }
                      })}
                      className="w-full px-4 py-2 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg text-[var(--text-primary)]"
                    >
                      <option value="guided">{text.learning.phaseModes.guided}</option>
                      <option value="free">{text.learning.phaseModes.free}</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
                      {text.learning.autoSave}
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={60}
                      value={config.learning.autoSaveInterval}
                      onChange={(e) => setConfig({
                        ...config,
                        learning: { ...config.learning, autoSaveInterval: parseInt(e.target.value) || 1 }
                      })}
                      className="w-full px-4 py-2 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg text-[var(--text-primary)]"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
                      {text.learning.readingGoal}
                    </label>
                    <input
                      type="number"
                      min={5}
                      max={240}
                      step={5}
                      value={config.learning.readingTimeGoal}
                      onChange={(e) => setConfig({
                        ...config,
                        learning: { ...config.learning, readingTimeGoal: parseInt(e.target.value) || 30 }
                      })}
                      className="w-full px-4 py-2 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg text-[var(--text-primary)]"
                    />
                  </div>

                  <div className="space-y-3">
                    <label className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={config.learning.remindReadingTime}
                        onChange={(e) => setConfig({
                          ...config,
                          learning: { ...config.learning, remindReadingTime: e.target.checked }
                        })}
                        className="w-5 h-5 rounded"
                      />
                      <span className="text-[var(--text-primary)]">{text.learning.remindReadingTime}</span>
                    </label>

                    <label className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={config.learning.remindPractice}
                        onChange={(e) => setConfig({
                          ...config,
                          learning: { ...config.learning, remindPractice: e.target.checked }
                        })}
                        className="w-5 h-5 rounded"
                      />
                      <span className="text-[var(--text-primary)]">{text.learning.remindPractice}</span>
                    </label>

                    <label className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={config.learning.showMotivationalQuotes}
                        onChange={(e) => setConfig({
                          ...config,
                          learning: { ...config.learning, showMotivationalQuotes: e.target.checked }
                        })}
                        className="w-5 h-5 rounded"
                      />
                      <span className="text-[var(--text-primary)]">{text.learning.showQuotes}</span>
                    </label>

                    <label className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={config.learning.completionCelebration}
                        onChange={(e) => setConfig({
                          ...config,
                          learning: { ...config.learning, completionCelebration: e.target.checked }
                        })}
                        className="w-5 h-5 rounded"
                      />
                      <span className="text-[var(--text-primary)]">{text.learning.celebration}</span>
                    </label>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'shortcuts' && (
              <div className="space-y-6">
                <h3 className="text-lg font-medium text-[var(--text-primary)]">{text.shortcuts.title}</h3>

                <div className="space-y-3">
                  {Object.entries(text.shortcuts).filter(([key]) => key !== 'title').map(([key, label]) => (
                    <div key={key} className="flex items-center justify-between p-3 bg-[var(--bg-secondary)] rounded-lg">
                      <span className="text-[var(--text-primary)]">{label}</span>
                      <kbd className="px-3 py-1 bg-[var(--bg-primary)] border border-[var(--border)] rounded text-sm font-mono text-[var(--text-secondary)]">
                        {config.shortcuts[key as keyof typeof config.shortcuts]}
                      </kbd>
                    </div>
                  ))}
                </div>

                <p className="text-sm text-[var(--text-secondary)]">
                  {lang === 'zh'
                    ? '提示: 快捷键中的 "Mod" 代表 Ctrl (Windows/Linux) 或 Cmd (Mac)'
                    : 'Tip: "Mod" stands for Ctrl (Windows/Linux) or Cmd (Mac)'}
                </p>
              </div>
            )}

            {activeTab === 'accessibility' && (
              <div className="space-y-6">
                <h3 className="text-lg font-medium text-[var(--text-primary)]">{text.accessibility.title}</h3>

                <div className="space-y-4">
                  <label className="flex items-center justify-between p-4 bg-[var(--bg-secondary)] rounded-lg">
                    <span className="text-[var(--text-primary)]">{text.accessibility.reducedMotion}</span>
                    <input
                      type="checkbox"
                      checked={config.reducedMotion}
                      onChange={(e) => {
                        const newConfig = { ...config, reducedMotion: e.target.checked }
                        setConfig(newConfig)
                        applyAccessibilitySettings(newConfig)
                      }}
                      className="w-6 h-6 rounded"
                    />
                  </label>

                  <label className="flex items-center justify-between p-4 bg-[var(--bg-secondary)] rounded-lg">
                    <span className="text-[var(--text-primary)]">{text.accessibility.highContrast}</span>
                    <input
                      type="checkbox"
                      checked={config.highContrast}
                      onChange={(e) => {
                        const newConfig = { ...config, highContrast: e.target.checked }
                        setConfig(newConfig)
                        applyAccessibilitySettings(newConfig)
                      }}
                      className="w-6 h-6 rounded"
                    />
                  </label>

                  <div className="p-4 bg-[var(--bg-secondary)] rounded-lg">
                    <span className="block text-[var(--text-primary)] mb-3">{text.accessibility.fontSize}</span>
                    <div className="flex gap-2">
                      {(Object.keys(fontSizes) as Array<keyof typeof fontSizes>).map((size) => (
                        <button
                          key={size}
                          onClick={() => {
                            const newConfig = { ...config, fontSize: size }
                            setConfig(newConfig)
                            applyAccessibilitySettings(newConfig)
                          }}
                          className={`px-4 py-2 rounded-lg transition-colors ${
                            config.fontSize === size
                              ? 'bg-[var(--accent)] text-white'
                              : 'bg-[var(--bg-primary)] text-[var(--text-secondary)]'
                          }`}
                        >
                          {text.theme.fontSizes[size]}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-[var(--border)]">
          <button
            onClick={handleReset}
            className="px-4 py-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          >
            {text.reset}
          </button>
          <button
            onClick={handleSave}
            className="px-6 py-2 bg-[var(--accent)] text-white rounded-lg hover:opacity-90 transition-opacity"
          >
            {text.save}
          </button>
        </div>
      </div>
    </div>
  )
}
