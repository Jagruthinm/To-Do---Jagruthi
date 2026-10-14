import { useNavigate } from 'react-router-dom'
import { IconChevronLeft } from '@tabler/icons-react'
import styles from './TopBar.module.css'

interface Props {
  title: string
  subtitle?: string
  showBack?: boolean
  right?: React.ReactNode
}

export function TopBar({ title, subtitle, showBack, right }: Props) {
  const navigate = useNavigate()
  return (
    <div className={styles.bar}>
      <div className={styles.left}>
        {showBack && (
          <button onClick={() => navigate(-1)} className={styles.backBtn} aria-label="Go back">
            <IconChevronLeft size={22} />
          </button>
        )}
      </div>
      <div className={styles.center}>
        <span className={styles.title}>{title}</span>
        {subtitle && <span className={styles.subtitle}>{subtitle}</span>}
      </div>
      <div className={styles.right}>{right}</div>
    </div>
  )
}
