/** @jest-environment jsdom */

import { fireEvent, render, screen } from '@testing-library/react'
import DataLossWarning from '../DataLossWarning'

describe('DataLossWarning', () => {
  it('does not show data management before the user has learning data', () => {
    render(
      <DataLossWarning
        lang="zh"
        backupDue={false}
        onContinue={jest.fn()}
        onOpenBackup={jest.fn()}
      />
    )

    expect(document.body.textContent).toContain('请先确认本地数据风险')
    expect(document.body.textContent).toContain('当前不提供云端存储、同步或恢复服务')
    expect(document.body.textContent).toContain('平台无法恢复未备份的数据')
    expect(document.body.textContent).toContain('距上次成功备份满 7 天时，系统会再次提醒，但不会自动备份')
    expect((screen.getByRole('checkbox') as HTMLInputElement).disabled).toBe(false)
    expect(screen.queryByRole('button', { name: '前往数据管理' })).toBeNull()
    expect((screen.getByRole('button', { name: '我已了解，继续使用' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('explains the missing confirmation when continue is clicked', () => {
    const onContinue = jest.fn()
    render(
      <DataLossWarning
        lang="zh"
        backupDue={false}
        onContinue={onContinue}
        onOpenBackup={jest.fn()}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: '我已了解，继续使用' }))

    expect(onContinue).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toContain('请先勾选上方确认项')
    expect(document.activeElement).toBe(screen.getByRole('checkbox'))

    fireEvent.click(screen.getByRole('checkbox'))
    expect(screen.queryByRole('alert')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: '我已了解，继续使用' }))
    expect(onContinue).toHaveBeenCalledTimes(1)
  })

  it('explains when the seven-day backup reminder is due', () => {
    render(
      <DataLossWarning
        lang="zh"
        backupDue
        onContinue={jest.fn()}
        onOpenBackup={jest.fn()}
      />
    )

    expect(document.body.textContent).toContain('距离上次备份已超过 7 天')
    expect((screen.getByRole('button', { name: '前往数据管理' }) as HTMLButtonElement).disabled).toBe(false)
  })
})
