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

    expect(document.body.textContent).toContain('请确认数据保存与迁移规则')
    expect(document.body.textContent).toContain('登录后的新数据保存到账号云端')
    expect(document.body.textContent).toContain('未迁移或未备份的内容无法代为恢复')
    expect(document.body.textContent).toContain('IndexedDB 历史数据只存在于当前浏览器')
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

    expect(document.body.textContent).toContain('距离上次导出已超过 7 天')
    expect((screen.getByRole('button', { name: '前往数据管理' }) as HTMLButtonElement).disabled).toBe(false)
  })
})
