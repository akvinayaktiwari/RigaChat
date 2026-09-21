import { Suspense, lazy } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { ProtectedRoute } from './src/components/ProtectedRoute/ProtectedRoute'
import { AdminProtectedRoute } from './src/components/AdminProtectedRoute/AdminProtectedRoute'
import { ToastContainer } from './src/components/Toast/Toast'
import { AnalyticsPageViews } from './src/hooks/useAnalyticsPageViews'
import LandingPage from './src/pages/LandingPage'
import NotFound from './src/pages/NotFound'
import About from './src/pages/About'
import Contact from './src/pages/Contact'
import Help from './src/pages/Help'
import Privacy from './src/pages/Privacy'
import Terms from './src/pages/Terms'
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

/**
 * Everything behind sign-in, and the test harnesses, load on demand.
 *
 * The marketing pages above stay EAGER on purpose. main.tsx mounts with
 * createRoot().render(), not hydrateRoot(): React replaces the prerendered
 * markup outright, so a lazy marketing page would swap a fully rendered page
 * for the Suspense fallback on first paint -- a blank flash and an LCP
 * regression on exactly the pages that are meant to rank. Anything below is
 * reached only after a navigation, where a fallback costs nothing.
 *
 * Adding a page: if it is prerendered (see PRERENDERED_STATIC_ROUTES in
 * src/lib/crawl-files.ts) import it eagerly; otherwise lazy() it here.
 */
const DashboardLayout = lazy(() =>
  import('./src/components/DashboardLayout/DashboardLayout').then((m) => ({ default: m.DashboardLayout })),
)
const LoginPage = lazy(() => import('./src/pages/LoginPage'))
const SignupPage = lazy(() => import('./src/pages/SignupPage'))
const ForgotPasswordPage = lazy(() => import('./src/pages/ForgotPasswordPage'))
const ResetPasswordPage = lazy(() => import('./src/pages/ResetPasswordPage'))
const VerifyEmailPage = lazy(() => import('./src/pages/VerifyEmailPage'))
const AuthCallbackPage = lazy(() => import('./src/pages/AuthCallbackPage'))
const WidgetTestPage = lazy(() => import('./src/pages/WidgetTestPage'))
const WidgetTestPreviewPage = lazy(() => import('./src/pages/WidgetTestPreviewPage'))
const FormTestPage = lazy(() => import('./src/pages/FormTestPage'))
const FormTestPreviewPage = lazy(() => import('./src/pages/FormTestPreviewPage'))
const VoiceTestPage = lazy(() => import('./src/pages/VoiceTestPage'))
const VoiceTestPreviewPage = lazy(() => import('./src/pages/VoiceTestPreviewPage'))
const DashboardHome = lazy(() => import('./src/pages/DashboardHome'))
const BotsPage = lazy(() => import('./src/pages/BotsPage'))
const NewBotPage = lazy(() => import('./src/pages/NewBotPage'))
const BotDetailPage = lazy(() => import('./src/pages/BotDetailPage'))
const LeadsPage = lazy(() => import('./src/pages/LeadsPage'))
const LeadLinkPage = lazy(() => import('./src/pages/LeadLinkPage'))
const LeadDetailPage = lazy(() => import('./src/pages/LeadDetailPage'))
const SchedulerPage = lazy(() => import('./src/pages/SchedulerPage'))
const AppointmentsPage = lazy(() => import('./src/pages/AppointmentsPage'))
const JourneysPage = lazy(() => import('./src/pages/JourneysPage'))
const JourneyBuilderPage = lazy(() => import('./src/pages/JourneyBuilderPage'))
const KnowledgeBasePage = lazy(() => import('./src/pages/KnowledgeBasePage'))
const VoiceKnowledgeBasePage = lazy(() => import('./src/pages/VoiceKnowledgeBasePage'))
const Settings = lazy(() => import('./src/pages/Settings'))
const WhatsApp = lazy(() => import('./src/pages/WhatsApp'))
const MetaAds = lazy(() => import('./src/pages/MetaAds'))
const BillingPage = lazy(() => import('./src/pages/BillingPage'))
const FormsPage = lazy(() => import('./src/pages/FormsPage'))
const NewFormPage = lazy(() => import('./src/pages/NewFormPage'))
const FormDetailPage = lazy(() => import('./src/pages/FormDetailPage'))
const FormLeadsPage = lazy(() => import('./src/pages/FormLeadsPage'))
const VoiceAgentsPage = lazy(() => import('./src/pages/VoiceAgentsPage'))
const NewVoiceAgentPage = lazy(() => import('./src/pages/NewVoiceAgentPage'))
const VoiceAgentDetailPage = lazy(() => import('./src/pages/VoiceAgentDetailPage'))
const DataDeletionStatus = lazy(() => import('./src/pages/DataDeletionStatus'))
const Status = lazy(() => import('./src/pages/Status'))
const AdminLoginPage = lazy(() => import('./src/pages/admin/AdminLoginPage'))
const AdminAccountsPage = lazy(() => import('./src/pages/admin/AdminAccountsPage'))
const AdminContactMessagesPage = lazy(() => import('./src/pages/admin/AdminContactMessagesPage'))

function App() {
  return (
    <BrowserRouter>
      {/* Inside the router so it can see navigations; above Routes so page
          titles are already set when it reads them. */}
      <AnalyticsPageViews />
      {/* One boundary for every lazy route. The fallback is a plain surface:
          these are post-navigation loads, so a spinner would flash and go. */}
      <Suspense fallback={<div className="min-h-screen bg-white" />}>
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
          {/* Landing point for the WhatsApp handoff alert's "Open this lead" button.
              Public because it only unpacks a ref and forwards; ProtectedRoute on
              /dashboard still guards the lead itself. */}
          <Route path="/l/:token" element={<LeadLinkPage />} />
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
        <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
      <ToastContainer />
    </BrowserRouter>
  )
}

export default App
