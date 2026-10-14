import { NavLink, useNavigate } from 'react-router-dom'
import { IconCalendar, IconCalendarEvent, IconInbox, IconLayoutGrid, IconRepeat, IconPlus, IconChecks, IconLogout, IconChartBar, IconBell } from '@tabler/icons-react'
import { useAuth } from '@/hooks/useAuth'
import { NotificationBell } from '@/components/ui/NotificationBell'
import styles from './SideNav.module.css'

const MatrixIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="2" y="2" width="6" height="6" rx="1" />
    <rect x="10" y="2" width="6" height="6" rx="1" />
    <rect x="2" y="10" width="6" height="6" rx="1" />
    <rect x="10" y="10" width="6" height="6" rx="1" />
  </svg>
)

const ReportsIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M9 2l1.5 3h3l-2.5 2 1 3L9 8.5 7 10l1-3L5.5 5h3z" />
    <line x1="9" y1="11" x2="9" y2="16" />
    <line x1="5" y1="16" x2="13" y2="16" />
  </svg>
)

const ChatIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M9 2C5.134 2 2 4.91 2 8.5c0 1.18.35 2.28.95 3.21L2 16l4.29-.95A7.3 7.3 0 0 0 9 15c3.866 0 7-2.91 7-6.5S12.866 2 9 2z" />
  </svg>
)

const PlanIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
    <circle cx="9" cy="9" r="4" />
    <line x1="9" y1="1" x2="9" y2="3" />
    <line x1="9" y1="15" x2="9" y2="17" />
    <line x1="1" y1="9" x2="3" y2="9" />
    <line x1="15" y1="9" x2="17" y2="9" />
    <line x1="3.2" y1="3.2" x2="4.6" y2="4.6" />
    <line x1="13.4" y1="13.4" x2="14.8" y2="14.8" />
    <line x1="14.8" y1="3.2" x2="13.4" y2="4.6" />
    <line x1="3.2" y1="14.8" x2="4.6" y2="13.4" />
  </svg>
)

const LINKS = [
  { to: '/plan',     icon: <PlanIcon />,                    label: 'My Day' },
  { to: '/calendar', icon: <IconCalendarEvent size={18} />, label: 'Calendar' },
  { to: '/projects', icon: <IconLayoutGrid size={18} />,    label: 'Projects' },
  { to: '/habits',   icon: <IconRepeat size={18} />,        label: 'Habits' },
  { to: '/stats',    icon: <IconChartBar size={18} />,      label: 'Stats' },
  { to: '/chat',            icon: <ChatIcon />,                          label: 'Chat' },
  { to: '/agentic-reports', icon: <ReportsIcon />, label: 'Reports' },
]

interface Props {
  onNewTask: () => void
}

export function SideNav({ onNewTask }: Props) {
  const { logout } = useAuth()
  const navigate = useNavigate()

  return (
    <aside className={styles.nav}>
      <div className={styles.brand}>
        <span className={styles.brandName}>FocusAI</span>
      </div>

      <button className={styles.newBtn} onClick={onNewTask}>
        <IconPlus size={15} />
        New task
      </button>

      <nav className={styles.links}>
        {LINKS.map(l => (
          <NavLink
            key={l.to}
            to={l.to}
            className={({ isActive }) => `${styles.link} ${isActive ? styles.active : ''}`}
          >
            {l.icon}
            <span>{l.label}</span>
          </NavLink>
        ))}
        <NotificationBell />
      </nav>

      <div className={styles.bottomActions}>
        <button
          className={styles.logoutBtn}
          onClick={async () => { await logout(); navigate('/login') }}
        >
          <IconLogout size={16} />
          Sign out
        </button>
      </div>
    </aside>
  )
}
