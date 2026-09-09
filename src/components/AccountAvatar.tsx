'use client'

import { useState } from 'react'
import { UserRound } from 'lucide-react'
import WatchaLogo from './WatchaLogo'

interface Props {
  avatarUrl?: string
  name?: string
  watcha?: boolean
  size?: number
}

export default function AccountAvatar({ avatarUrl, name, watcha = false, size = 24 }: Props) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  const source = avatarUrl?.trim()

  return (
    <span
      className="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {source && source !== failedUrl ? (
        // User avatars may be remote or an unsaved upload preview.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={source} alt="" width={size} height={size} className="h-full w-full object-cover" onError={() => setFailedUrl(source)} />
      ) : watcha ? (
        <WatchaLogo size={size} />
      ) : name ? (
        <span className="flex h-full w-full items-center justify-center bg-[var(--accent)] font-semibold text-white" style={{ fontSize: size <= 24 ? 12 : 20 }}>
          {Array.from(name)[0]}
        </span>
      ) : (
        <UserRound size={Math.round(size * 2 / 3)} aria-hidden="true" />
      )}
    </span>
  )
}
