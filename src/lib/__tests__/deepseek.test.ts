/** @jest-environment node */

import OpenAI from 'openai'

jest.mock('../store', () => ({
  getSettings: jest.fn(() => ({ aiDataConsent: true }))
}))

import {
  chat,
  DEEPSEEK_MODEL,
  evaluatePersonaAnswers,
  generateBookTags,
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

describe('general chat responses', () => {
  it('rejects an empty response instead of saving fallback text as a completed phase', async () => {
    const client = {
      chat: { completions: { create: jest.fn().mockResolvedValue({ choices: [{ message: { content: '   ' } }] }) } }
    } as unknown as OpenAI

    await expect(chat(client, 'system', 'user')).rejects.toThrow('empty response')
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

describe('book tag generation', () => {
  it('surfaces request failures so the UI can explain why tags were not generated', async () => {
    const requestError = new Error('request failed')
    const client = {
      chat: { completions: { create: jest.fn().mockRejectedValue(requestError) } }
    } as unknown as OpenAI

    await expect(generateBookTags(client, '测试书籍')).rejects.toBe(requestError)
  })
})

describe('persona question generation', () => {
  it('surfaces question generation request failures', async () => {
    const requestError = new Error('question request failed')
    const client = {
      chat: { completions: { create: jest.fn().mockRejectedValue(requestError) } }
    } as unknown as OpenAI

    await expect(generatePersonaQuestions(client, '测试书籍')).rejects.toBe(requestError)
  })

  it('limits custom persona combinations to three roles', async () => {
    const create = jest.fn().mockResolvedValue({
      choices: [{
        message: {
          content: JSON.stringify([
            { persona: 'role-1', personaName: '伪造名称', question: '问题一' },
            { persona: 'role-2', personaName: '伪造名称', question: '问题二' },
            { persona: 'role-3', personaName: '伪造名称', question: '问题三' }
          ])
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

    const questions = await generatePersonaQuestions(client, '测试书籍', undefined, undefined, undefined, personas)

    const request = create.mock.calls[0][0] as { messages: Array<{ content: unknown }> }
    const systemPrompt = String(request.messages[0].content)

    expect(PERSONA_QUESTION_COUNT).toBe(3)
    expect(systemPrompt).toContain('角色 1')
    expect(systemPrompt).toContain('角色 3')
    expect(systemPrompt).not.toContain('角色 4')
    expect(systemPrompt).not.toContain('角色 5')
    expect(questions).toHaveLength(3)
    expect(questions[0]).toMatchObject({ persona: 'role-1', personaName: '角色 1' })
  })

  it('maps Chinese persona names and shuffled responses back to the selected IDs', async () => {
    const create = jest.fn().mockResolvedValue({
      choices: [{
        message: {
          content: JSON.stringify([
            { persona: '科学家', question: '科学家问题' },
            { personaName: '小学生', question: '小学生问题' },
            { persona: '职场人士', question: '职场问题' }
          ])
        }
      }]
    })
    const client = { chat: { completions: { create } } } as unknown as OpenAI
    const personas = [
      { id: 'elementary', name: { zh: '小学生', en: 'Elementary Student' }, icon: 'user', description: { zh: '简单解释', en: 'Simple' } },
      { id: 'professional', name: { zh: '职场人士', en: 'Professional' }, icon: 'user', description: { zh: '实际应用', en: 'Practical' } },
      { id: 'scientist', name: { zh: '科学家', en: 'Scientist' }, icon: 'user', description: { zh: '理论严谨', en: 'Rigorous' } }
    ]

    const questions = await generatePersonaQuestions(client, '测试书籍', undefined, undefined, undefined, personas)

    expect(questions).toEqual([
      { persona: 'elementary', personaName: '小学生', question: '小学生问题' },
      { persona: 'professional', personaName: '职场人士', question: '职场问题' },
      { persona: 'scientist', personaName: '科学家', question: '科学家问题' }
    ])
  })

  it('uses response order when the model returns generic persona labels', async () => {
    const create = jest.fn().mockResolvedValue({
      choices: [{
        message: {
          content: JSON.stringify([
            { persona: '角色一', question: '问题一' },
            { persona: '角色二', question: '问题二' },
            { persona: '角色三', question: '问题三' }
          ])
        }
      }]
    })
    const client = { chat: { completions: { create } } } as unknown as OpenAI
    const personas = Array.from({ length: 3 }, (_, index) => ({
      id: `role-${index + 1}`,
      name: { zh: `自定义角色 ${index + 1}`, en: `Custom Role ${index + 1}` },
      icon: 'user',
      description: { zh: '测试角色', en: 'Test persona' }
    }))

    const questions = await generatePersonaQuestions(client, '测试书籍', undefined, undefined, undefined, personas)

    expect(questions.map(question => question.persona)).toEqual(['role-1', 'role-2', 'role-3'])
    expect(questions.map(question => question.question)).toEqual(['问题一', '问题二', '问题三'])
  })

  it('still rejects duplicate recognized personas', async () => {
    const create = jest.fn().mockResolvedValue({
      choices: [{
        message: {
          content: JSON.stringify([
            { persona: 'elementary', question: '问题一' },
            { persona: '小学生', question: '问题二' },
            { persona: 'scientist', question: '问题三' }
          ])
        }
      }]
    })
    const client = { chat: { completions: { create } } } as unknown as OpenAI
    const personas = [
      { id: 'elementary', name: { zh: '小学生', en: 'Elementary Student' }, icon: 'user', description: { zh: '简单解释', en: 'Simple' } },
      { id: 'professional', name: { zh: '职场人士', en: 'Professional' }, icon: 'user', description: { zh: '实际应用', en: 'Practical' } },
      { id: 'scientist', name: { zh: '科学家', en: 'Scientist' }, icon: 'user', description: { zh: '理论严谨', en: 'Rigorous' } }
    ]

    await expect(generatePersonaQuestions(client, '测试书籍', undefined, undefined, undefined, personas))
      .rejects.toThrow('duplicate personas')
  })

  it('rejects duplicate persona evaluations and derives pass flags locally', async () => {
    const create = jest.fn().mockResolvedValue({
      choices: [{
        message: {
          content: JSON.stringify([
            { persona: 'elementary', score: 70, review: '具体反馈', passed: false },
            { persona: 'professional', score: 40, review: '需要补充', passed: true }
          ])
        }
      }]
    })
    const client = { chat: { completions: { create } } } as unknown as OpenAI
    const evaluations = await evaluatePersonaAnswers(client, '测试书籍', [
      { persona: 'elementary', personaName: '小学生', question: '问题一', answer: '回答一' },
      { persona: 'professional', personaName: '职场人', question: '问题二', answer: '回答二' }
    ])

    expect(evaluations).toEqual([
      { persona: 'elementary', score: 70, review: '具体反馈', passed: true },
      { persona: 'professional', score: 40, review: '需要补充', passed: false }
    ])
  })

  it('surfaces answer evaluation request failures', async () => {
    const requestError = new Error('evaluation request failed')
    const client = {
      chat: { completions: { create: jest.fn().mockRejectedValue(requestError) } }
    } as unknown as OpenAI

    await expect(evaluatePersonaAnswers(client, '测试书籍', [
      { persona: 'elementary', personaName: '小学生', question: '问题一', answer: '回答一' }
    ])).rejects.toBe(requestError)
  })
})
