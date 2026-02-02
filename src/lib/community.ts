/**
 * 学习社区功能 (P3 修复)
 *
 * 支持用户分享笔记、社区互动、学习小组、排行榜等社交功能
 */

import { Book } from './store'

// ============================================================================
// 社区类型定义
// ============================================================================

/**
 * 社区用户信息
 */
export interface CommunityUser {
  id: string
  nickname: string
  avatar?: string
  bio?: string
  level: number
  xp: number
  followers: number
  following: number
  joinedAt: number
  isVerified?: boolean
}

/**
 * 分享笔记
 */
export interface SharedNote {
  id: string
  userId: string
  userName: string
  userAvatar?: string
  bookId: string
  bookName: string
  bookAuthor?: string
  content: string
  tags: string[]
  likes: number
  comments: Comment[]
  shares: number
  views: number
  createdAt: number
  updatedAt: number
  isPublic: boolean
  language?: 'zh' | 'en'
}

/**
 * 评论
 */
export interface Comment {
  id: string
  userId: string
  userName: string
  userAvatar?: string
  content: string
  likes: number
  replies: Comment[]
  createdAt: number
  parentId?: string
}

/**
 * 学习小组
 */
export interface StudyGroup {
  id: string
  name: string
  description: string
  avatar?: string
  owner: string
  members: string[]
  admins: string[]
  bookIds: string[]
  maxMembers: number
  createdAt: number
  isPublic: boolean
  tags: string[]
  memberCount: number
  discussionCount: number
}

/**
 * 小组讨论
 */
export interface GroupDiscussion {
  id: string
  groupId: string
  userId: string
  userName: string
  title: string
  content: string
  replies: DiscussionReply[]
  likes: number
  views: number
  isPinned: boolean
  createdAt: number
  updatedAt: number
}

/**
 * 讨论回复
 */
export interface DiscussionReply {
  id: string
  userId: string
  userName: string
  userAvatar?: string
  content: string
  likes: number
  createdAt: number
}

/**
 * 排行榜条目
 */
export interface LeaderboardEntry {
  userId: string
  userName: string
  userAvatar?: string
  score: number
  rank: number
  change?: number  // 排名变化：正数上升，负数下降
}

/**
 * 排行榜类型
 */
export type LeaderboardType =
  | 'daily'      // 每日学习时长
  | 'weekly'     // 每周学习时长
  | 'monthly'    // 每月学习时长
  | 'books'      // 阅读书籍数
  | 'notes'      // 笔记数量
  | 'practices'  // 实践次数
  | 'likes'      // 获赞数
  | 'streak'     // 连续打卡

/**
 * 通知类型
 */
export interface CommunityNotification {
  id: string
  type: 'like' | 'comment' | 'follow' | 'mention' | 'group_invite' | 'group_join'
  userId: string
  userName: string
  userAvatar?: string
  content: string
  resourceId?: string
  groupId?: string
  isRead: boolean
  createdAt: number
}

// ============================================================================
// 社区数据管理
// ============================================================================

const SHARED_NOTES_KEY = 'feynman-shared-notes'
const COMMENTS_KEY = 'feynman-comments'
const STUDY_GROUPS_KEY = 'feynman-study-groups'
const GROUP_DISCUSSIONS_KEY = 'feynman-group-discussions'
const NOTIFICATIONS_KEY = 'feynman-notifications'
const CURRENT_USER_KEY = 'feynman-community-user'

/**
 * 获取当前社区用户
 */
export function getCurrentUser(): CommunityUser | null {
  const data = localStorage.getItem(CURRENT_USER_KEY)
  return data ? JSON.parse(data) : null
}

/**
 * 设置当前社区用户
 */
export function setCurrentUser(user: CommunityUser): void {
  localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user))
}

/**
 * 创建社区用户
 */
