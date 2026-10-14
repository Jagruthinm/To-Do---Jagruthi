import { IconPlus } from '@tabler/icons-react'
import styles from './FAB.module.css'

interface Props {
  onClick: () => void
}

export function FAB({ onClick }: Props) {
  return (
    <button className={styles.fab} onClick={onClick} aria-label="Add new task">
      <IconPlus size={24} />
    </button>
  )
}
