/**
 * 多模态学习功能 (P3 修复)
 *
 * 支持图片、音频、视频等多种媒体形式的学习内容
 */

import { Book } from './store'

// ============================================================================
// 多模态类型定义
// ============================================================================

/**
 * 媒体类型
 */
export type MediaType = 'image' | 'audio' | 'video' | 'document' | 'link'

/**
 * 媒体资源
 */
export interface MediaResource {
  id: string
  type: MediaType
  url: string
  thumbnail?: string
  title: string
  description?: string
  duration?: number  // 音频/视频时长（秒）
  size?: number      // 文件大小（字节）
  mimeType?: string
  metadata?: Record<string, any>
  createdAt: number
}

/**
 * 图片笔记
 */
export interface ImageNote {
  id: string
  bookId: string
  image: MediaResource
  annotations: ImageAnnotation[]
  caption?: string
  ocrText?: string  // 图片文字识别结果
  tags: string[]
  createdAt: number
}

/**
 * 图片标注
 */
export interface ImageAnnotation {
  id: string
  x: number        // 相对坐标 (0-1)
  y: number
  width: number    // 相对尺寸 (0-1)
  height: number
  text: string
  color?: string
}

/**
 * 音频笔记
 */
export interface AudioNote {
  id: string
  bookId: string
  audio: MediaResource
  transcript?: string  // 音频转文字结果
  summary?: string
  keyPoints: string[]
  waveform?: number[]  // 波形数据
  duration: number
  createdAt: number
}

/**
 * 视频笔记
 */
export interface VideoNote {
  id: string
  bookId: string
  video: MediaResource
  transcript?: string  // 视频字幕/转录
  summary?: string
  keyPoints: string[]
  bookmarks: VideoBookmark[]
  duration: number
  createdAt: number
}

/**
 * 视频书签
 */
export interface VideoBookmark {
  id: string
  time: number      // 时间点（秒）
  title: string
  note?: string
  thumbnail?: string
}

/**
 * 闪卡（带图片）
 */
export interface Flashcard {
  id: string
  bookId: string
  question: string
  answer: string
  image?: MediaResource
  audio?: MediaResource
  difficulty: 'easy' | 'medium' | 'hard'
  interval: number
  easeFactor: number
  dueDate: number
  reviewCount: number
}

/**
 * 思维导图（增强版，支持图片）
 */
export interface MindMapNodeMedia {
  id: string
  content: string
  image?: MediaResource
  children: MindMapNodeMedia[]
  color?: string
  icon?: string
  position?: { x: number; y: number }
}

// ============================================================================
// 存储键
// ============================================================================

const IMAGE_NOTES_KEY = 'feynman-image-notes'
const AUDIO_NOTES_KEY = 'feynman-audio-notes'
const VIDEO_NOTES_KEY = 'feynman-video-notes'
const FLASHCARDS_KEY = 'feynman-flashcards'
const MEDIA_RESOURCES_KEY = 'feynman-media-resources'

// ============================================================================
// 媒体资源管理
// ============================================================================

/**
 * 获取所有媒体资源
 */
export function getMediaResources(): MediaResource[] {
  const data = localStorage.getItem(MEDIA_RESOURCES_KEY)
  return data ? JSON.parse(data) : []
}

/**
 * 保存媒体资源
 */
function saveMediaResources(resources: MediaResource[]): void {
  localStorage.setItem(MEDIA_RESOURCES_KEY, JSON.stringify(resources))
}

/**
 * 添加媒体资源
 */