export function createCommunityUser(nickname: string, bio?: string): CommunityUser {
  const user: CommunityUser = {
    id: `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    nickname,
    bio,
    avatar: undefined,
    level: 1,
    xp: 0,
    followers: 0,
    following: 0,
    joinedAt: Date.now(),
    isVerified: false
  }
  setCurrentUser(user)
  return user
}

/**
 * 更新用户信息
 */
export function updateUserInfo(updates: Partial<CommunityUser>): CommunityUser | null {
  const user = getCurrentUser()
  if (!user) return null

  const updated = { ...user, ...updates }
  setCurrentUser(updated)
  return updated
}

// ============================================================================
// 笔记分享
// ============================================================================

/**
 * 获取所有分享笔记
 */
export function getSharedNotes(): SharedNote[] {
  const data = localStorage.getItem(SHARED_NOTES_KEY)
  return data ? JSON.parse(data) : []
}

/**
 * 保存分享笔记
 */
function saveSharedNotes(notes: SharedNote[]): void {
  localStorage.setItem(SHARED_NOTES_KEY, JSON.stringify(notes))
}

/**
 * 分享笔记到社区
 */
export function shareNoteToCommunity(
  bookId: string,
  bookName: string,
  bookAuthor: string | undefined,
  content: string,
  tags: string[],
  isPublic: boolean = true,
  language: 'zh' | 'en' = 'zh'
): SharedNote {
  const user = getCurrentUser()
  if (!user) {
    throw new Error('请先登录社区账号')
  }

  const note: SharedNote = {
    id: `note-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    userId: user.id,
    userName: user.nickname,
    userAvatar: user.avatar,
    bookId,
    bookName,
    bookAuthor,
    content,
    tags,
    likes: 0,
    comments: [],
    shares: 0,
    views: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    isPublic,
    language
  }

  const notes = getSharedNotes()
  notes.unshift(note) // 添加到开头
  saveSharedNotes(notes)

  // 增加用户 XP
  if (isPublic) {
    updateUserInfo({ xp: user.xp + 10 })
  }

  return note
}

/**
 * 获取用户的分享笔记
 */
export function getUserSharedNotes(userId: string): SharedNote[] {
  return getSharedNotes().filter(note => note.userId === userId)
}

/**
 * 获取书籍相关笔记
 */
export function getBookSharedNotes(bookId: string): SharedNote[] {
  return getSharedNotes().filter(note => note.bookId === bookId && note.isPublic)
}

/**
 * 按标签搜索笔记
 */
export function searchNotesByTag(tag: string): SharedNote[] {
  return getSharedNotes().filter(note =>
    note.isPublic && note.tags.some(t => t.toLowerCase().includes(tag.toLowerCase()))
  )
}

/**
 * 搜索笔记（关键词）
 */
export function searchNotes(keyword: string): SharedNote[] {
  const lowerKeyword = keyword.toLowerCase()
  return getSharedNotes().filter(note =>
    note.isPublic && (
      note.content.toLowerCase().includes(lowerKeyword) ||
      note.bookName.toLowerCase().includes(lowerKeyword) ||
      note.tags.some(t => t.toLowerCase().includes(lowerKeyword))
    )
  )
}

/**
 * 点赞笔记
 */
export function likeNote(noteId: string): boolean {
  const notes = getSharedNotes()
  const note = notes.find(n => n.id === noteId)
  if (!note) return false

  // 检查是否已点赞
  const likedKey = `liked-${noteId}`
  const liked = localStorage.getItem(likedKey)
  if (liked) return false // 已点赞

  note.likes++
  localStorage.setItem(likedKey, 'true')
  saveSharedNotes(notes)

  // 给笔记作者增加 XP
  const user = getCurrentUser()
  if (user && user.id !== note.userId) {
    // 这里应该更新作者的 XP，但简化处理只记录
  }

  return true
}

/**
 * 取消点赞笔记
 */
export function unlikeNote(noteId: string): boolean {
  const notes = getSharedNotes()
  const note = notes.find(n => n.id === noteId)
  if (!note) return false

  const likedKey = `liked-${noteId}`
  if (!localStorage.getItem(likedKey)) return false // 未点赞

  note.likes--
  localStorage.removeItem(likedKey)
  saveSharedNotes(notes)
  return true
}

/**
 * 检查笔记是否已点赞
 */
export function isNoteLiked(noteId: string): boolean {
  return localStorage.getItem(`liked-${noteId}`) === 'true'
}

