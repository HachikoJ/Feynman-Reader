/** @jest-environment jsdom */

import { act, fireEvent, render, screen } from '@testing-library/react'
import InstantTooltip from '../InstantTooltip'

function renderAnchors() {
  render(
    <>
      <InstantTooltip />
      <button type="button" data-tip="即时提示">操作按钮</button>
      <button type="button" data-tip="第二个提示">第二个按钮</button>
    </>
  )
  return {
    anchor: screen.getByRole('button', { name: '操作按钮' }),
    second: screen.getByRole('button', { name: '第二个按钮' }),
  }
}

describe('InstantTooltip', () => {
  afterEach(() => {
    Reflect.deleteProperty(document, 'elementFromPoint')
  })

  it('shows the tooltip immediately on hover and swaps it between anchors', () => {
    const { anchor, second } = renderAnchors()
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()

    fireEvent.pointerOver(anchor, { pointerType: 'mouse' })

    const tooltip = screen.getByRole('tooltip')
    expect(tooltip).toHaveTextContent('即时提示')
    expect(tooltip.parentElement).toBe(document.body)

    fireEvent.pointerMove(second, { pointerType: 'mouse' })
    expect(screen.getByRole('tooltip')).toHaveTextContent('第二个提示')
  })

  it('hides the tooltip when the pointer leaves the anchor or Escape is pressed', () => {
    const { anchor } = renderAnchors()

    fireEvent.pointerOver(anchor, { pointerType: 'mouse' })
    expect(screen.getByRole('tooltip')).toBeInTheDocument()
    fireEvent.pointerMove(document.body, { pointerType: 'mouse' })
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()

    fireEvent.pointerOver(anchor, { pointerType: 'mouse' })
    expect(screen.getByRole('tooltip')).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('shows the tooltip on keyboard focus', () => {
    const { anchor } = renderAnchors()

    act(() => anchor.focus())
    fireEvent.focusIn(anchor)

    expect(screen.getByRole('tooltip')).toHaveTextContent('即时提示')
  })

  it('keeps the tooltip hidden after a click until the pointer moves away', () => {
    const { anchor } = renderAnchors()

    fireEvent.pointerOver(anchor, { pointerType: 'mouse' })
    expect(screen.getByRole('tooltip')).toBeInTheDocument()

    fireEvent.pointerDown(anchor, { pointerType: 'mouse' })
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()

    fireEvent.pointerMove(anchor, { pointerType: 'mouse' })
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()

    fireEvent.pointerMove(document.body, { pointerType: 'mouse' })
    fireEvent.pointerMove(anchor, { pointerType: 'mouse' })
    expect(screen.getByRole('tooltip')).toHaveTextContent('即时提示')
  })

  it('reveals anchors that swallow pointer events through hit testing', () => {
    render(
      <>
        <InstantTooltip />
        <div data-testid="toolbar">
          <button type="button" disabled data-tip="已禁用提示">已禁用</button>
        </div>
      </>
    )
    const disabled = screen.getByRole('button', { name: '已禁用' })
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      writable: true,
      value: jest.fn(() => disabled),
    })

    fireEvent.pointerMove(screen.getByTestId('toolbar'), {
      pointerType: 'mouse',
      clientX: 40,
      clientY: 40,
    })

    expect(screen.getByRole('tooltip')).toHaveTextContent('已禁用提示')
  })
})
