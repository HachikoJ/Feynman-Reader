import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import DataLossWarning from '../DataLossWarning'

describe('DataLossWarning', () => {
  it('renders a forced acknowledgement before either action is available', () => {
    const html = renderToStaticMarkup(
      React.createElement(DataLossWarning, {
        lang: 'zh',
        backupDue: false,
        onContinue: jest.fn(),
        onOpenBackup: jest.fn()
      })
    )

    expect(html).toContain('请先确认本地数据风险')
    expect(html).toContain('当前不提供云端存储、同步或恢复服务')
    expect(html).toContain('平台无法恢复未备份的数据')
    expect(html).toContain('type="checkbox"')
    expect((html.match(/disabled=""/g) || [])).toHaveLength(2)
  })

  it('explains when the seven-day backup reminder is due', () => {
    const html = renderToStaticMarkup(
      React.createElement(DataLossWarning, {
        lang: 'zh',
        backupDue: true,
        onContinue: jest.fn(),
        onOpenBackup: jest.fn()
      })
    )

    expect(html).toContain('距离上次备份已超过 7 天')
  })
})
