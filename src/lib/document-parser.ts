// 文档解析工具
'use client'

import { logger } from './logger'

export interface ParsedDocument {
  content: string
  fileName: string
  fileType: string
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
    
    // 设置 worker - 使用 legacy build 以获得更好的兼容性
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
    
    const arrayBuffer = await file.arrayBuffer()
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer })
    const pdf = await loadingTask.promise
    
    let fullText = ''
    const numPages = pdf.numPages
    
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

// 解析 Excel 文件
async function parseExcel(file: File): Promise<string> {
  try {
    const XLSX = await import('xlsx')
    const arrayBuffer = await file.arrayBuffer()
    const workbook = XLSX.read(arrayBuffer, { type: 'array' })
    
    let fullText = ''
    workbook.SheetNames.forEach(sheetName => {
      const sheet = workbook.Sheets[sheetName]
      const csv = XLSX.utils.sheet_to_csv(sheet)
      fullText += `[${sheetName}]\n${csv}\n\n`
    })
    
    return fullText.trim()
  } catch (error) {
    logger.error('Excel 解析错误:', error)
    throw new Error('Excel 文档解析失败')
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
  
  console.log(`开始解析文件: ${file.name}, 类型: ${ext}, 大小: ${file.size} bytes`)
  
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
      case 'xlsx':
      case 'xls':
        content = await parseExcel(file)
        break
      case 'txt':
      case 'md':
      case 'json':
        content = await parseTextFile(file)
        break
      default:
        // 尝试作为文本解析
        content = await parseTextFile(file)
    }
    
    logger.debug(`文件解析成功，内容长度: ${content.length} 字符`)
    
    if (!content || content.trim().length === 0) {
      throw new Error('文件内容为空或无法提取文本')
    }
    
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
  '.xlsx',
  '.xls',
  '.txt',
  '.md',
  '.json'
]

export const SUPPORTED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/plain',
  'text/markdown',
  'application/json'
]
