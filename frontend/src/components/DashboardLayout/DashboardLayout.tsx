import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { Bell, Bot, FileText, LayoutDashboard, LogOut, type LucideIcon, MessageSquare, Settings, Users } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'

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

const navLinkClasses = (isActive: boolean): string =>
  `w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 text-left ${
    isActive
      ? 'active-nav-link shadow-sm'
      : 'text-slate-400 font-medium hover:bg-slate-800/60 hover:text-white hover:translate-x-1'
  }`

export function DashboardLayout() {
  const { user, logout } = useAuth()
  const location = useLocation()

  const initials = user ? getInitials(user.name) : ''

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      {/* Sidebar */}
      <aside className="glass-sidebar fixed left-0 top-0 h-screen w-60 flex flex-col py-8 px-4 z-50">
        <div className="flex items-center gap-3 px-2 mb-10">
          <div className="w-10 h-10 rounded-xl cta-accent flex items-center justify-center text-white font-black text-lg shadow-sm">
            B
          </div>
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight leading-tight">BeepBoop</h1>
            <p className="text-[10px] uppercase tracking-widest font-bold text-slate-400">Real Estate AI</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1">
          {NAV_LINKS.map((link) => {
            const Icon = link.icon
            return (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.end}
                className={({ isActive }) => navLinkClasses(isActive)}
              >
                <Icon className="w-5 h-5 shrink-0" />
                <span className="text-sm tracking-wide">{link.label}</span>
              </NavLink>
            )
          })}
        </nav>

        <div className="space-y-4">
          {/* User footer */}
          <div className="pt-4 border-t border-[#1E293B]">
            <div className="bg-[#1E293B] border border-[#334155]/60 rounded-2xl p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-[#334155] flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
                {initials}
              </div>
              <div className="flex-1 overflow-hidden">
                <p className="text-sm font-bold text-white truncate">{user?.name}</p>
                <p className="text-[10px] text-slate-400 truncate">{user?.email}</p>
              </div>
              <button
                type="button"
                onClick={logout}
                title="Logout"
                className="text-slate-400 hover:text-white transition-colors flex-shrink-0"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Header */}
      <header className="glass-header fixed top-0 right-0 left-60 h-[60px] flex items-center justify-between px-8 z-40">
        <h2 className="text-lg font-extrabold text-slate-800 tracking-tight">{getPageTitle(location.pathname)}</h2>

        <div className="flex items-center gap-4">
          <button
            type="button"
            className="relative w-10 h-10 flex items-center justify-center rounded-full text-slate-500 hover:text-indigo-600 hover:bg-slate-50 transition-all"
            title="Notifications"
          >
            <Bell className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-bold text-indigo-700 flex-shrink-0">
              {initials}
            </div>
            <span className="text-sm font-bold text-slate-800 hidden md:block">{user?.name}</span>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="ml-60 pt-[60px] min-h-screen overflow-y-auto">
        <div className="p-6">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