export function addMediaResource(resource: Omit<MediaResource, 'id' | 'createdAt'>): MediaResource {
  const resources = getMediaResources()

  const newResource: MediaResource = {
    ...resource,
    id: `media-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    createdAt: Date.now()
  }

  resources.push(newResource)
  saveMediaResources(resources)

  return newResource
}

/**
 * 删除媒体资源
 */
export function deleteMediaResource(resourceId: string): boolean {
  const resources = getMediaResources()
  const index = resources.findIndex(r => r.id === resourceId)
  if (index === -1) return false

  resources.splice(index, 1)
  saveMediaResources(resources)
  return true
}

// ============================================================================
// 图片笔记
// ============================================================================

/**
 * 获取所有图片笔记
 */
export function getImageNotes(): ImageNote[] {
  const data = localStorage.getItem(IMAGE_NOTES_KEY)
  return data ? JSON.parse(data) : []
}

/**
 * 保存图片笔记
 */
function saveImageNotes(notes: ImageNote[]): void {
  localStorage.setItem(IMAGE_NOTES_KEY, JSON.stringify(notes))
}

/**
 * 创建图片笔记
 */
export function createImageNote(
  bookId: string,
  image: Omit<MediaResource, 'id' | 'createdAt'>,
  caption?: string,
  tags: string[] = []
): ImageNote {
  const imageResource = addMediaResource({ ...image, type: 'image' })

  const note: ImageNote = {
    id: `image-note-${Date.now()}`,
    bookId,
    image: imageResource,
    annotations: [],
    caption,
    tags,
    createdAt: Date.now()
  }

  const notes = getImageNotes()
  notes.unshift(note)
  saveImageNotes(notes)

  return note
}

/**
 * 添加图片标注
 */
export function addImageAnnotation(
  noteId: string,
  x: number,
  y: number,
  width: number,
  height: number,
  text: string,
  color?: string
): ImageAnnotation | null {
  const notes = getImageNotes()
  const note = notes.find(n => n.id === noteId)
  if (!note) return null

  const annotation: ImageAnnotation = {
    id: `annotation-${Date.now()}`,
    x, y, width, height,
    text,
    color
  }

  note.annotations.push(annotation)
  saveImageNotes(notes)

  return annotation
}

/**
 * 删除图片标注
 */
export function deleteImageAnnotation(noteId: string, annotationId: string): boolean {
  const notes = getImageNotes()
  const note = notes.find(n => n.id === noteId)
  if (!note) return false

  const index = note.annotations.findIndex(a => a.id === annotationId)
  if (index === -1) return false

  note.annotations.splice(index, 1)
  saveImageNotes(notes)
  return true
}

/**
 * 设置图片 OCR 结果
 */
export function setImageOCRText(noteId: string, ocrText: string): boolean {
  const notes = getImageNotes()
  const note = notes.find(n => n.id === noteId)
  if (!note) return false

  note.ocrText = ocrText
  saveImageNotes(notes)
  return true
}

/**
 * 获取书籍的图片笔记
 */
export function getBookImageNotes(bookId: string): ImageNote[] {
  return getImageNotes().filter(n => n.bookId === bookId)
}

/**
 * 删除图片笔记
 */
export function deleteImageNote(noteId: string): boolean {
  const notes = getImageNotes()
  const index = notes.findIndex(n => n.id === noteId)
  if (index === -1) return false

  const note = notes[index]
  // 删除关联的媒体资源
  deleteMediaResource(note.image.id)

  notes.splice(index, 1)
  saveImageNotes(notes)
  return true
}

// ============================================================================
// 音频笔记
// ============================================================================

/**
 * 获取所有音频笔记
 */
export function getAudioNotes(): AudioNote[] {
  const data = localStorage.getItem(AUDIO_NOTES_KEY)
  return data ? JSON.parse(data) : []
}

/**
 * 保存音频笔记
 */
function saveAudioNotes(notes: AudioNote[]): void {
  localStorage.setItem(AUDIO_NOTES_KEY, JSON.stringify(notes))
}

/**
 * 创建音频笔记
 */
export function createAudioNote(
  bookId: string,
  audio: Omit<MediaResource, 'id' | 'createdAt'>,
  duration: number
): AudioNote {
  const audioResource = addMediaResource({ ...audio, type: 'audio', duration })

  const note: AudioNote = {
    id: `audio-note-${Date.now()}`,
    bookId,
    audio: audioResource,
    transcript: undefined,
    summary: undefined,
    keyPoints: [],
    duration,
    createdAt: Date.now()
  }

  const notes = getAudioNotes()
  notes.unshift(note)
  saveAudioNotes(notes)

  return note
}

/**
 * 更新音频转录
 */
export function updateAudioTranscript(noteId: string, transcript: string): boolean {
  const notes = getAudioNotes()
  const note = notes.find(n => n.id === noteId)
  if (!note) return false

  note.transcript = transcript
  saveAudioNotes(notes)
  return true
}

/**
 * 更新音频摘要
 */
export function updateAudioSummary(noteId: string, summary: string, keyPoints: string[]): boolean {
  const notes = getAudioNotes()
  const note = notes.find(n => n.id === noteId)
  if (!note) return false

  note.summary = summary
  note.keyPoints = keyPoints
  saveAudioNotes(notes)
  return true
}

/**
 * 获取书籍的音频笔记
 */
export function getBookAudioNotes(bookId: string): AudioNote[] {
  return getAudioNotes().filter(n => n.bookId === bookId)
}

/**
 * 删除音频笔记
 */
export function deleteAudioNote(noteId: string): boolean {
  const notes = getAudioNotes()
  const index = notes.findIndex(n => n.id === noteId)
  if (index === -1) return false

  const note = notes[index]
  deleteMediaResource(note.audio.id)

  notes.splice(index, 1)
  saveAudioNotes(notes)
  return true
}

// ============================================================================
// 视频笔记
// ============================================================================

/**
 * 获取所有视频笔记
 */
export function getVideoNotes(): VideoNote[] {
  const data = localStorage.getItem(VIDEO_NOTES_KEY)
  return data ? JSON.parse(data) : []
}

/**
 * 保存视频笔记
 */
function saveVideoNotes(notes: VideoNote[]): void {
  localStorage.setItem(VIDEO_NOTES_KEY, JSON.stringify(notes))
}

/**
 * 创建视频笔记
 */
export function createVideoNote(
  bookId: string,
  video: Omit<MediaResource, 'id' | 'createdAt'>,
  duration: number
): VideoNote {
  const videoResource = addMediaResource({ ...video, type: 'video', duration })

  const note: VideoNote = {
    id: `video-note-${Date.now()}`,
    bookId,
    video: videoResource,
    transcript: undefined,
    summary: undefined,
    keyPoints: [],
    bookmarks: [],
    duration,
    createdAt: Date.now()
  }

  const notes = getVideoNotes()
  notes.unshift(note)
  saveVideoNotes(notes)

  return note
}

/**
 * 添加视频书签
 */
export function addVideoBookmark(
  noteId: string,
  time: number,
  title: string,
  note?: string,
  thumbnail?: string
): VideoBookmark | null {
  const videoNotes = getVideoNotes()
  const videoNote = videoNotes.find(n => n.id === noteId)
  if (!videoNote) return null

  const bookmark: VideoBookmark = {
    id: `bookmark-${Date.now()}`,
    time,
    title,
    note,
    thumbnail
  }

  videoNote.bookmarks.push(bookmark)
  // 按时间排序
  videoNote.bookmarks.sort((a, b) => a.time - b.time)
  saveVideoNotes(videoNotes)

  return bookmark
}

/**
 * 删除视频书签
 */
export function deleteVideoBookmark(noteId: string, bookmarkId: string): boolean {
  const notes = getVideoNotes()
  const note = notes.find(n => n.id === noteId)
  if (!note) return false

  const index = note.bookmarks.findIndex(b => b.id === bookmarkId)
  if (index === -1) return false

  note.bookmarks.splice(index, 1)
  saveVideoNotes(notes)
  return true
}

/**
 * 更新视频转录
 */
export function updateVideoTranscript(noteId: string, transcript: string): boolean {
  const notes = getVideoNotes()
  const note = notes.find(n => n.id === noteId)
  if (!note) return false

  note.transcript = transcript
  saveVideoNotes(notes)
  return true
}

/**
 * 更新视频摘要
 */
export function updateVideoSummary(noteId: string, summary: string, keyPoints: string[]): boolean {
  const notes = getVideoNotes()
  const note = notes.find(n => n.id === noteId)
  if (!note) return false

  note.summary = summary
  note.keyPoints = keyPoints
  saveVideoNotes(notes)
  return true
}

/**
 * 获取书籍的视频笔记
 */
export function getBookVideoNotes(bookId: string): VideoNote[] {
  return getVideoNotes().filter(n => n.bookId === bookId)
}

/**
 * 删除视频笔记
 */
export function deleteVideoNote(noteId: string): boolean {
  const notes = getVideoNotes()
  const index = notes.findIndex(n => n.id === noteId)
  if (index === -1) return false

  const note = notes[index]
  deleteMediaResource(note.video.id)

  notes.splice(index, 1)
  saveVideoNotes(notes)
  return true
}

// ============================================================================
// 闪卡系统（增强版）
// ============================================================================

/**
 * 获取所有闪卡
 */
export function getFlashcards(): Flashcard[] {
  const data = localStorage.getItem(FLASHCARDS_KEY)
  return data ? JSON.parse(data) : []
}

/**
 * 保存闪卡
 */
function saveFlashcards(cards: Flashcard[]): void {
  localStorage.setItem(FLASHCARDS_KEY, JSON.stringify(cards))
}

/**
 * 创建闪卡
 */
export function createFlashcard(
  bookId: string,
  question: string,
  answer: string,
  image?: Omit<MediaResource, 'id' | 'createdAt'>,
  audio?: Omit<MediaResource, 'id' | 'createdAt'>
): Flashcard {
  const card: Flashcard = {
    id: `flashcard-${Date.now()}`,
    bookId,
    question,
    answer,
    image: image ? addMediaResource({ ...image, type: 'image' }) : undefined,
    audio: audio ? addMediaResource({ ...audio, type: 'audio' }) : undefined,
    difficulty: 'medium',
    interval: 1,
    easeFactor: 2.5,
    dueDate: Date.now(),
    reviewCount: 0
  }

  const cards = getFlashcards()
  cards.push(card)
  saveFlashcards(cards)

  return card
}

/**
 * 获取书籍的闪卡
 */
export function getBookFlashcards(bookId: string): Flashcard[] {
  return getFlashcards().filter(c => c.bookId === bookId)
}

/**
 * 获取今日复习的闪卡
 */
export function getDueFlashcards(): Flashcard[] {
  const now = Date.now()
  return getFlashcards().filter(c => c.dueDate <= now)
    .sort((a, b) => a.dueDate - b.dueDate)
}

/**
 * 更新闪卡复习结果
 */
export function updateFlashcardReview(
  cardId: string,
  quality: number  // 0-5: 0=完全忘记, 5=完美记忆
): Flashcard | null {
  const cards = getFlashcards()
  const card = cards.find(c => c.id === cardId)
  if (!card) return null

  card.reviewCount++

  // 更新难度因子
  card.easeFactor = Math.max(1.3, card.easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)))

  // 更新间隔
  if (quality >= 3) {
    if (card.interval === 0) {
      card.interval = 1
    } else if (card.interval === 1) {
      card.interval = 6
    } else {
      card.interval = Math.round(card.interval * card.easeFactor)
    }
  } else {
    card.interval = 1
  }

  // 更新难度评级
  if (quality < 2) {
    card.difficulty = 'hard'
  } else if (quality > 4) {
    card.difficulty = 'easy'
  } else {
    card.difficulty = 'medium'
  }

  // 计算下次复习时间
  card.dueDate = Date.now() + card.interval * 24 * 60 * 60 * 1000

  saveFlashcards(cards)
  return card
}

/**
 * 删除闪卡
 */
export function deleteFlashcard(cardId: string): boolean {
  const cards = getFlashcards()
  const index = cards.findIndex(c => c.id === cardId)
  if (index === -1) return false

  const card = cards[index]
  if (card.image) deleteMediaResource(card.image.id)
  if (card.audio) deleteMediaResource(card.audio.id)

  cards.splice(index, 1)
  saveFlashcards(cards)
  return true
}

// ============================================================================
// 文件处理工具
// ============================================================================

/**
 * 将文件转换为 Data URL
 */
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

/**
 * 压缩图片
 */
export function compressImage(
  dataUrl: string,
  maxWidth: number = 1920,
  maxHeight: number = 1080,
  quality: number = 0.8
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      let width = img.width
      let height = img.height

      // 计算新尺寸
      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height)
        width = Math.round(width * ratio)
        height = Math.round(height * ratio)
      }

      canvas.width = width
      canvas.height = height

      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('无法获取 canvas context'))
        return
      }

      ctx.drawImage(img, 0, 0, width, height)

      // 生成缩略图
      const thumbnailDataUrl = canvas.toDataURL('image/jpeg', quality)
      resolve(thumbnailDataUrl)
    }
    img.onerror = reject
    img.src = dataUrl
  })
}

/**
 * 生成缩略图
 */
export function generateThumbnail(
  dataUrl: string,
  size: number = 200
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      const ratio = Math.min(size / img.width, size / img.height)
      canvas.width = Math.round(img.width * ratio)
      canvas.height = Math.round(img.height * ratio)

      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('无法获取 canvas context'))
        return
      }

      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      resolve(canvas.toDataURL('image/jpeg', 0.7))
    }
    img.onerror = reject
    img.src = dataUrl
  })
}

/**
 * 获取音频时长
 */
export function getAudioDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const audio = document.createElement('audio')
    audio.preload = 'metadata'

    audio.onloadedmetadata = () => {
      resolve(audio.duration)
      URL.revokeObjectURL(audio.src)
    }

    audio.onerror = () => {
      reject(new Error('无法获取音频时长'))
      URL.revokeObjectURL(audio.src)
    }

    audio.src = URL.createObjectURL(file)
  })
}

/**
 * 获取视频时长
 */
export function getVideoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    video.preload = 'metadata'

    video.onloadedmetadata = () => {
      resolve(video.duration)
      URL.revokeObjectURL(video.src)
    }

    video.onerror = () => {
      reject(new Error('无法获取视频时长'))
      URL.revokeObjectURL(video.src)
    }

    video.src = URL.createObjectURL(file)
  })
}

/**
 * 生成视频缩略图
 */
export function generateVideoThumbnail(
  file: File,
  time: number = 1
): Promise<string> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    video.preload = 'metadata'

    video.onloadeddata = () => {
      video.currentTime = time
    }

    video.onseeked = () => {
      const canvas = document.createElement('canvas')
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight

      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('无法获取 canvas context'))
        return
      }

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      const thumbnail = canvas.toDataURL('image/jpeg', 0.7)
      resolve(thumbnail)
      URL.revokeObjectURL(video.src)
    }

    video.onerror = () => {
      reject(new Error('无法生成视频缩略图'))
      URL.revokeObjectURL(video.src)
    }

    video.src = URL.createObjectURL(file)
  })
}

/**
 * 生成音频波形数据
 */
export function generateAudioWaveform(
  audioContext: AudioContext,
  audioBuffer: AudioBuffer,
  samples: number = 100
): number[] {
  const rawData = audioBuffer.getChannelData(0)
  const blockSize = Math.floor(rawData.length / samples)
  const waveform: number[] = []

  for (let i = 0; i < samples; i++) {
    const start = i * blockSize
    let sum = 0

    for (let j = 0; j < blockSize; j++) {
      sum += Math.abs(rawData[start + j] || 0)
    }

    waveform.push(sum / blockSize)
  }

  // 归一化
  const max = Math.max(...waveform)
  return waveform.map(v => max > 0 ? v / max : 0)
}

// ============================================================================
// OCR 模拟（文字识别）
// ============================================================================

/**
 * 模拟 OCR 文字识别
 * 注意：实际应用中需要调用真实的 OCR API（如 Tesseract.js、Google Cloud Vision 等）
 */
export async function recognizeText(imageDataUrl: string): Promise<string> {
  // 这里是模拟实现，实际应该调用 OCR API
  return new Promise((resolve) => {
    setTimeout(() => {
      // 返回模拟的识别结果
      const mockTexts = [
        '费曼学习法的核心是「以教代学」',
        '学习的本质是建立神经连接',
        '主动回忆比重复阅读更有效',
        '间隔重复有助于长期记忆保持'
      ]
      resolve(mockTexts[Math.floor(Math.random() * mockTexts.length)])
    }, 1000)
  })
}

/**
 * 调用真实 OCR API 的示例接口
 */
export interface OCROptions {
  language?: 'chi_sim' | 'chi_tra' | 'eng'
  preprocess?: boolean
}

export async function recognizeTextWithAPI(
  imageDataUrl: string,
  options: OCROptions = {}
): Promise<string> {
  // 实际实现中，这里应该：
  // 1. 将 imageDataUrl 转换为 Blob
  // 2. 发送到 OCR API（如 Tesseract.js、云服务）
  // 3. 返回识别结果

  // 示例：使用 Tesseract.js（需要安装）
  // const worker = await Tesseract.createWorker()
  // await worker.loadLanguage(options.language || 'chi_sim+eng')
  // await worker.initialize(options.language || 'chi_sim+eng')
  // const { data: { text } } = await worker.recognize(imageDataUrl)
  // await worker.terminate()
  // return text

  // 当前返回模拟结果
  return recognizeText(imageDataUrl)
}

// ============================================================================
// 多模态内容搜索
// ============================================================================

/**
 * 多模态内容搜索结果
 */
export interface MultimodalSearchResult {
  type: 'image' | 'audio' | 'video' | 'flashcard'
  id: string
  bookId: string
  bookName: string
  title: string
  thumbnail?: string
  content: string
  relevance: number
}

/**
 * 搜索多模态内容
 */
export function searchMultimodalContent(
  query: string,
  bookId?: string
): MultimodalSearchResult[] {
  const results: MultimodalSearchResult[] = []
  const lowerQuery = query.toLowerCase()

  // 搜索图片笔记
  const imageNotes = getImageNotes()
  imageNotes.forEach(note => {
    if (bookId && note.bookId !== bookId) return

    const matchScore =
      (note.caption?.toLowerCase().includes(lowerQuery) ? 1 : 0) +
      (note.ocrText?.toLowerCase().includes(lowerQuery) ? 1 : 0) +
      (note.tags.some(t => t.toLowerCase().includes(lowerQuery)) ? 1 : 0)

    if (matchScore > 0) {
      results.push({
        type: 'image',
        id: note.id,
        bookId: note.bookId,
        bookName: '', // 需要从书籍数据获取
        title: note.caption || '图片笔记',
        thumbnail: note.image.thumbnail,
        content: note.ocrText || note.caption || '',
        relevance: matchScore
      })
    }
  })

  // 搜索音频笔记
  const audioNotes = getAudioNotes()
  audioNotes.forEach(note => {
    if (bookId && note.bookId !== bookId) return

    const matchScore =
      (note.transcript?.toLowerCase().includes(lowerQuery) ? 1 : 0) +
      (note.summary?.toLowerCase().includes(lowerQuery) ? 1 : 0) +
      (note.keyPoints.some(p => p.toLowerCase().includes(lowerQuery)) ? 1 : 0)

    if (matchScore > 0) {
      results.push({
        type: 'audio',
        id: note.id,
        bookId: note.bookId,
        bookName: '',
        title: '音频笔记',
        content: note.summary || note.transcript || '',
        relevance: matchScore
      })
    }
  })

  // 搜索视频笔记
  const videoNotes = getVideoNotes()
  videoNotes.forEach(note => {
    if (bookId && note.bookId !== bookId) return

    const matchScore =
      (note.transcript?.toLowerCase().includes(lowerQuery) ? 1 : 0) +
      (note.summary?.toLowerCase().includes(lowerQuery) ? 1 : 0) +
      (note.keyPoints.some(p => p.toLowerCase().includes(lowerQuery)) ? 1 : 0)

    if (matchScore > 0) {
      results.push({
        type: 'video',
        id: note.id,
        bookId: note.bookId,
        bookName: '',
        title: '视频笔记',
        content: note.summary || note.transcript || '',
        relevance: matchScore
      })
    }
  })

  // 搜索闪卡
  const flashcards = getFlashcards()
  flashcards.forEach(card => {
    if (bookId && card.bookId !== bookId) return

    const matchScore =
      (card.question.toLowerCase().includes(lowerQuery) ? 1 : 0) +
      (card.answer.toLowerCase().includes(lowerQuery) ? 1 : 0)

    if (matchScore > 0) {
      results.push({
        type: 'flashcard',
        id: card.id,
        bookId: card.bookId,
        bookName: '',
        title: card.question,
        thumbnail: card.image?.thumbnail,
        content: card.answer,
        relevance: matchScore
      })
    }
  })

  // 按相关性排序
  return results.sort((a, b) => b.relevance - a.relevance)
}

// ============================================================================
// 多模态统计
// ============================================================================

/**
 * 获取多模态内容统计
 */
export function getMultimodalStats(): {
  totalImages: number
  totalAudios: number
  totalVideos: number
  totalFlashcards: number
  totalStorage: number
} {
  const images = getImageNotes()
  const audios = getAudioNotes()
  const videos = getVideoNotes()
  const flashcards = getFlashcards()
  const resources = getMediaResources()

  // 估算存储大小（Base64 字符数 * 0.75 ≈ 字节数）
  let totalStorage = 0
  resources.forEach(r => {
    if (r.size) {
      totalStorage += r.size
    }
  })

  return {
    totalImages: images.length,
    totalAudios: audios.length,
    totalVideos: videos.length,
    totalFlashcards: flashcards.length,
    totalStorage
  }
}

// ============================================================================
// 媒体类型验证
// ============================================================================

/**
 * 允许的图片 MIME 类型
 */
export const ALLOWED_IMAGE_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp'
]

/**
 * 允许的音频 MIME 类型
 */
export const ALLOWED_AUDIO_TYPES = [
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/ogg',
  'audio/aac',
  'audio/m4a'
]

/**
 * 允许的视频 MIME 类型
 */
export const ALLOWED_VIDEO_TYPES = [
  'video/mp4',
  'video/webm',
  'video/ogg',
  'video/quicktime'
]

/**
 * 验证文件类型
 */
export function validateMediaType(file: File, mediaType: MediaType): boolean {
  const allowedTypes: Record<string, string[]> = {
    image: ALLOWED_IMAGE_TYPES,
    audio: ALLOWED_AUDIO_TYPES,
    video: ALLOWED_VIDEO_TYPES,
    document: [], // 文档类型暂不限制
    link: []      // 链接类型不需要验证
  }

  return allowedTypes[mediaType]?.includes(file.type) ?? false
}

/**
 * 验证文件大小
 */
export function validateMediaSize(file: File, maxSizeMB: number): boolean {
  const maxSizeBytes = maxSizeMB * 1024 * 1024
  return file.size <= maxSizeBytes
}
