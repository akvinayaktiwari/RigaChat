import { NavLink } from 'react-router-dom'
import { LogOut, ShieldCheck } from 'lucide-react'
import { useStaffAuth } from '../../hooks/useStaffAuth'

// Extracted from AdminAccountsPage when the console gained a second page.
// Held here rather than duplicated per page so the nav has one definition —
// a staff console that disagrees with itself about which pages exist is the
// exact thing that makes internal tools rot.
const NAV_ITEMS = [
  { to: '/admin/accounts', label: 'Accounts' },
  { to: '/admin/contact-messages', label: 'Contact messages' },
] as const

function navLinkClasses({ isActive }: { isActive: boolean }): string {
  return isActive
    ? 'text-sm font-semibold text-violet-700 border-b-2 border-violet-600 pb-3 -mb-4 transition-colors'
    : 'text-sm font-medium text-gray-500 hover:text-gray-900 pb-3 -mb-4 transition-colors'
}

interface StaffConsoleShellProps {
  title: string
  subtitle: string
  children: React.ReactNode
}

export function StaffConsoleShell({ title, subtitle, children }: StaffConsoleShellProps) {
  const { staffUser, signOut } = useStaffAuth()

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <ShieldCheck className="text-violet-600" size={20} />
            <span className="font-semibold text-gray-900">VyostraAI Staff Console</span>
          </div>
          <nav className="flex items-center gap-5">
            {NAV_ITEMS.map((item) => (
              <NavLink key={item.to} to={item.to} className={navLinkClasses}>
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-4">
          {staffUser && <span className="text-sm text-gray-500">{staffUser.email}</span>}
          <button
            type="button"
            onClick={signOut}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            <LogOut size={15} />
            Sign out
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-6">
        <h1 className="text-xl font-semibold text-gray-900 mb-1">{title}</h1>
        <p className="text-sm text-gray-500 mb-6">{subtitle}</p>
        {children}
      </main>
    </div>
  )
}
