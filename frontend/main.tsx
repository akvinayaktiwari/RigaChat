import React from 'react'
import ReactDOM from 'react-dom/client'
import { HelmetProvider } from 'react-helmet-async'
import App, { preloadRoute } from './App'
import { MotionProvider } from './src/components/MotionProvider'
import { AuthProvider } from './src/hooks/useAuth'
import { StaffAuthProvider } from './src/hooks/useStaffAuth'
import { SubscriptionProvider } from './src/hooks/useSubscription'
import './src/index.css'

const app = (
  <React.StrictMode>
    <HelmetProvider>
      <AuthProvider>
        {/* Inside AuthProvider: it reads the signed-in clientId to key the
            cache and to know when to drop it on an account switch. */}
        <SubscriptionProvider>
          <StaffAuthProvider>
            <MotionProvider>
              <App />
            </MotionProvider>
          </StaffAuthProvider>
        </SubscriptionProvider>
      </AuthProvider>
    </HelmetProvider>
  </React.StrictMode>
)

const container = document.getElementById('root') as HTMLElement

// A prerendered page arrives with its markup already in #root, and hydrating
// attaches React to it in place. createRoot would discard that markup and
// render it again -- and for a lazy route (a blog post) it would show the empty
// Suspense fallback until the route's chunk arrived, about a second on a phone.
// The app shell arrives empty, so there is nothing to hydrate and it renders.
if (container.hasChildNodes()) {
  // The page is already on screen as HTML, so waiting for a lazy route's chunk
  // here delays only the moment it becomes interactive. Hydrating without it
  // would leave the route's Suspense boundary pending, and React discards the
  // prerendered page when anything updates under a pending boundary. A chunk
  // that fails to load is not fatal: hydrate anyway and let lazy() retry it.
  void preloadRoute(window.location.pathname)
    .catch((error: unknown) => console.error('Route preload failed; hydrating without it.', error))
    .finally(() => ReactDOM.hydrateRoot(container, app))
} else {
  ReactDOM.createRoot(container).render(app)
}
