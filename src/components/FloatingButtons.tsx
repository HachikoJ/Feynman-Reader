'use client'

import { useState, useEffect } from 'react'

export default function FloatingButtons() {
  const [showTop, setShowTop] = useState(false)
  const [showBottom, setShowBottom] = useState(true)

  useEffect(() => {
    const handleScroll = () => {
      const scrollTop = window.scrollY
      const scrollHeight = document.documentElement.scrollHeight
      const clientHeight = window.innerHeight
      
      setShowTop(scrollTop > 300)
      setShowBottom(scrollTop < scrollHeight - clientHeight - 300)
    }

    window.addEventListener('scroll', handleScroll)
    handleScroll()
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const scrollToBottom = () => {
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' })
  }

  return (
    <div className="fixed right-6 bottom-6 flex flex-col gap-3 z-50">
      {showTop && (
        <button
          onClick={scrollToTop}
          className="w-12 h-12 rounded-full bg-[var(--accent)] text-white shadow-lg 
                     hover:scale-110 transition-all flex items-center justify-center
                     animate-fade-in"
          title="回到顶部"
        >
          ↑
        </button>
      )}
      {showBottom && (
        <button
          onClick={scrollToBottom}
          className="w-12 h-12 rounded-full bg-[var(--bg-card)] border border-[var(--border)] 
                     text-[var(--text-primary)] shadow-lg hover:scale-110 transition-all 
                     flex items-center justify-center animate-fade-in"
          title="去到底部"
        >
          ↓
        </button>
      )}
    </div>
  )
}
