'use client'

interface Props {
  children: React.ReactNode
}

export default function AuthGuard({ children }: Props) {
  return <>{children}</>
}