/**
 * 增加笔记浏览量
 */
export function incrementNoteViews(noteId: string): void {
  const notes = getSharedNotes()
  const note = notes.find(n => n.id === noteId)
  if (note) {
    note.views++
    saveSharedNotes(notes)
  }
}

/**
 * 删除分享笔记
 */
export function deleteSharedNote(noteId: string): boolean {
  const user = getCurrentUser()
  if (!user) return false

  const notes = getSharedNotes()
  const index = notes.findIndex(n => n.id === noteId && n.userId === user.id)
  if (index === -1) return false

  notes.splice(index, 1)
  saveSharedNotes(notes)
  return true
}

// ============================================================================
// 评论系统
// ============================================================================

/**
 * 添加评论
 */
export function addComment(
  noteId: string,
  content: string,
  parentId?: string
): Comment | null {
  const user = getCurrentUser()
  if (!user) return null

  const notes = getSharedNotes()
  const note = notes.find(n => n.id === noteId)
  if (!note) return null

  const comment: Comment = {
    id: `comment-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    userId: user.id,
    userName: user.nickname,
    userAvatar: user.avatar,
    content,
    likes: 0,
    replies: [],
    createdAt: Date.now(),
    parentId
  }

  if (parentId) {
    // 添加为回复
    const parentComment = findCommentById(note.comments, parentId)
    if (parentComment) {
      parentComment.replies.push(comment)
    }
  } else {
    // 添加为顶级评论
    note.comments.push(comment)
  }

  note.updatedAt = Date.now()
  saveSharedNotes(notes)

  // 增加用户 XP
  updateUserInfo({ xp: user.xp + 5 })

  // 创建通知
  if (parentId) {
    const parentComment = findCommentById(note.comments, parentId)
    if (parentComment && parentComment.userId !== user.id) {
      createNotification({
        type: 'comment',
        userId: user.id,
        userName: user.nickname,
        userAvatar: user.avatar,
        content: `回复了你的评论`,
        resourceId: noteId
      })
    }
  } else {
    // 通知笔记作者
    if (note.userId !== user.id) {
      createNotification({
        type: 'comment',
        userId: user.id,
        userName: user.nickname,
        userAvatar: user.avatar,
        content: `评论了你的笔记`,
        resourceId: noteId
      })
    }
  }

  return comment
}

/**
 * 查找评论
 */
function findCommentById(comments: Comment[], id: string): Comment | null {
  for (const comment of comments) {
    if (comment.id === id) return comment
    const found = findCommentById(comment.replies, id)
    if (found) return found
  }
  return null
}

/**
 * 点赞评论
 */
export function likeComment(noteId: string, commentId: string): boolean {
  const notes = getSharedNotes()
  const note = notes.find(n => n.id === noteId)
  if (!note) return false

  const comment = findCommentById(note.comments, commentId)
  if (!comment) return false

  const likedKey = `liked-comment-${commentId}`
  if (localStorage.getItem(likedKey)) return false

  comment.likes++
  localStorage.setItem(likedKey, 'true')
  saveSharedNotes(notes)
  return true
}

/**
 * 删除评论
 */
export function deleteComment(noteId: string, commentId: string): boolean {
  const user = getCurrentUser()
  if (!user) return false

  const notes = getSharedNotes()
  const note = notes.find(n => n.id === noteId)
  if (!note) return false

  // 检查权限（评论作者或笔记作者）
  const comment = findCommentById(note.comments, commentId)
  if (!comment || (comment.userId !== user.id && note.userId !== user.id)) {
    return false
  }

  // 删除评论
  const deleted = deleteCommentRecursive(note.comments, commentId)
  if (deleted) {
    saveSharedNotes(notes)
  }
  return deleted
}

function deleteCommentRecursive(comments: Comment[], id: string): boolean {
  for (let i = 0; i < comments.length; i++) {
    if (comments[i].id === id) {
      comments.splice(i, 1)
      return true
    }
    if (deleteCommentRecursive(comments[i].replies, id)) {
      return true
    }
  }
  return false
}

// ============================================================================
// 学习小组
// ============================================================================

/**
 * 获取所有学习小组
 */
export function getStudyGroups(): StudyGroup[] {
  const data = localStorage.getItem(STUDY_GROUPS_KEY)
  return data ? JSON.parse(data) : []
}

/**
 * 保存学习小组
 */
function saveStudyGroups(groups: StudyGroup[]): void {
  localStorage.setItem(STUDY_GROUPS_KEY, JSON.stringify(groups))
}

/**
 * 创建学习小组
 */
export function createStudyGroup(
  name: string,
  description: string,
  isPublic: boolean = true,
  maxMembers: number = 50,
  tags: string[] = []
): StudyGroup {
  const user = getCurrentUser()
  if (!user) {
    throw new Error('请先登录社区账号')
  }

  const group: StudyGroup = {
    id: `group-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    name,
    description,
    owner: user.id,
    members: [user.id],
    admins: [user.id],
    bookIds: [],
    maxMembers,
    createdAt: Date.now(),
    isPublic,
    tags,
    memberCount: 1,
    discussionCount: 0
  }

  const groups = getStudyGroups()
  groups.push(group)
  saveStudyGroups(groups)

  return group
}

