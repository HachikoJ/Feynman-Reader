/** @jest-environment jsdom */

import { render, screen } from '@testing-library/react'
import ScoreTrendChart from '../ScoreTrendChart'
import type { ProgressRecord } from '@/lib/practiceEnhancement'

function progressRecord(id: string, overall: number, timestamp: number): ProgressRecord {
  return {
    id,
    bookId: 'book-1',
    type: 'teaching',
    timestamp,
    scores: {
      accuracy: overall,
      completeness: overall,
      clarity: overall,
      overall
    },
    passed: overall >= 60
  }
}

describe('ScoreTrendChart', () => {
  it('keeps score labels and markers outside the stretched SVG layer', () => {
    const { container } = render(
      <ScoreTrendChart
        records={[
          progressRecord('first', 83, 1),
          progressRecord('second', 82, 2)
        ]}
        lang="zh"
      />
    )

    const svg = container.querySelector('svg')
    const points = screen.getAllByTestId('score-point')
    const latestLabel = screen.getByTestId('latest-score-label')

    expect(svg).not.toBeNull()
    expect(svg?.querySelector('circle')).toBeNull()
    expect(svg?.querySelector('text')).toBeNull()
    expect(svg?.contains(latestLabel)).toBe(false)
    expect(points).toHaveLength(2)
    expect(points[0]).toHaveStyle({ left: '4%' })
    expect(points[1]).toHaveStyle({ left: '96%' })
    expect(latestLabel).toHaveTextContent('82')
  })
})
