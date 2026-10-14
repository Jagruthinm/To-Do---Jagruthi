import { clsx } from 'clsx'
import styles from './Badge.module.css'

type Variant = 'red' | 'blue' | 'amber' | 'green' | 'gray'

interface Props {
  children: React.ReactNode
  variant?: Variant
  className?: string
}

export function Badge({ children, variant = 'gray', className }: Props) {
  return (
    <span className={clsx(styles.badge, styles[variant], className)}>
      {children}
    </span>
  )
}