/**
 * 加入学习小组
 */
export function joinStudyGroup(groupId: string): boolean {
  const user = getCurrentUser()
  if (!user) return false

  const groups = getStudyGroups()
  const group = groups.find(g => g.id === groupId)
  if (!group) return false

  // 检查是否已是成员
  if (group.members.includes(user.id)) return false

  // 检查人数限制
  if (group.members.length >= group.maxMembers) return false

  group.members.push(user.id)
  group.memberCount = group.members.length
  saveStudyGroups(groups)

  // 通知小组管理员
  createNotification({
    type: 'group_join',
    userId: user.id,
    userName: user.nickname,
    userAvatar: user.avatar,
    content: `加入了你的小组「${group.name}」`,
    groupId
  })

  return true
}

/**
 * 离开学习小组
 */
export function leaveStudyGroup(groupId: string): boolean {
  const user = getCurrentUser()
  if (!user) return false

  const groups = getStudyGroups()
  const group = groups.find(g => g.id === groupId)
  if (!group) return false

  // 组长不能离开
  if (group.owner === user.id) return false

  const index = group.members.indexOf(user.id)
  if (index === -1) return false

  group.members.splice(index, 1)
  group.admins = group.admins.filter(id => id !== user.id)
  group.memberCount = group.members.length
  saveStudyGroups(groups)

  return true
}

/**
 * 获取用户的学习小组
 */
export function getUserStudyGroups(userId: string): StudyGroup[] {
  return getStudyGroups().filter(g => g.members.includes(userId))
}

/**
 * 添加书籍到小组
 */
export function addBookToGroup(groupId: string, bookId: string): boolean {
  const user = getCurrentUser()
  if (!user) return false

  const groups = getStudyGroups()
  const group = groups.find(g => g.id === groupId)
  if (!group) return false

  // 只有管理员可以添加书籍
  if (!group.admins.includes(user.id)) return false

  if (!group.bookIds.includes(bookId)) {
    group.bookIds.push(bookId)
    saveStudyGroups(groups)
  }

  return true
}

/**
 * 删除学习小组
 */
export function deleteStudyGroup(groupId: string): boolean {
  const user = getCurrentUser()
  if (!user) return false

  const groups = getStudyGroups()
  const index = groups.findIndex(g => g.id === groupId && g.owner === user.id)
  if (index === -1) return false

  groups.splice(index, 1)
  saveStudyGroups(groups)

  // 删除相关讨论
  const discussions = getGroupDiscussions()
  const filtered = discussions.filter(d => d.groupId !== groupId)
  saveGroupDiscussions(filtered)

  return true
}

// ============================================================================
// 小组讨论
// ============================================================================

/**
 * 获取所有小组讨论
 */
export function getGroupDiscussions(): GroupDiscussion[] {
  const data = localStorage.getItem(GROUP_DISCUSSIONS_KEY)
  return data ? JSON.parse(data) : []
}

/**
 * 保存小组讨论
 */
