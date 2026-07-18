'use client'

import { useState, useEffect } from 'react'
import AppIcon from './AppIcon'

export default function BackToTop() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    const handleScroll = () => {
      setShow(window.scrollY > 200)
    }
    
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  if (!show) return null

  return (
    <button
      onClick={scrollToTop}
      className="fixed bottom-6 right-6 z-50 hidden h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-[var(--accent)] to-[var(--accent-secondary)] text-white shadow-lg shadow-[var(--accent)]/30 transition-transform hover:scale-110 active:scale-95 sm:flex"
      aria-label="Back to top"
    >
      <AppIcon name="arrowUp" size={20} strokeWidth={2.5} />
    </button>
  )
}
