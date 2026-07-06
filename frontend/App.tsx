import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './src/hooks/useAuth'
import { ProtectedRoute } from './src/components/ProtectedRoute/ProtectedRoute'
import { DashboardLayout } from './src/components/DashboardLayout/DashboardLayout'
import { ToastContainer } from './src/components/Toast/Toast'
import LoginPage from './src/pages/LoginPage'
import AuthCallbackPage from './src/pages/AuthCallbackPage'
import DashboardHome from './src/pages/DashboardHome'
import BotsPage from './src/pages/BotsPage'
import NewBotPage from './src/pages/NewBotPage'
import BotDetailPage from './src/pages/BotDetailPage'
import LeadsPage from './src/pages/LeadsPage'
import LeadDetailPage from './src/pages/LeadDetailPage'
import KnowledgeBasePage from './src/pages/KnowledgeBasePage'
import SettingsPage from './src/pages/SettingsPage'

function RootRedirect() {
  const { isAuthenticated, isLoading } = useAuth()
  if (isLoading) return null
  return <Navigate to={isAuthenticated ? '/dashboard' : '/login'} replace />
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/auth/callback" element={<AuthCallbackPage />} />
        <Route path="/" element={<RootRedirect />} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <DashboardLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<DashboardHome />} />
          <Route path="bots" element={<BotsPage />} />
          <Route path="bots/new" element={<NewBotPage />} />
          <Route path="bots/:botId" element={<BotDetailPage />} />
          <Route path="leads" element={<LeadsPage />} />
          <Route path="leads/:leadId" element={<LeadDetailPage />} />
          <Route path="kb/:botId" element={<KnowledgeBasePage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Routes>
      <ToastContainer />
    </BrowserRouter>
  )
}

export default App