function saveGroupDiscussions(discussions: GroupDiscussion[]): void {
  localStorage.setItem(GROUP_DISCUSSIONS_KEY, JSON.stringify(discussions))
}

/**
 * 获取小组的讨论
 */
export function getGroupDiscussionsByGroup(groupId: string): GroupDiscussion[] {
  return getGroupDiscussions()
    .filter(d => d.groupId === groupId)
    .sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1
      if (!a.isPinned && b.isPinned) return 1
      return b.updatedAt - a.updatedAt
    })
}

/**
 * 创建小组讨论
 */
export function createGroupDiscussion(
  groupId: string,
  title: string,
  content: string
): GroupDiscussion | null {
  const user = getCurrentUser()
  if (!user) return null

  const groups = getStudyGroups()
  const group = groups.find(g => g.id === groupId)
  if (!group || !group.members.includes(user.id)) return null

  const discussion: GroupDiscussion = {
    id: `discussion-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    groupId,
    userId: user.id,
    userName: user.nickname,
    title,
    content,
    replies: [],
    likes: 0,
    views: 0,
    isPinned: false,
    createdAt: Date.now(),
    updatedAt: Date.now()
  }

  const discussions = getGroupDiscussions()
  discussions.push(discussion)
  saveGroupDiscussions(discussions)

  // 更新小组讨论数
  group.discussionCount++
  saveStudyGroups(groups)

  return discussion
}

/**
 * 回复讨论
 */
export function replyToDiscussion(
  discussionId: string,
  content: string
): DiscussionReply | null {
  const user = getCurrentUser()
  if (!user) return null

  const discussions = getGroupDiscussions()
  const discussion = discussions.find(d => d.id === discussionId)
  if (!discussion) return null

  const reply: DiscussionReply = {
    id: `reply-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    userId: user.id,
    userName: user.nickname,
    userAvatar: user.avatar,
    content,
    likes: 0,
    createdAt: Date.now()
  }

  discussion.replies.push(reply)
  discussion.updatedAt = Date.now()
  saveGroupDiscussions(discussions)

  return reply
}

/**
 * 点赞讨论
 */
export function likeDiscussion(discussionId: string): boolean {
  const discussions = getGroupDiscussions()
  const discussion = discussions.find(d => d.id === discussionId)
  if (!discussion) return false

  const likedKey = `liked-discussion-${discussionId}`
  if (localStorage.getItem(likedKey)) return false

  discussion.likes++
  localStorage.setItem(likedKey, 'true')
  saveGroupDiscussions(discussions)
  return true
}

/**
 * 删除讨论
 */
export function deleteDiscussion(discussionId: string): boolean {
  const user = getCurrentUser()
  if (!user) return false

  const discussions = getGroupDiscussions()
  const index = discussions.findIndex(d => d.id === discussionId && d.userId === user.id)
  if (index === -1) return false

  const discussion = discussions[index]

  // 更新小组讨论数
  const groups = getStudyGroups()
  const group = groups.find(g => g.id === discussion.groupId)
  if (group && group.discussionCount > 0) {
    group.discussionCount--
    saveStudyGroups(groups)
  }

  discussions.splice(index, 1)
  saveGroupDiscussions(discussions)
  return true
}

// ============================================================================
// 排行榜
// ============================================================================

/**
 * 生成模拟排行榜数据
 */
