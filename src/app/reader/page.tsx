'use client'

import { useEffect } from 'react'
import { APP_ROUTES } from '@/lib/appRoutes'

// Preserve old bookmarks and OAuth links after moving the product to its own
// subdomain. Query parameters and hashes are retained for deep links.
export default function LegacyReaderRoute() {
  useEffect(() => {
    const destination = new URL(window.location.origin)
    destination.pathname = APP_ROUTES.home
    destination.search = window.location.search
    destination.hash = window.location.hash
    window.location.replace(destination.toString())
  }, [])

  return null
}
