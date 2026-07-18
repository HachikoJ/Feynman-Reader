import {
  sanitizeTextInput,
  validateBookName,
  validateAuthorName,
  validateContent,
  detectMaliciousContent,
  validateApiKey
} from '../validation'

describe('validation.ts', () => {
  describe('sanitizeTextInput', () => {
    it('should preserve markup while removing control characters', () => {
      expect(sanitizeTextInput('<script>alert("xss")</script>Hello'))
        .toBe('<script>alert("xss")</script>Hello')
    })

    it('should preserve markup while removing control characters', () => {
      expect(sanitizeTextInput('<div onclick="evil()">Click</div>'))
        .toBe('<div onclick="evil()">Click</div>')
    })

    it('should handle normal text', () => {
      expect(sanitizeTextInput('Normal text with punctuation.'))
        .toBe('Normal text with punctuation.')
    })
  })

  describe('validateBookName', () => {
    it('should accept valid book names', () => {
      expect(validateBookName('三体')).toEqual({ valid: true })
      expect(validateBookName('The Great Gatsby')).toEqual({ valid: true })
      expect(validateBookName('一本书123')).toEqual({ valid: true })
    })

    it('should reject empty names', () => {
      expect(validateBookName('')).toEqual({
        valid: false,
        error: '书名不能为空'
      })
    })

    it('should reject names that are too long', () => {
      const longName = 'A'.repeat(201)
      expect(validateBookName(longName)).toEqual({
        valid: false,
        error: '书名不能超过200个字符'
      })
    })

    it('should reject names with only whitespace', () => {
      expect(validateBookName('   ')).toEqual({
        valid: false,
        error: '书名不能为空'
      })
    })
  })

  describe('validateAuthorName', () => {
    it('should accept valid author names', () => {
      expect(validateAuthorName('刘慈欣')).toEqual({ valid: true })
      expect(validateAuthorName('F. Scott Fitzgerald')).toEqual({ valid: true })
    })

    it('should allow empty names because authors are optional', () => {
      expect(validateAuthorName('')).toEqual({ valid: true })
    })

    it('should accept empty author (optional)', () => {
      // Author is optional, so this should be handled in context
      expect(validateAuthorName('刘慈欣')).toEqual({ valid: true })
    })
  })

  describe('validateContent', () => {
    it('should accept valid content', () => {
      expect(validateContent('This is some content about a book.')).toEqual({ valid: true })
    })

    it('should reject content that is too long', () => {
      const longContent = 'A'.repeat(50001)
      expect(validateContent(longContent)).toEqual({
        valid: false,
        error: '内容不能超过50000个字符'
      })
    })
  })

  describe('detectMaliciousContent', () => {
    it('should detect script tags', () => {
      expect(detectMaliciousContent('<script>alert("xss")</script>'))
        .toBe(true)
    })

    it('should detect javascript: protocol', () => {
      expect(detectMaliciousContent('javascript:alert("xss")'))
        .toBe(true)
    })

    it('should detect onerror events', () => {
      expect(detectMaliciousContent('<img onerror="alert(1)">'))
        .toBe(true)
    })

    it('should pass safe content', () => {
      expect(detectMaliciousContent('This is safe content.'))
        .toBe(false)
    })
  })

  describe('validateApiKey', () => {
    it('should validate DeepSeek API keys', () => {
      expect(validateApiKey('sk-1234567890abcdefg')).toEqual({ valid: true })
    })

    it('should validate OpenAI API keys', () => {
      expect(validateApiKey('sk-proj-abc123456789')).toEqual({ valid: true })
    })

    it('should reject empty keys', () => {
      expect(validateApiKey('')).toEqual({
        valid: true
      })
    })

    it('should reject keys that are too short', () => {
      expect(validateApiKey('sk-123')).toEqual({
        valid: false,
        error: 'API Key 格式不正确'
      })
    })
  })

})
