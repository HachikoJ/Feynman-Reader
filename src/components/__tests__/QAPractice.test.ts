import {
  appendQuestionAttempt,
  getBestPassedTeachingContent,
  getQuestionAttempts,
  haveAnswersForUnpassedQuestions,
  matchEvaluationsToQuestions,
  normalizePersonaSelection,
  selectActiveQARecord
} from '../QAPractice'
import { PracticeRecord, QAPracticeRecord } from '@/lib/store'

describe('Q&A persona selection', () => {
  it('always builds exactly three unique valid personas', () => {
    expect(normalizePersonaSelection([])).toEqual(['elementary', 'professional', 'scientist'])
    expect(normalizePersonaSelection(['teacher'])).toEqual(['teacher', 'elementary', 'professional'])
    expect(normalizePersonaSelection(['teacher', 'teacher', 'invalid'])).toEqual([
      'teacher',
      'elementary',
      'professional'
    ])
    expect(normalizePersonaSelection(['teacher', 'investor', 'user', 'scientist'])).toEqual([
      'teacher',
      'investor',
      'user'
    ])
  })
})

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

describe('Q&A answer history', () => {
  const question: QAPracticeRecord['questions'][number] = {
    persona: 'elementary',
    personaName: '初学者',
    question: '请解释这个概念'
  }

  it('keeps a failed answer after a later answer passes', () => {
    const failed = appendQuestionAttempt(question, '第一次回答', {
      score: 40,
      review: '缺少关键概念'
    }, 10)
    const passed = appendQuestionAttempt(failed, '第二次回答', {
      score: 80,
      review: '解释完整'
    }, 20)

    expect(passed).toMatchObject({
      userAnswer: '第二次回答',
      score: 80,
      passed: true
    })
    expect(getQuestionAttempts(passed)).toEqual([
      expect.objectContaining({ userAnswer: '第一次回答', score: 40, passed: false }),
      expect.objectContaining({ userAnswer: '第二次回答', score: 80, passed: true })
    ])
  })

  it('derives pass state from the score instead of trusting an AI flag', () => {
    const result = appendQuestionAttempt(question, '回答', {
      score: 59,
      review: '仍需补充'
    }, 10)

    expect(result.passed).toBe(false)
    expect(result.attempts?.[0].passed).toBe(false)
  })

  it('converts a legacy latest answer into one history entry', () => {
    expect(getQuestionAttempts({
      ...question,
      userAnswer: '旧回答',
      answeredAt: 10,
      aiReview: '旧点评',
      score: 70,
      passed: false,
      reviewedAt: 11
    })).toEqual([
      expect.objectContaining({ userAnswer: '旧回答', score: 70, passed: true })
    ])
  })

  it('keeps only the latest fifty attempts', () => {
    let updated = question
    for (let index = 0; index < 51; index += 1) {
      updated = appendQuestionAttempt(updated, `回答 ${index}`, {
        score: index,
        review: `点评 ${index}`
      }, index)
    }

    expect(updated.attempts).toHaveLength(50)
    expect(updated.attempts?.[0].userAnswer).toBe('回答 1')
    expect(updated.attempts?.[49].userAnswer).toBe('回答 50')
  })
})

describe('Q&A session restoration', () => {
  const record = (id: string, allPassed: boolean, updatedAt: number): QAPracticeRecord => ({
    id,
    bookId: 'book-1',
    allPassed,
    createdAt: updatedAt,
    updatedAt,
    questions: [{
      persona: 'elementary',
      personaName: '小学生',
      question: '问题',
      passed: allPassed
    }]
  })

  it('restores the most recently updated unfinished record', () => {
    expect(selectActiveQARecord([
      record('finished', true, 30),
      record('older', false, 10),
      record('newer', false, 20)
    ])?.id).toBe('newer')
  })

  it('does not reopen a completed record', () => {
    expect(selectActiveQARecord([record('finished', true, 30)])).toBeNull()
  })
})

describe('Q&A teaching prerequisite', () => {
  const practice = (content: string, score: number): PracticeRecord => ({
    id: content,
    bookId: 'book-1',
    content,
    aiReview: 'review',
    scores: { accuracy: score, completeness: score, clarity: score, overall: score },
    passed: score >= 60,
    createdAt: score
  })

  it('uses the highest scoring passed teaching record', () => {
    expect(getBestPassedTeachingContent([
      practice('failed', 59),
      practice('passed', 70),
      practice('best', 85)
    ])).toBe('best')
  })

  it('blocks question generation when no teaching record passed', () => {
    expect(getBestPassedTeachingContent([practice('failed', 59)])).toBeUndefined()
  })
})
