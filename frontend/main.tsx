import React from 'react'
import ReactDOM from 'react-dom/client'
import { HelmetProvider } from 'react-helmet-async'
import App from './App'
import { AuthProvider } from './src/hooks/useAuth'
import { StaffAuthProvider } from './src/hooks/useStaffAuth'
import './src/index.css'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <HelmetProvider>
      <AuthProvider>
        <StaffAuthProvider>
          <App />
        </StaffAuthProvider>
      </AuthProvider>
    </HelmetProvider>
  </React.StrictMode>
)
