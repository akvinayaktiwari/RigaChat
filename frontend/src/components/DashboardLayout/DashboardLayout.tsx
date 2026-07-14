import { useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  Bell,
  Bot,
  FileText,
  LayoutDashboard,
  LogOut,
  type LucideIcon,
  Menu,
  MessageSquare,
  Settings,
  Users,
} from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import VyostraLogo from '../VyostraLogo'

const NAV_LINKS: { to: string; label: string; icon: LucideIcon; end: boolean }[] = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/dashboard/bots', label: 'Chatbots', icon: Bot, end: false },
  { to: '/dashboard/forms', label: 'Forms', icon: FileText, end: false },
  { to: '/dashboard/leads', label: 'Leads', icon: Users, end: false },
  { to: '/dashboard/whatsapp', label: 'WhatsApp', icon: MessageSquare, end: false },
  { to: '/dashboard/settings', label: 'Settings', icon: Settings, end: false },
]

function getPageTitle(pathname: string): string {
  if (pathname === '/dashboard') return 'Dashboard'
  if (pathname === '/dashboard/bots/new') return 'New Chatbot'
  if (pathname === '/dashboard/bots') return 'Chatbots'
  if (/^\/dashboard\/bots\/[^/]+$/.test(pathname)) return 'Bot Settings'
  if (pathname === '/dashboard/forms/new') return 'New Form'
  if (pathname === '/dashboard/forms') return 'Forms'
  if (/^\/dashboard\/forms\/[^/]+\/leads$/.test(pathname)) return 'Form Leads'
  if (/^\/dashboard\/forms\/[^/]+$/.test(pathname)) return 'Edit Form'
  if (pathname === '/dashboard/leads') return 'Leads'
  if (/^\/dashboard\/leads\/[^/]+$/.test(pathname)) return 'Lead Detail'
  if (pathname.startsWith('/dashboard/kb')) return 'Knowledge Base'
  if (pathname === '/dashboard/whatsapp') return 'WhatsApp'
  if (pathname === '/dashboard/settings') return 'Settings'
  return 'Dashboard'
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length <= 1) {
    return (parts[0] ?? '').slice(0, 2).toUpperCase()
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

const JAKARTA_FONT = { fontFamily: "'Plus Jakarta Sans', sans-serif" }

function navLinkClasses(isActive: boolean): string {
  return `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-150 ${
    isActive ? 'bg-violet-50 text-violet-700 font-semibold' : 'text-gray-600 font-medium hover:bg-gray-50 hover:text-gray-900'
  }`
}

interface SidebarContentProps {
  initials: string
  userName?: string
  userEmail?: string
  onLogout: () => void
}

function SidebarContent({ initials, userName, userEmail, onLogout }: SidebarContentProps) {
  return (
    <>
      <div className="flex items-center gap-3 px-2 mb-10">
        <VyostraLogo size={28} animate={true} />
        <span className="font-bold text-lg text-gray-900" style={JAKARTA_FONT}>
          VyostraAI
        </span>
      </div>

      <nav className="flex-1 space-y-1">
        {NAV_LINKS.map((link) => {
          const Icon = link.icon
          return (
            <NavLink key={link.to} to={link.to} end={link.end} className={({ isActive }) => navLinkClasses(isActive)}>
              {({ isActive }) => (
                <>
                  <Icon className={`w-4.5 h-4.5 shrink-0 ${isActive ? 'text-violet-600' : 'text-gray-400'}`} />
                  <span>{link.label}</span>
                </>
              )}
            </NavLink>
          )
        })}
      </nav>

      <div className="pt-4 border-t border-gray-100">
        <div className="flex items-center gap-3 px-2 py-2">
          <div className="w-8 h-8 rounded-full bg-linear-to-br from-violet-600 to-purple-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">{userName}</p>
            <p className="text-xs text-gray-500 truncate">{userEmail}</p>
          </div>
          <button
            type="button"
            onClick={onLogout}
            title="Logout"
            className="text-gray-400 hover:text-gray-700 transition-colors shrink-0"
          >
            <LogOut className="w-4.5 h-4.5" />
          </button>
        </div>
      </div>
    </>
  )
}

export function DashboardLayout() {
  const { user, logout } = useAuth()
  const location = useLocation()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  const initials = user ? getInitials(user.name) : ''

  return (
    <div className="min-h-screen bg-white">
      {mobileNavOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 lg:hidden"
          onClick={() => setMobileNavOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed left-0 top-0 h-screen w-64 flex flex-col bg-white border-r border-gray-100 py-8 px-4 z-50 transform transition-transform duration-200 lg:translate-x-0 ${
          mobileNavOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <SidebarContent initials={initials} userName={user?.name} userEmail={user?.email} onLogout={logout} />
      </aside>

      <header className="fixed top-0 right-0 left-0 lg:left-64 h-16 bg-white border-b border-gray-100 shadow-sm flex items-center justify-between px-4 sm:px-8 z-30">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => setMobileNavOpen(true)}
            aria-label="Open menu"
            className="lg:hidden text-gray-500 hover:text-gray-900 transition-colors shrink-0"
          >
            <Menu className="w-5 h-5" />
          </button>
          <h2 className="font-bold text-xl text-gray-900 truncate" style={JAKARTA_FONT}>
            {getPageTitle(location.pathname)}
          </h2>
        </div>

        <div className="flex items-center gap-4 shrink-0">
          <button
            type="button"
            className="relative w-10 h-10 flex items-center justify-center rounded-full text-gray-500 hover:text-violet-600 hover:bg-gray-50 transition-all"
            title="Notifications"
          >
            <Bell className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-linear-to-br from-violet-600 to-purple-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
              {initials}
            </div>
            <span className="text-sm font-medium text-gray-900 hidden md:block">{user?.name}</span>
          </div>
        </div>
      </header>

      <main className="lg:ml-64 pt-16 min-h-screen overflow-y-auto">
        <div className="p-6">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
