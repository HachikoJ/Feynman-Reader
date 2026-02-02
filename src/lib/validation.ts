/**
 * 输入验证和 XSS 防护工具 (P0 修复)
 */

// ============================================================================
// XSS 防护
// ============================================================================

/**
 * 转义 HTML 特殊字符，防止 XSS 攻击
 */
export function escapeHtml(unsafe: string): string {
  if (typeof unsafe !== 'string') return ''
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
    .replace(/\//g, '&#x2F;')
}

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
 * 验证 JSON 数据
 */
export function validateJson(jsonString: string): { valid: boolean; data?: unknown; error?: string } {
  if (!jsonString || typeof jsonString !== 'string') {
    return { valid: false, error: '数据格式无效' }
  }

  try {
    const data = JSON.parse(jsonString)
    return { valid: true, data }
  } catch (e) {
    return { valid: false, error: 'JSON 解析失败' }
  }
}

/**
 * 安全地显示用户内容（防止 XSS）
 * 在显示用户输入的内容时使用
 */
export function safeRender(input: string): string {
  return escapeHtml(sanitizeTextInput(input))
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

/**
 * 验证文件上传
 */
export function validateFileUpload(file: File, allowedTypes: string[], maxSizeMB = 10): { valid: boolean; error?: string } {
  // 检查文件类型
  const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase()
  if (!allowedTypes.includes(fileExtension)) {
    return {
      valid: false,
      error: `不支持的文件类型。允许的类型：${allowedTypes.join(', ')}`
    }
  }

  // 检查文件大小
  const maxSizeBytes = maxSizeMB * 1024 * 1024
  if (file.size > maxSizeBytes) {
    return {
      valid: false,
      error: `文件大小不能超过 ${maxSizeMB}MB`
    }
  }

  return { valid: true }
}

/**
 * 清理 HTML 内容（移除危险标签）
 */
export function sanitizeHtml(html: string): string {
  if (!html || typeof html !== 'string') return ''

  // 移除 script 标签及其内容
  let cleaned = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')

  // 移除危险的标签
  const dangerousTags = ['iframe', 'object', 'embed', 'link', 'meta', 'style']
  dangerousTags.forEach(tag => {
    const regex = new RegExp(`<${tag}\\b[^<]*(?:(?!<\\/${tag}>)<[^<]*)*<\\/${tag}>`, 'gi')
    cleaned = cleaned.replace(regex, '')
    cleaned = cleaned.replace(new RegExp(`<${tag}\\b[^>]*>`, 'gi'), '')
  })

  // 移除事件处理器
  cleaned = cleaned.replace(/\s*on\w+\s*=\s*["'][^"']*["']/gi, '')
  cleaned = cleaned.replace(/\s*on\w+\s*=\s*[^\s>]*/gi, '')

  // 移除 javascript: 协议
  cleaned = cleaned.replace(/href\s*=\s*["']\s*javascript:/gi, 'href="#"')

  return cleaned
}

/**
 * 验证和清理用户输入的通用函数
 */
export function cleanUserInput(input: string, options: {
  maxLength?: number
  trim?: boolean
  escape?: boolean
  removeHtml?: boolean
} = {}): string {
  const {
    maxLength = 10000,
    trim = true,
    escape = false,
    removeHtml = false
  } = options

  if (typeof input !== 'string') return ''

  let cleaned = input

  // 移除 HTML
  if (removeHtml) {
    cleaned = sanitizeHtml(cleaned)
  }

  // 去除首尾空格
  if (trim) {
    cleaned = cleaned.trim()
  }

  // 限制长度
  if (cleaned.length > maxLength) {
    cleaned = cleaned.substring(0, maxLength)
  }

  // 转义 HTML 特殊字符
  if (escape) {
    cleaned = escapeHtml(cleaned)
  }

  return cleaned
}

/**
 * 检测是否是安全的 URL
 */
export function isSafeUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false

  try {
    const parsed = new URL(url)
    // 只允许 http 和 https 协议
    return ['http:', 'https:'].includes(parsed.protocol)
  } catch {
    return false
  }
}
