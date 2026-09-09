import Image from 'next/image'

interface Props {
  size?: number
  variant?: 'round' | 'rounded'
  className?: string
}

export default function WatchaLogo({ size = 24, variant = 'round', className = '' }: Props) {
  return (
    <Image
      src={`/brand/watcha/icon-${variant}.svg`}
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      unoptimized
      className={`inline-block shrink-0 object-contain ${className}`}
      style={{ width: size, height: size }}
    />
  )
}
