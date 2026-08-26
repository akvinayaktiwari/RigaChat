import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { LoadingScreen } from '../LoadingScreen'
import { rememberPostLoginPath } from '../../lib/post-login-redirect'

interface ProtectedRouteProps {
  children: ReactNode
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading } = useAuth()
  const location = useLocation()

  if (isLoading) {
    return <LoadingScreen status="Loading your workspace…" />
  }

  if (!isAuthenticated) {
    // Both forms, because the two sign-in paths lose state differently -- see
    // lib/post-login-redirect.ts. Without this, every deep link into the
    // dashboard works only for someone already signed in on that device.
    const attempted = `${location.pathname}${location.search}`
    rememberPostLoginPath(attempted)
    return <Navigate to={`/login?next=${encodeURIComponent(attempted)}`} replace />
  }

  return <>{children}</>
}
