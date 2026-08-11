import React from 'react'
import ReactDOM from 'react-dom/client'
import { HelmetProvider } from 'react-helmet-async'
import App from './App'
import { AuthProvider } from './src/hooks/useAuth'
import { StaffAuthProvider } from './src/hooks/useStaffAuth'
import { SubscriptionProvider } from './src/hooks/useSubscription'
import './src/index.css'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <HelmetProvider>
      <AuthProvider>
        {/* Inside AuthProvider: it reads the signed-in clientId to key the
            cache and to know when to drop it on an account switch. */}
        <SubscriptionProvider>
          <StaffAuthProvider>
            <App />
          </StaffAuthProvider>
        </SubscriptionProvider>
      </AuthProvider>
    </HelmetProvider>
  </React.StrictMode>
)
