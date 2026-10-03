import { Component, type ErrorInfo, type ReactNode } from 'react'

interface RouteErrorBoundaryProps {
  children: ReactNode
}

interface RouteErrorBoundaryState {
  error: Error | null
}

/**
 * The last line before a blank page. Without a boundary, any error thrown while
 * rendering a route -- most often a lazy chunk that will not load even after
 * importOrReload's one reload -- makes React unmount the whole app and leave an
 * empty white screen with no way forward. This shows what happened and the two
 * ways out instead.
 *
 * Mounted keyed by pathname in AppRoutes, so navigating elsewhere clears it.
 */
export class RouteErrorBoundary extends Component<RouteErrorBoundaryProps, RouteErrorBoundaryState> {
  state: RouteErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): RouteErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('A page failed to render:', error, info.componentStack)
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children
    return <PageLoadFailed />
  }
}

function PageLoadFailed() {
  return (
    <main className="min-h-screen bg-white flex items-center justify-center px-4">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-bold text-gray-900 mb-3">This page didn't load</h1>
        <p className="text-gray-600 mb-8">
          Reload to get the latest version of Vyostra AI. If your session has expired, you'll be asked to sign in again.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="px-5 py-2.5 rounded-xl bg-violet-600 text-white font-semibold hover:bg-violet-700"
          >
            Reload
          </button>
          <a
            href="/login"
            className="px-5 py-2.5 rounded-xl border border-gray-200 text-gray-700 font-semibold hover:bg-gray-50"
          >
            Sign in
          </a>
        </div>
      </div>
    </main>
  )
}
