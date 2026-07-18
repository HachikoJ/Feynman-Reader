/**
 * 输入验证和 XSS 防护工具 (P0 修复)
 */

// ============================================================================
// XSS 防护
// ============================================================================

/**
 * 验证并清理用户输入的文本
 * @param input 用户输入
 * @param maxLength 最大长度限制
 * @returns 清理后的安全文本
 */
export function sanitizeTextInput(input: string, maxLength = 10000): string {
  if (typeof input !== 'string') return ''

  // 移除控制字符（除了换行、制表符、回车）
  let cleaned = input.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '')

  // 限制长度
  if (cleaned.length > maxLength) {
    cleaned = cleaned.substring(0, maxLength)
  }

  return cleaned
}

/**
 * 验证书籍名称
 */
export function validateBookName(name: string): { valid: boolean; error?: string } {
  if (!name || typeof name !== 'string') {
    return { valid: false, error: '书名不能为空' }
  }

  const trimmed = name.trim()
  if (trimmed.length === 0) {
    return { valid: false, error: '书名不能为空' }
  }

  if (trimmed.length > 200) {
    return { valid: false, error: '书名不能超过200个字符' }
  }

  return { valid: true }
}

/**
 * 验证作者名称
 */
export function validateAuthorName(author: string): { valid: boolean; error?: string } {
  if (!author || typeof author !== 'string') {
    return { valid: true } // 作者可以为空
  }

  const trimmed = author.trim()
  if (trimmed.length > 100) {
    return { valid: false, error: '作者名不能超过100个字符' }
  }

  return { valid: true }
}

/**
 * 验证笔记/描述内容
 */
export function validateContent(content: string, maxLength = 50000): { valid: boolean; error?: string } {
  if (!content || typeof content !== 'string') {
    return { valid: true }
  }

  if (content.length > maxLength) {
    return { valid: false, error: `内容不能超过${maxLength}个字符` }
  }

  return { valid: true }
}

/**
 * 验证 API Key 格式
 */
export function validateApiKey(apiKey: string): { valid: boolean; error?: string } {
  if (!apiKey || typeof apiKey !== 'string') {
    return { valid: true } // API Key 可以为空
  }

  const trimmed = apiKey.trim()
  if (trimmed.length === 0) {
    return { valid: true }
  }

  // DeepSeek API Key 通常以 sk- 开头，长度在 40-60 之间
  if (trimmed.length < 20 || trimmed.length > 200) {
    return { valid: false, error: 'API Key 格式不正确' }
  }

  return { valid: true }
}

/**
 * 检测潜在的恶意脚本
 */
export function detectMaliciousContent(input: string): boolean {
  if (!input || typeof input !== 'string') return false

  const maliciousPatterns = [
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
    /javascript:/gi,
    /on\w+\s*=/gi, // 事件处理器如 onclick=
    /<iframe/gi,
    /<object/gi,
    /<embed/gi,
    /eval\s*\(/gi,
    /expression\s*\(/gi,
  ]

  return maliciousPatterns.some(pattern => pattern.test(input))
}
