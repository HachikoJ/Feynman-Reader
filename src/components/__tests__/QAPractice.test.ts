import { haveAnswersForUnpassedQuestions, matchEvaluationsToQuestions } from '../QAPractice'
import { QAPracticeRecord } from '@/lib/store'

describe('Q&A submission readiness', () => {
  it('uses original question indexes after passed questions are skipped', () => {
    const questions: QAPracticeRecord['questions'] = [
      { persona: 'elementary', personaName: '初学者', question: '问题一', passed: true, score: 80 },
      { persona: 'professional', personaName: '职场新人', question: '问题二' },
      { persona: 'scientist', personaName: '科学家', question: '问题三' }
    ]

    expect(haveAnswersForUnpassedQuestions(questions, {
      1: '问题二的回答',
      2: '问题三的回答'
    })).toBe(true)
  })

  it('requires an answer for every unpassed question', () => {
    const questions: QAPracticeRecord['questions'] = [
      { persona: 'elementary', personaName: '初学者', question: '问题一', passed: true, score: 80 },
      { persona: 'professional', personaName: '职场新人', question: '问题二' },
      { persona: 'scientist', personaName: '科学家', question: '问题三' }
    ]

    expect(haveAnswersForUnpassedQuestions(questions, { 1: '问题二的回答' })).toBe(false)
  })
})

describe('Q&A evaluation matching', () => {
  it('matches AI evaluations by persona instead of the response order', () => {
    const matches = matchEvaluationsToQuestions(
      [
        { index: 0, persona: 'elementary' },
        { index: 1, persona: 'professional' },
        { index: 2, persona: 'scientist' }
      ],
      [
        { persona: 'scientist', score: 88, review: '第三题点评', passed: true },
        { persona: 'elementary', score: 72, review: '第一题点评', passed: true },
        { persona: 'professional', score: 65, review: '第二题点评', passed: true }
      ]
    )

    expect(matches).toEqual([
      { index: 0, evaluation: expect.objectContaining({ persona: 'elementary', score: 72 }) },
      { index: 1, evaluation: expect.objectContaining({ persona: 'professional', score: 65 }) },
      { index: 2, evaluation: expect.objectContaining({ persona: 'scientist', score: 88 }) }
    ])
  })
})
