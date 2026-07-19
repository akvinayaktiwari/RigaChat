import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useStaffAuth } from '../../hooks/useStaffAuth'
import { Spinner } from '../Spinner/Spinner'

interface AdminProtectedRouteProps {
  children: ReactNode
}

export function AdminProtectedRoute({ children }: AdminProtectedRouteProps) {
  const { isAuthenticated, isLoading } = useStaffAuth()

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/admin/login" replace />
  }

  return <>{children}</>
}