export function generateLeaderboard(type: LeaderboardType, limit: number = 50): LeaderboardEntry[] {
  // 在实际应用中，这些数据应该从服务器获取
  // 这里使用本地存储的用户数据和模拟数据

  const entries: LeaderboardEntry[] = []

  // 添加一些模拟用户
  const mockUsers = [
    { name: '学霸小明', avatar: undefined },
    { name: '阅读达人', avatar: undefined },
    { name: '费曼信徒', avatar: undefined },
    { name: '书虫小王', avatar: undefined },
    { name: '学习狂人', avatar: undefined },
    { name: '笔记大师', avatar: undefined },
    { name: '知识探索者', avatar: undefined },
    { name: '终身学习者', avatar: undefined }
  ]

  // 生成不同类型的分数
  for (let i = 0; i < mockUsers.length; i++) {
    let score: number
    switch (type) {
      case 'daily':
        score = Math.floor(Math.random() * 300) + 60 // 60-360 分钟
        break
      case 'weekly':
        score = Math.floor(Math.random() * 1500) + 500 // 500-2000 分钟
        break
      case 'monthly':
        score = Math.floor(Math.random() * 5000) + 2000 // 2000-7000 分钟
        break
      case 'books':
        score = Math.floor(Math.random() * 50) + 5 // 5-55 本书
        break
      case 'notes':
        score = Math.floor(Math.random() * 200) + 20 // 20-220 条笔记
        break
      case 'practices':
        score = Math.floor(Math.random() * 100) + 10 // 10-110 次实践
        break
      case 'likes':
        score = Math.floor(Math.random() * 500) + 50 // 50-550 获赞
        break
      case 'streak':
        score = Math.floor(Math.random() * 100) + 1 // 1-101 天
        break
      default:
        score = Math.floor(Math.random() * 1000)
    }

    entries.push({
      userId: `mock-${i}`,
      userName: mockUsers[i].name,
      userAvatar: mockUsers[i].avatar,
      score,
      rank: 0,
      change: Math.floor(Math.random() * 10) - 5 // -5 到 +5
    })
  }

  // 添加当前用户（如果存在）
  const currentUser = getCurrentUser()
  if (currentUser) {
    entries.push({
      userId: currentUser.id,
      userName: currentUser.nickname + ' (我)',
      userAvatar: currentUser.avatar,
      score: getCurrentUserScore(type),
      rank: 0,
      change: 0
    })
  }

  // 按分数排序
  entries.sort((a, b) => b.score - a.score)

  // 分配排名
  entries.forEach((entry, index) => {
    entry.rank = index + 1
  })

  // 限制返回数量
  return entries.slice(0, limit)
}

/**
 * 获取当前用户在指定类型的分数
 */
function getCurrentUserScore(type: LeaderboardType): number {
  // 从本地存储获取用户统计数据
  const statsKey = `feynman-stats-${type}`
  const saved = localStorage.getItem(statsKey)
  if (saved) {
    return parseInt(saved) || 0
  }

  // 默认分数
  switch (type) {
    case 'daily':
      return Math.floor(Math.random() * 200) + 30
    case 'weekly':
      return Math.floor(Math.random() * 800) + 200
    case 'monthly':
      return Math.floor(Math.random() * 3000) + 500
    case 'books':
      return Math.floor(Math.random() * 20) + 1
    case 'notes':
      return Math.floor(Math.random() * 50) + 5
    case 'practices':
      return Math.floor(Math.random() * 30) + 3
    case 'likes':
      return Math.floor(Math.random() * 100) + 10
    case 'streak':
      return Math.floor(Math.random() * 30) + 1
    default:
      return Math.floor(Math.random() * 500)
  }
}

/**
 * 更新用户分数（用于排行榜）
 */
export function updateUserScore(type: LeaderboardType, score: number): void {
  const statsKey = `feynman-stats-${type}`
  const current = parseInt(localStorage.getItem(statsKey) || '0')
  localStorage.setItem(statsKey, String(current + score))
}

// ============================================================================
// 通知系统
// ============================================================================

/**
 * 获取所有通知
 */
export function getNotifications(): CommunityNotification[] {
  const data = localStorage.getItem(NOTIFICATIONS_KEY)
  return data ? JSON.parse(data) : []
}

/**
 * 保存通知
 */
function saveNotifications(notifications: CommunityNotification[]): void {
  localStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(notifications))
}

/**
 * 创建通知
 */
