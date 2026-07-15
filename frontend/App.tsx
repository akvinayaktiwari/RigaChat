import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { ProtectedRoute } from './src/components/ProtectedRoute/ProtectedRoute'
import { DashboardLayout } from './src/components/DashboardLayout/DashboardLayout'
import { ToastContainer } from './src/components/Toast/Toast'
import LandingPage from './src/pages/LandingPage'
import LoginPage from './src/pages/LoginPage'
import SignupPage from './src/pages/SignupPage'
import AuthCallbackPage from './src/pages/AuthCallbackPage'
import WidgetTestPage from './src/pages/WidgetTestPage'
import WidgetTestPreviewPage from './src/pages/WidgetTestPreviewPage'
import DashboardHome from './src/pages/DashboardHome'
import BotsPage from './src/pages/BotsPage'
import NewBotPage from './src/pages/NewBotPage'
import BotDetailPage from './src/pages/BotDetailPage'
import LeadsPage from './src/pages/LeadsPage'
import LeadDetailPage from './src/pages/LeadDetailPage'
import KnowledgeBasePage from './src/pages/KnowledgeBasePage'
import Settings from './src/pages/Settings'
import WhatsApp from './src/pages/WhatsApp'
import FormsPage from './src/pages/FormsPage'
import NewFormPage from './src/pages/NewFormPage'
import FormDetailPage from './src/pages/FormDetailPage'
import FormLeadsPage from './src/pages/FormLeadsPage'
import FormTestPage from './src/pages/FormTestPage'
import FormTestPreviewPage from './src/pages/FormTestPreviewPage'
import About from './src/pages/About'
import Contact from './src/pages/Contact'
import Help from './src/pages/Help'
import Privacy from './src/pages/Privacy'
import Terms from './src/pages/Terms'
import Status from './src/pages/Status'
import Features from './src/pages/Features'
import Chatbot from './src/pages/features/Chatbot'
import WhatsAppFeature from './src/pages/features/WhatsApp'
import Crm from './src/pages/features/Crm'
import Forms from './src/pages/features/Forms'
import Careers from './src/pages/Careers'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/auth/callback" element={<AuthCallbackPage />} />
        <Route path="/widget-test" element={<WidgetTestPage />} />
        <Route path="/widget-test/preview" element={<WidgetTestPreviewPage />} />
        <Route path="/form-test" element={<FormTestPage />} />
        <Route path="/form-test/preview" element={<FormTestPreviewPage />} />
        <Route path="/" element={<LandingPage />} />
        <Route path="/about-us" element={<About />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="/help" element={<Help />} />
        <Route path="/privacy-policy" element={<Privacy />} />
        <Route path="/terms-of-service" element={<Terms />} />
        <Route path="/system-status" element={<Status />} />
        <Route path="/features" element={<Features />} />
        <Route path="/features/chatbot" element={<Chatbot />} />
        <Route path="/features/whatsapp" element={<WhatsAppFeature />} />
        <Route path="/features/crm" element={<Crm />} />
        <Route path="/features/forms" element={<Forms />} />
        <Route path="/careers" element={<Careers />} />
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
          <Route
            path="voice-agents"
            element={
              <div className="p-8">
                <h1 className="text-2xl font-semibold">Voice Agents</h1>
                <p className="text-gray-500 mt-2">Coming in next step.</p>
              </div>
            }
          />
          <Route
            path="voice-agents/new"
            element={
              <div className="p-8">
                <p className="text-gray-500 mt-2">New Voice Agent — coming in next step.</p>
              </div>
            }
          />
          <Route path="forms" element={<FormsPage />} />
          <Route path="forms/new" element={<NewFormPage />} />
          <Route path="forms/:formId" element={<FormDetailPage />} />
          <Route path="forms/:formId/leads" element={<FormLeadsPage />} />
          <Route path="leads" element={<LeadsPage />} />
          <Route path="leads/:leadId" element={<LeadDetailPage />} />
          <Route path="kb/:botId" element={<KnowledgeBasePage />} />
          <Route path="whatsapp" element={<WhatsApp />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>
      <ToastContainer />
    </BrowserRouter>
  )
}

export default App
