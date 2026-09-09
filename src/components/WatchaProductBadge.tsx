import Image from 'next/image'
import styles from './WatchaProductBadge.module.css'

export default function WatchaProductBadge({ lang }: { lang: 'zh' | 'en' }) {
  const alt = lang === 'zh' ? '费曼读书助手 观猹徽章' : 'Feynman Reader on Watcha'

  return (
    <a
      href="https://watcha.cn/products/fei-man-du-shu-zhu-shou?utm_source=product-badge&utm_content=invite"
      target="_blank"
      rel="noopener noreferrer"
      className={`${styles.badge} mx-auto mt-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-4 focus-visible:ring-offset-[var(--bg-primary)]`}
    >
      <Image src="https://tos.watcha.cn/public/images/invite-1-white.png" alt={alt} width={4500} height={972} unoptimized className={styles.light} />
      <Image src="https://tos.watcha.cn/public/images/invite-1-black.png" alt={alt} width={4500} height={972} unoptimized className={styles.dark} />
    </a>
  )
}