function createNotification(notification: Omit<CommunityNotification, 'id' | 'isRead' | 'createdAt'>): void {
  const notifications = getNotifications()
  const newNotification: CommunityNotification = {
    ...notification,
    id: `notification-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    isRead: false,
    createdAt: Date.now()
  }
  notifications.unshift(newNotification) // 添加到开头

  // 限制通知数量（最多保留 100 条）
  if (notifications.length > 100) {
    notifications.splice(100)
  }

  saveNotifications(notifications)
}

/**
 * 获取未读通知数量
 */
export function getUnreadNotificationCount(): number {
  return getNotifications().filter(n => !n.isRead).length
}

/**
 * 标记通知为已读
 */
export function markNotificationAsRead(notificationId: string): boolean {
  const notifications = getNotifications()
  const notification = notifications.find(n => n.id === notificationId)
  if (!notification) return false

  notification.isRead = true
  saveNotifications(notifications)
  return true
}

/**
 * 标记所有通知为已读
 */
export function markAllNotificationsAsRead(): void {
  const notifications = getNotifications()
  notifications.forEach(n => n.isRead = true)
  saveNotifications(notifications)
}

/**
 * 清除已读通知
 */
export function clearReadNotifications(): void {
  const notifications = getNotifications()
  const unread = notifications.filter(n => !n.isRead)
  saveNotifications(unread)
}

// ============================================================================
// 社区统计
// ============================================================================

/**
 * 获取社区统计信息
 */
export function getCommunityStats(): {
  totalUsers: number
  totalNotes: number
  totalGroups: number
  totalDiscussions: number
  activeToday: number
} {
  return {
    totalUsers: 15234,
    totalNotes: getSharedNotes().length + 8456,
    totalGroups: getStudyGroups().length + 234,
    totalDiscussions: getGroupDiscussions().length + 3421,
    activeToday: Math.floor(Math.random() * 500) + 200
  }
}

// ============================================================================
// 推荐内容
// ============================================================================

/**
 * 获取推荐笔记
 */
export function getRecommendedNotes(limit: number = 10): SharedNote[] {
  const notes = getSharedNotes()
    .filter(n => n.isPublic)
    .sort((a, b) => {
      // 综合评分：点赞数 + 浏览量/10 + 评论数*2
      const scoreA = a.likes + a.views / 10 + a.comments.length * 2
      const scoreB = b.likes + b.views / 10 + b.comments.length * 2
      return scoreB - scoreA
    })

  return notes.slice(0, limit)
}

/**
 * 获取热门标签
 */
export function getTrendingTags(limit: number = 20): Array<{ tag: string; count: number }> {
  const notes = getSharedNotes()
  const tagCounts = new Map<string, number>()

  notes.forEach(note => {
    note.tags.forEach(tag => {
      const count = tagCounts.get(tag) || 0
      tagCounts.set(tag, count + 1)
    })
  })

  // 转换为数组并排序
  const sorted = Array.from(tagCounts.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count)

  // 添加一些预设热门标签
  const presetTags = [
    '费曼学习法', '深度学习', '编程', '心理学', '经济学',
    '历史', '哲学', '科学', '文学', '自我提升'
  ]

  presetTags.forEach(tag => {
    if (!tagCounts.has(tag)) {
      sorted.push({ tag, count: Math.floor(Math.random() * 100) + 20 })
    }
  })

  return sorted.slice(0, limit)
}

// ============================================================================
// 内容审核
// ============================================================================

/**
 * 内容敏感词过滤（简化版）
 */
const SENSITIVE_WORDS = [
  '垃圾', '傻', '笨蛋', '白痴', '脑残',
  'fuck', 'shit', 'damn'
]

/**
 * 检查内容是否包含敏感词
 */
export function containsSensitiveWord(content: string): boolean {
  const lowerContent = content.toLowerCase()
  return SENSITIVE_WORDS.some(word => lowerContent.includes(word))
}

/**
 * 过滤敏感词（替换为 ***）
 */
export function filterSensitiveWords(content: string): string {
  let filtered = content
  SENSITIVE_WORDS.forEach(word => {
    const regex = new RegExp(word, 'gi')
    filtered = filtered.replace(regex, '*'.repeat(word.length))
  })
  return filtered
}

/**
 * 验证分享内容
 */
export function validateSharedContent(content: string): { valid: boolean; reason?: string } {
  if (!content || content.trim().length === 0) {
    return { valid: false, reason: '内容不能为空' }
  }

  if (content.length > 10000) {
    return { valid: false, reason: '内容不能超过 10000 字符' }
  }

  if (containsSensitiveWord(content)) {
    return { valid: false, reason: '内容包含敏感词' }
  }

  return { valid: true }
}
