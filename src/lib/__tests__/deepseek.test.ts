/** @jest-environment node */

import OpenAI from 'openai'

jest.mock('../store', () => ({
  getSettings: jest.fn(() => ({ aiDataConsent: true }))
}))

import {
  DEEPSEEK_MODEL,
  generatePersonaQuestions,
  PERSONA_QUESTION_COUNT,
  parsePracticeEvaluation,
  withDeepSeekDefaults
} from '../deepseek'
import { getSettings } from '../store'

describe('DeepSeek V4 Flash request defaults', () => {
  it('uses the V4 Flash model with thinking disabled', () => {
    const request = withDeepSeekDefaults({
      messages: [{ role: 'user' as const, content: 'test' }],
      temperature: 0.5
    })

    expect(request.model).toBe('deepseek-v4-flash')
    expect(request.model).toBe(DEEPSEEK_MODEL)
    expect(request.thinking).toEqual({ type: 'disabled' })
  })
})

describe('practice evaluation parsing', () => {
  const validEvaluation = JSON.stringify({
    scores: { accuracy: 80, completeness: 70, clarity: 90, overall: 75 },
    review: '具体且可操作的反馈',
    passed: false
  })

  it('validates every score and derives the passing result locally', () => {
    expect(parsePracticeEvaluation(validEvaluation)).toMatchObject({
      scores: { overall: 75 },
      review: '具体且可操作的反馈',
      passed: true
    })
  })

  it('does not depend on the model-provided passing flag', () => {
    const responseWithoutPassedFlag = JSON.stringify({
      scores: { accuracy: 80, completeness: 70, clarity: 90, overall: 75 },
      review: '具体且可操作的反馈'
    })

    expect(parsePracticeEvaluation(responseWithoutPassedFlag).passed).toBe(true)
  })

  it('rejects non-JSON responses instead of inventing a score', () => {
    expect(() => parsePracticeEvaluation('Here is my feedback')).toThrow('JSON object')
  })

  it('rejects out-of-range or non-integer scores', () => {
    expect(() => parsePracticeEvaluation(JSON.stringify({
      scores: { accuracy: 101, completeness: 70, clarity: 90, overall: 75 },
      review: '反馈',
      passed: true
    }))).toThrow('invalid accuracy score')
  })
})

describe('AI data consent', () => {
  it('blocks client creation until the user has explicitly consented', async () => {
    const mockedSettings = getSettings as jest.MockedFunction<typeof getSettings>
    mockedSettings.mockReturnValue({ aiDataConsent: false } as ReturnType<typeof getSettings>)

    const { createDeepSeekClient, AI_DATA_CONSENT_REQUIRED } = await import('../deepseek')
    await expect(createDeepSeekClient('sk-test')).rejects.toThrow(AI_DATA_CONSENT_REQUIRED)
  })
})

describe('persona question generation', () => {
  it('limits custom persona combinations to three roles', async () => {
    const create = jest.fn().mockResolvedValue({
      choices: [{
        message: {
          content: JSON.stringify([{ persona: 'role-1', personaName: '角色 1', question: '问题' }])
        }
      }]
    })
    const client = { chat: { completions: { create } } } as unknown as OpenAI
    const personas = Array.from({ length: 5 }, (_, index) => ({
      id: `role-${index + 1}`,
      name: { zh: `角色 ${index + 1}`, en: `Role ${index + 1}` },
      icon: 'user',
      description: { zh: '测试角色', en: 'Test persona' }
    }))

    await generatePersonaQuestions(client, '测试书籍', undefined, undefined, undefined, personas)

    const request = create.mock.calls[0][0] as { messages: Array<{ content: unknown }> }
    const systemPrompt = String(request.messages[0].content)

    expect(PERSONA_QUESTION_COUNT).toBe(3)
    expect(systemPrompt).toContain('角色 1')
    expect(systemPrompt).toContain('角色 3')
    expect(systemPrompt).not.toContain('角色 4')
    expect(systemPrompt).not.toContain('角色 5')
  })
})
