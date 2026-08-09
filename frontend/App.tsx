import { Suspense, lazy } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { ProtectedRoute } from './src/components/ProtectedRoute/ProtectedRoute'
import { AdminProtectedRoute } from './src/components/AdminProtectedRoute/AdminProtectedRoute'
import { DashboardLayout } from './src/components/DashboardLayout/DashboardLayout'
import { ToastContainer } from './src/components/Toast/Toast'
import LandingPage from './src/pages/LandingPage'
import LoginPage from './src/pages/LoginPage'
import SignupPage from './src/pages/SignupPage'
import ForgotPasswordPage from './src/pages/ForgotPasswordPage'
import ResetPasswordPage from './src/pages/ResetPasswordPage'
import VerifyEmailPage from './src/pages/VerifyEmailPage'
import AuthCallbackPage from './src/pages/AuthCallbackPage'
import WidgetTestPage from './src/pages/WidgetTestPage'
import WidgetTestPreviewPage from './src/pages/WidgetTestPreviewPage'
import DashboardHome from './src/pages/DashboardHome'
import BotsPage from './src/pages/BotsPage'
import NewBotPage from './src/pages/NewBotPage'
import BotDetailPage from './src/pages/BotDetailPage'
import LeadsPage from './src/pages/LeadsPage'
import LeadDetailPage from './src/pages/LeadDetailPage'
import SchedulerPage from './src/pages/SchedulerPage'
import AppointmentsPage from './src/pages/AppointmentsPage'
import JourneysPage from './src/pages/JourneysPage'
import JourneyBuilderPage from './src/pages/JourneyBuilderPage'
import KnowledgeBasePage from './src/pages/KnowledgeBasePage'
import VoiceKnowledgeBasePage from './src/pages/VoiceKnowledgeBasePage'
import Settings from './src/pages/Settings'
import WhatsApp from './src/pages/WhatsApp'
import MetaAds from './src/pages/MetaAds'
import BillingPage from './src/pages/BillingPage'
import FormsPage from './src/pages/FormsPage'
import NewFormPage from './src/pages/NewFormPage'
import FormDetailPage from './src/pages/FormDetailPage'
import FormLeadsPage from './src/pages/FormLeadsPage'
import FormTestPage from './src/pages/FormTestPage'
import FormTestPreviewPage from './src/pages/FormTestPreviewPage'
import VoiceAgentsPage from './src/pages/VoiceAgentsPage'
import NewVoiceAgentPage from './src/pages/NewVoiceAgentPage'
import VoiceAgentDetailPage from './src/pages/VoiceAgentDetailPage'
import VoiceTestPage from './src/pages/VoiceTestPage'
import VoiceTestPreviewPage from './src/pages/VoiceTestPreviewPage'
import About from './src/pages/About'
import Contact from './src/pages/Contact'
import Help from './src/pages/Help'
import Privacy from './src/pages/Privacy'
import DataDeletionStatus from './src/pages/DataDeletionStatus'
import Terms from './src/pages/Terms'
import Status from './src/pages/Status'
import Features from './src/pages/Features'
import Chatbot from './src/pages/features/Chatbot'
import WhatsAppFeature from './src/pages/features/WhatsApp'
import Crm from './src/pages/features/Crm'
import Forms from './src/pages/features/Forms'
import Careers from './src/pages/Careers'
// Blog routes are lazy so post bodies (and the blog's motion/table components)
// stay out of the main bundle every other page pays for.
const BlogIndex = lazy(() => import('./src/pages/BlogIndex'))
const BlogPost = lazy(() => import('./src/pages/BlogPost'))
import AdminLoginPage from './src/pages/admin/AdminLoginPage'
import AdminAccountsPage from './src/pages/admin/AdminAccountsPage'
import AdminContactMessagesPage from './src/pages/admin/AdminContactMessagesPage'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/admin/login" element={<AdminLoginPage />} />
        <Route
          path="/admin/accounts"
          element={
            <AdminProtectedRoute>
              <AdminAccountsPage />
            </AdminProtectedRoute>
          }
        />
        <Route
          path="/admin/contact-messages"
          element={
            <AdminProtectedRoute>
              <AdminContactMessagesPage />
            </AdminProtectedRoute>
          }
        />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route path="/auth/callback" element={<AuthCallbackPage />} />
        <Route path="/widget-test" element={<WidgetTestPage />} />
        <Route path="/widget-test/preview" element={<WidgetTestPreviewPage />} />
        <Route path="/form-test" element={<FormTestPage />} />
        <Route path="/form-test/preview" element={<FormTestPreviewPage />} />
        <Route path="/voice-test" element={<VoiceTestPage />} />
        <Route path="/voice-test/preview" element={<VoiceTestPreviewPage />} />
        <Route path="/" element={<LandingPage />} />
        <Route path="/about-us" element={<About />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="/help" element={<Help />} />
        <Route path="/privacy-policy" element={<Privacy />} />
        {/* Meta's data-deletion callback returns this URL with a confirmation
            code. Without the route it fell through to the SPA shell and
            rendered the landing page. */}
        <Route path="/data-deletion-status" element={<DataDeletionStatus />} />
        <Route path="/terms-of-service" element={<Terms />} />
        <Route path="/system-status" element={<Status />} />
        <Route path="/features" element={<Features />} />
        <Route path="/features/chatbot" element={<Chatbot />} />
        <Route path="/features/whatsapp" element={<WhatsAppFeature />} />
        <Route path="/features/crm" element={<Crm />} />
        <Route path="/features/forms" element={<Forms />} />
        <Route path="/careers" element={<Careers />} />
        <Route
          path="/blog"
          element={
            <Suspense fallback={<div className="min-h-screen bg-[#0d0d18]" />}>
              <BlogIndex />
            </Suspense>
          }
        />
        <Route
          path="/blog/:slug"
          element={
            <Suspense fallback={<div className="min-h-screen bg-[#0d0d18]" />}>
              <BlogPost />
            </Suspense>
          }
        />
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
          <Route path="voice-agents" element={<VoiceAgentsPage />} />
          <Route path="voice-agents/new" element={<NewVoiceAgentPage />} />
          <Route path="voice-agents/:agentId" element={<VoiceAgentDetailPage />} />
          <Route path="voice-agents/:agentId/kb" element={<VoiceKnowledgeBasePage />} />
          <Route path="forms" element={<FormsPage />} />
          <Route path="forms/new" element={<NewFormPage />} />
          <Route path="forms/:formId" element={<FormDetailPage />} />
          <Route path="forms/:formId/leads" element={<FormLeadsPage />} />
          <Route path="leads" element={<LeadsPage />} />
          <Route path="leads/:leadId" element={<LeadDetailPage />} />
          <Route path="scheduler" element={<SchedulerPage />} />
          <Route path="appointments" element={<AppointmentsPage />} />
          <Route path="journeys" element={<JourneysPage />} />
          <Route path="journeys/:botId/new" element={<JourneyBuilderPage />} />
          <Route path="journeys/:botId/:bundleId" element={<JourneyBuilderPage />} />
          <Route path="kb/:botId" element={<KnowledgeBasePage />} />
          <Route path="whatsapp" element={<WhatsApp />} />
          <Route path="meta-ads" element={<MetaAds />} />
          <Route path="billing" element={<BillingPage />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>
      <ToastContainer />
    </BrowserRouter>
  )
}

export default App
