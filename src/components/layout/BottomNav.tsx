import { NavLink } from 'react-router-dom'
import { IconCalendar, IconCalendarEvent, IconLayoutGrid, IconRepeat } from '@tabler/icons-react'
import styles from './BottomNav.module.css'

const TABS = [
  { to: '/today',    icon: <IconCalendar size={22} />,      label: 'Today' },
  { to: '/calendar', icon: <IconCalendarEvent size={22} />, label: 'Calendar' },
  { to: '/projects', icon: <IconLayoutGrid size={22} />,    label: 'Projects' },
  { to: '/habits',   icon: <IconRepeat size={22} />,        label: 'Habits' },
]

export function BottomNav() {
  return (
    <nav className={styles.nav} aria-label="Main navigation">
      {TABS.map(t => (
        <NavLink
          key={t.to}
          to={t.to}
          className={({ isActive }) => `${styles.item} ${isActive ? styles.active : ''}`}
          aria-label={t.label}
        >
          {t.icon}
          <span className={styles.label}>{t.label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
