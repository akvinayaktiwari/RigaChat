import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { initAnalytics, trackPageView } from '../lib/analytics'

/**
 * Reports a GA4 page view on every React Router navigation.
 *
 * Must be rendered ABOVE <Routes>, inside <BrowserRouter>. The position is not
 * cosmetic: React runs child effects before parent effects, so a page's
 * react-helmet-async <Helmet> has already written document.title by the time
 * this parent effect reads it. Moving this call down into a page would report
 * the PREVIOUS page's title.
 */
export function useAnalyticsPageViews(): void {
  const { pathname } = useLocation()

  useEffect(() => {
    initAnalytics()
  }, [])

  useEffect(() => {
    trackPageView(pathname, document.title)
  }, [pathname])
}

/** Renders nothing; exists so the hook can sit inside the router. */
export function AnalyticsPageViews(): null {
  useAnalyticsPageViews()
  return null
}
