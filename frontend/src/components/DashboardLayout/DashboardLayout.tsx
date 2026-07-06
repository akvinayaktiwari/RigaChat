import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { Badge } from '../Badge/Badge'
import styles from './DashboardLayout.module.css'

const NAV_LINKS = [
  { to: '/dashboard', label: 'Dashboard', end: true },
  { to: '/dashboard/bots', label: 'My Bots', end: false },
  { to: '/dashboard/leads', label: 'Leads', end: false },
  { to: '/dashboard/settings', label: 'Settings', end: false },
]

function getPageTitle(pathname: string): string {
  if (pathname === '/dashboard') return 'Dashboard'
  if (pathname === '/dashboard/bots/new') return 'New Bot'
  if (pathname === '/dashboard/bots') return 'My Bots'
  if (/^\/dashboard\/bots\/[^/]+$/.test(pathname)) return 'Bot Settings'
  if (pathname === '/dashboard/leads') return 'Leads'
  if (/^\/dashboard\/leads\/[^/]+$/.test(pathname)) return 'Lead Detail'
  if (/^\/dashboard\/kb\/[^/]+$/.test(pathname)) return 'Knowledge Base'
  if (pathname === '/dashboard/settings') return 'Settings'
  return 'Dashboard'
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

export function DashboardLayout() {
  const { user, logout } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

  function handleLogout() {
    logout()
    navigate('/login')
  }

  return (
    <div className={styles.layout}>
      <aside className={styles.sidebar}>
        <div className={styles.logo}>ChatIQ</div>

        <nav className={styles.nav}>
          {NAV_LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              className={({ isActive }) => `${styles.navLink} ${isActive ? styles.navLinkActive : ''}`}
            >
              {link.label}
            </NavLink>
          ))}
        </nav>

        <div className={styles.comingSoon}>
          <div className={styles.comingSoonHeader}>
            <span>WhatsApp Automation</span>
            <Badge variant="warning">Coming Soon</Badge>
          </div>
        </div>
      </aside>

      <div className={styles.main}>
        <header className={styles.header}>
          <h1 className={styles.pageTitle}>{getPageTitle(location.pathname)}</h1>
          <div className={styles.userArea}>
            <span className={styles.userName}>{user?.name}</span>
            <div className={styles.avatar}>{user ? getInitials(user.name) : ''}</div>
            <button className={styles.logoutButton} onClick={handleLogout}>
              Logout
            </button>
          </div>
        </header>

        <main className={styles.content}>
          <Outlet />
        </main>
      </div>
    </div>
  )
}
