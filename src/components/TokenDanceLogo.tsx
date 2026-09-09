import styles from './TokenDanceLogo.module.css'

const LIGHT_LOGO_URL = 'https://tokendance.space/TokenDance%E5%93%81%E7%89%8C%E5%9B%BE%E6%A0%87-%E9%80%8F%E6%98%8E%E5%BA%95.svg'
const DARK_LOGO_URL = 'https://tokendance.space/TokenDance%E5%93%81%E7%89%8C%E5%9B%BE%E6%A0%87-%E9%BB%91%E8%89%B2%E5%BA%95.svg'

export default function TokenDanceLogo({ className = 'h-8 w-auto' }: { className?: string }) {
  return <span role="img" aria-label="TokenDance" className={`${styles.logo} ${className}`}>
    <img src={LIGHT_LOGO_URL} alt="" width={1270} height={440} className={`${styles.image} ${styles.light}`} />
    <img src={DARK_LOGO_URL} alt="" width={1270} height={440} className={`${styles.image} ${styles.dark}`} />
  </span>
}
