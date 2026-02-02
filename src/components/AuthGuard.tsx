'use client'

import { useState, useEffect } from 'react'

const UNIVERSAL_CODE = '18682408521'  // 万能激活码
const USAGE_COUNT_KEY = 'feynman-usage-count'
const ACTIVATED_KEY = 'feynman-activated'
const MACHINE_ID_KEY = 'feynman-machine-id'
const MAX_TRIAL_COUNT = 10  // 免费试用10次

interface Props {
  children: React.ReactNode
}

// 生成机器码（基于浏览器指纹）
function generateMachineId(): string {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.textBaseline = 'top'
    ctx.font = '14px Arial'
    ctx.fillText('feynman-reading', 2, 2)
  }
  const canvasData = canvas.toDataURL()
  
  const info = [
    navigator.userAgent,
    navigator.language,
    screen.width + 'x' + screen.height,
    screen.colorDepth,
    new Date().getTimezoneOffset(),
    canvasData
  ].join('|')
  
  // 简单哈希
  let hash = 0
  for (let i = 0; i < info.length; i++) {
    const char = info.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  
  // 转为16进制并格式化为易读的机器码
  const hex = Math.abs(hash).toString(16).toUpperCase().padStart(8, '0')
  return `FM-${hex.slice(0, 4)}-${hex.slice(4, 8)}`
}

// 根据机器码生成对应的激活码
function generateActivationCode(machineId: string): string {
  // 简单算法：机器码反转 + 偏移
  const core = machineId.replace(/FM-|-/g, '')
  let code = ''
  for (let i = core.length - 1; i >= 0; i--) {
    const char = core.charCodeAt(i)
    const newChar = String.fromCharCode(((char - 48 + 7) % 43) + 48)
    code += newChar
  }
  return `AC-${code.slice(0, 4)}-${code.slice(4, 8)}`
}

export default function AuthGuard({ children }: Props) {
  const [status, setStatus] = useState<'loading' | 'trial' | 'expired' | 'activated'>('loading')
  const [usageCount, setUsageCount] = useState(0)
  const [machineId, setMachineId] = useState('')
  const [inputCode, setInputCode] = useState('')
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    // 生成或获取机器码
    let mid = localStorage.getItem(MACHINE_ID_KEY)
    if (!mid) {
      mid = generateMachineId()
      localStorage.setItem(MACHINE_ID_KEY, mid)
    }
    setMachineId(mid)
    
    // 检查是否已永久激活
    const activated = localStorage.getItem(ACTIVATED_KEY) === 'true'
    if (activated) {
      setStatus('activated')
      return
    }
    
    // 检查试用次数
    const count = parseInt(localStorage.getItem(USAGE_COUNT_KEY) || '0', 10)
    
    if (count >= MAX_TRIAL_COUNT) {
      // 试用已过期
      setUsageCount(count)
      setStatus('expired')
      return
    }
    
    // 增加使用次数
    const newCount = count + 1
    localStorage.setItem(USAGE_COUNT_KEY, newCount.toString())
    setUsageCount(newCount)
    setStatus('trial')
  }, [])

  const handleActivate = () => {
    const code = inputCode.trim()
    const expectedCode = generateActivationCode(machineId)
    
    // 检查万能激活码或机器码对应的激活码
    if (code === UNIVERSAL_CODE || code.toUpperCase() === expectedCode) {
      localStorage.setItem(ACTIVATED_KEY, 'true')
      setStatus('activated')
      setError('')
    } else {
      setError('激活码无效，请确认输入正确')
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleActivate()
    }
  }

  const handleCopyMachineId = async () => {
    try {
      await navigator.clipboard.writeText(machineId)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // fallback
      const input = document.createElement('input')
      input.value = machineId
      document.body.appendChild(input)
      input.select()
      document.execCommand('copy')
      document.body.removeChild(input)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  // 加载中
  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-primary)]">
        <div className="text-2xl animate-pulse">加载中...</div>
      </div>
    )
  }

  // 试用已过期，需要激活
  if (status === 'expired') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-primary)] p-4">
        <div className="card max-w-md w-full p-8 text-center">
          <div className="text-6xl mb-4">⏰</div>
          <h1 className="text-2xl font-bold mb-2 text-yellow-400">试用已结束</h1>
          <p className="text-[var(--text-secondary)] mb-6">
            您已试用 {usageCount} 次，请激活正式版继续使用
          </p>
          
          {/* 机器码 */}
          <div className="bg-[var(--bg-secondary)] rounded-lg p-4 mb-4">
            <p className="text-xs text-[var(--text-secondary)] mb-2">您的机器码</p>
            <div className="flex items-center justify-center gap-2">
              <code className="text-lg font-mono text-[var(--accent)]">{machineId}</code>
              <button 
                onClick={handleCopyMachineId}
                className="text-sm px-2 py-1 bg-[var(--accent)]/20 rounded hover:bg-[var(--accent)]/30"
              >
                {copied ? '✓ 已复制' : '复制'}
              </button>
            </div>
          </div>
          
          <p className="text-xs text-[var(--text-secondary)] mb-4">
            请将机器码发送给管理员获取激活码
          </p>
          
          {/* 激活码输入 */}
          <input
            type="text"
            value={inputCode}
            onChange={e => setInputCode(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="请输入激活码"
            className="input-field text-center text-lg font-mono mb-4"
            autoFocus
          />
          
          {error && (
            <p className="text-red-400 text-sm mb-4">{error}</p>
          )}
          
          <button 
            onClick={handleActivate}
            className="btn-primary w-full"
          >
            激活软件
          </button>
        </div>
      </div>
    )
  }

  // 试用中
  if (status === 'trial') {
    const remaining = MAX_TRIAL_COUNT - usageCount
    return (
      <>
        {/* 试用提示条 - 更醒目的样式 */}
        <div 
          className="fixed top-0 left-0 right-0 z-50 py-2 text-center text-sm font-medium"
          style={{
            background: remaining <= 3 
              ? 'linear-gradient(90deg, #dc2626, #f97316)' 
              : 'linear-gradient(90deg, #f59e0b, #eab308)',
            color: '#fff',
            textShadow: '0 1px 2px rgba(0,0,0,0.3)'
          }}
        >
          ⚠️ 试用版 | 已使用 {usageCount}/{MAX_TRIAL_COUNT} 次，剩余 {remaining} 次
        </div>
        {/* 给顶部留出空间 */}
        <div style={{ paddingTop: '36px' }}>
          {children}
        </div>
      </>
    )
  }

  // 已激活
  return (
    <>
      <div className="fixed bottom-4 right-4 z-50 px-4 py-2 bg-green-600 rounded-lg text-sm text-white font-medium shadow-lg">
        ✓ 已激活正式版
      </div>
      {children}
    </>
  )
}
