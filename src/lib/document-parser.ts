// 文档解析工具
'use client'

import { logger } from './logger'
import { MAX_DOCUMENT_FILE_SIZE, MAX_DOCUMENT_PAGES, MAX_DOCUMENT_TEXT_LENGTH } from './dataLimits'

export interface ParsedDocument {
  content: string
  fileName: string
  fileType: string
}

export { MAX_DOCUMENT_FILE_SIZE, MAX_DOCUMENT_PAGES, MAX_DOCUMENT_TEXT_LENGTH } from './dataLimits'

function assertSafeExtractedText(content: string): void {
  if (content.length > MAX_DOCUMENT_TEXT_LENGTH) {
    throw new Error('文档提取内容过长，请拆分后上传（最多 100 万字符）')
  }
}

// 解析文本文件 (txt, md, json)
async function parseTextFile(file: File): Promise<string> {
  return await file.text()
}

// 解析 PDF 文件
async function parsePDF(file: File): Promise<string> {
  try {
    // 动态导入 pdfjs-dist
    const pdfjsLib = await import('pdfjs-dist')
    
    pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'
    
    const arrayBuffer = await file.arrayBuffer()
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer, isEvalSupported: false })
    const pdf = await loadingTask.promise
    
    let fullText = ''
    const numPages = pdf.numPages

    if (numPages > MAX_DOCUMENT_PAGES) {
      throw new Error(`PDF 页数不能超过 ${MAX_DOCUMENT_PAGES} 页`)
    }
    
    logger.debug(`PDF 共 ${numPages} 页`)
    
    for (let i = 1; i <= numPages; i++) {
      const page = await pdf.getPage(i)
      const textContent = await page.getTextContent()
      const pageText = textContent.items
        .map((item: any) => item.str || '')
        .join(' ')
      fullText += pageText + '\n'
    }
    
    return fullText.trim()
  } catch (error: any) {
    logger.error('PDF 解析错误:', error)
    throw new Error(`PDF 解析失败: ${error.message || '请确保文件未加密且格式正确'}`)
  }
}

// 解析 Word 文件 (docx)
async function parseWord(file: File): Promise<string> {
  try {
    const mammoth = await import('mammoth')
    const arrayBuffer = await file.arrayBuffer()
    const result = await mammoth.extractRawText({ arrayBuffer })
    return result.value
  } catch (error) {
    logger.error('Word 解析错误:', error)
    throw new Error('Word 文档解析失败，仅支持 .docx 格式')
  }
}

// 获取文件扩展名
function getFileExtension(fileName: string): string {
  return fileName.split('.').pop()?.toLowerCase() || ''
}

// 主解析函数
export async function parseDocument(file: File): Promise<ParsedDocument> {
  const ext = getFileExtension(file.name)
  let content = ''

  if (!SUPPORTED_FILE_TYPES.includes(`.${ext}`)) {
    throw new Error('不支持该文件类型，请上传 PDF、DOCX、TXT、Markdown 或 JSON 文件')
  }

  if (file.size > MAX_DOCUMENT_FILE_SIZE) {
    throw new Error('文件大小不能超过 20MB')
  }
  
  logger.debug(`开始解析文件: ${file.name}, 类型: ${ext}, 大小: ${file.size} bytes`)
  
  try {
    switch (ext) {
      case 'pdf':
        content = await parsePDF(file)
        break
      case 'docx':
        content = await parseWord(file)
        break
      case 'doc':
        throw new Error('不支持旧版 .doc 格式，请转换为 .docx 后重试')
      case 'txt':
      case 'md':
      case 'json':
        content = await parseTextFile(file)
        break
      default:
        throw new Error('不支持该文件类型')
    }
    
    logger.debug(`文件解析成功，内容长度: ${content.length} 字符`)
    
    if (!content || content.trim().length === 0) {
      throw new Error('文件内容为空或无法提取文本')
    }

    assertSafeExtractedText(content)
    
  } catch (error: any) {
    logger.error('文档解析失败:', error)
    throw new Error(error.message || `无法解析文件: ${file.name}`)
  }
  
  return {
    content,
    fileName: file.name,
    fileType: ext
  }
}

// 支持的文件类型
export const SUPPORTED_FILE_TYPES = [
  '.pdf',
  '.docx',
  '.txt',
  '.md',
  '.json'
]

export const SUPPORTED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/markdown',
  'application/json'
]
