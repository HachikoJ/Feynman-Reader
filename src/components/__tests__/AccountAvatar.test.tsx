/** @jest-environment jsdom */

import { fireEvent, render } from '@testing-library/react'
import AccountAvatar from '../AccountAvatar'

describe('account avatar display', () => {
  it('preserves a user image ahead of the Watcha fallback', () => {
    const { container } = render(<AccountAvatar avatarUrl="https://example.test/custom.png" name="读者" watcha />)
    expect(container.querySelector('img')).toHaveAttribute('src', 'https://example.test/custom.png')
  })

  it('uses the Watcha mark for a Watcha account without an image, even with a nickname', () => {
    const { container } = render(<AccountAvatar name="读者" watcha />)
    expect(container.querySelector('img')).toHaveAttribute('src', '/brand/watcha/icon-round.svg')
  })

  it('replaces the anonymous placeholder when the signed-in Watcha profile arrives', () => {
    const { container, rerender } = render(<AccountAvatar watcha />)
    expect(container.querySelector('img')).toHaveAttribute('src', '/brand/watcha/icon-round.svg')

    rerender(<AccountAvatar avatarUrl="https://example.test/watcha-user.png" name="Reader" watcha />)
    expect(container.querySelector('img')).toHaveAttribute('src', 'https://example.test/watcha-user.png')
    expect(container.querySelector('img[src="/brand/watcha/icon-round.svg"]')).toBeNull()
  })

  it('keeps a generic initial for a non-Watcha account', () => {
    const { container } = render(<AccountAvatar name="读者" />)
    expect(container).toHaveTextContent('读')
    expect(container.querySelector('img')).toBeNull()
  })

  it('recovers from an unavailable image and accepts a replacement upload', () => {
    const { container, rerender } = render(<AccountAvatar avatarUrl="https://example.test/expired.png" watcha />)
    fireEvent.error(container.querySelector('img')!)
    expect(container.querySelector('img')).toHaveAttribute('src', '/brand/watcha/icon-round.svg')

    const replacement = 'data:image/png;base64,aGVsbG8='
    rerender(<AccountAvatar avatarUrl={replacement} watcha />)
    expect(container.querySelector('img')).toHaveAttribute('src', replacement)

    rerender(<AccountAvatar watcha />)
    expect(container.querySelector('img')).toHaveAttribute('src', '/brand/watcha/icon-round.svg')
  })
})
