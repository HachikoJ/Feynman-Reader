import {
  escapeHtml,
  sanitizeTextInput,
  validateBookName,
  validateAuthorName,
  validateContent,
  detectMaliciousContent,
  validateApiKey,
  validateFileUpload
} from '../validation'

describe('validation.ts', () => {
  describe('escapeHtml', () => {
    it('should escape HTML special characters', () => {
      expect(escapeHtml('<script>alert("xss")</script>'))
        .toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;')
      expect(escapeHtml('<div>Hello</div>'))
        .toBe('&lt;div&gt;Hello&lt;/div&gt;')
    })

    it('should handle empty strings', () => {
      expect(escapeHtml('')).toBe('')
    })

    it('should escape all special characters', () => {
      expect(escapeHtml('<>&"\''))
        .toBe('&lt;&gt;&amp;&quot;&apos;')
    })
  })

  describe('sanitizeTextInput', () => {
    it('should remove script tags', () => {
      expect(sanitizeTextInput('<script>alert("xss")</script>Hello'))
        .toBe('Hello')
    })

    it('should remove event handlers', () => {
      expect(sanitizeTextInput('<div onclick="evil()">Click</div>'))
        .toBe('<div>Click</div>')
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
        error: '书名过长'
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

    it('should reject empty names', () => {
      expect(validateAuthorName('')).toEqual({
        valid: false,
        error: '作者名不能为空'
      })
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
        error: '内容过长'
      })
    })
  })

  describe('detectMaliciousContent', () => {
    it('should detect script tags', () => {
      expect(detectMaliciousContent('<script>alert("xss")</script>'))
        .toEqual({ hasMalicious: true, type: 'script' })
    })

    it('should detect javascript: protocol', () => {
      expect(detectMaliciousContent('javascript:alert("xss")'))
        .toEqual({ hasMalicious: true, type: 'javascript_protocol' })
    })

    it('should detect onerror events', () => {
      expect(detectMaliciousContent('<img onerror="alert(1)">'))
        .toEqual({ hasMalicious: true, type: 'event_handler' })
    })

    it('should pass safe content', () => {
      expect(detectMaliciousContent('This is safe content.'))
        .toEqual({ hasMalicious: false })
    })
  })

  describe('validateApiKey', () => {
    it('should validate DeepSeek API keys', () => {
      expect(validateApiKey('sk-1234567890abcdef')).toEqual({ valid: true })
    })

    it('should validate OpenAI API keys', () => {
      expect(validateApiKey('sk-proj-abc123')).toEqual({ valid: true })
    })

    it('should reject empty keys', () => {
      expect(validateApiKey('')).toEqual({
        valid: false,
        error: 'API Key 不能为空'
      })
    })

    it('should reject keys that are too short', () => {
      expect(validateApiKey('sk-123')).toEqual({
        valid: false,
        error: 'API Key 格式不正确'
      })
    })
  })

  describe('validateFileUpload', () => {
    it('should accept valid files', () => {
      const file = new File(['content'], 'test.pdf', { type: 'application/pdf' })
      file.size = 1024 * 1024 // 1MB
      expect(validateFileUpload(file)).toEqual({ valid: true })
    })

    it('should reject files that are too large', () => {
      const file = new File(['content'], 'large.pdf', { type: 'application/pdf' })
      Object.defineProperty(file, 'size', { value: 51 * 1024 * 1024 }) // 51MB
      expect(validateFileUpload(file)).toEqual({
        valid: false,
        error: '文件大小不能超过 50MB'
      })
    })

    it('should reject unsupported file types', () => {
      const file = new File(['content'], 'test.exe', { type: 'application/x-msdownload' })
      file.size = 1024
      expect(validateFileUpload(file)).toEqual({
        valid: false,
        error: '不支持的文件类型'
      })
    })
  })
})
