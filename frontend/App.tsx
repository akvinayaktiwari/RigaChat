import { Suspense } from 'react'
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom'
import { ProtectedRoute } from './src/components/ProtectedRoute/ProtectedRoute'
import { AdminProtectedRoute } from './src/components/AdminProtectedRoute/AdminProtectedRoute'
import { ToastContainer } from './src/components/Toast/Toast'
import { AnalyticsPageViews } from './src/hooks/useAnalyticsPageViews'
import LandingPage from './src/pages/LandingPage'
import NotFound from './src/pages/NotFound'
import { preloadPostContent } from './src/content/blog/registry'
import { preloadDocContent } from './src/content/docs/registry'
import { lazyWithPreload } from './src/lib/lazy-with-preload'
import { lazyRoute } from './src/lib/chunk-reload'
import { RouteErrorBoundary } from './src/components/RouteErrorBoundary/RouteErrorBoundary'
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
import VoiceAgent from './src/pages/features/VoiceAgent'
import ZohoCrm from './src/pages/features/ZohoCrm'
import Careers from './src/pages/Careers'
import Pricing from './src/pages/Pricing'
import Faq from './src/pages/Faq'
import WhatsAppLinkGenerator from './src/pages/tools/WhatsAppLinkGenerator'
import IntegrationPage from './src/pages/integrations/IntegrationPage'
import IntegrationsIndex from './src/pages/integrations/IntegrationsIndex'
import { META_LEAD_ADS } from './src/content/integrations/meta-lead-ads'
import IndustryPage from './src/pages/industries/IndustryPage'
import DocsIndex from './src/pages/docs/DocsIndex'
import { REAL_ESTATE } from './src/content/industries/real-estate'
// Blog routes are lazy so post bodies (and the blog's motion/table components)
// stay out of the main bundle every other page pays for.
const BlogIndex = lazyWithPreload(() => import('./src/pages/BlogIndex'))
const BlogPost = lazyWithPreload(() => import('./src/pages/BlogPost'))

// A docs page is lazy for the blog's reason: its MDX body stays out of the
// bundle every other page pays for. The docs index is eager like any other
// prerendered marketing page.
const DocPage = lazyWithPreload(() => import('./src/pages/docs/DocPage'))

/** "/docs/quickstart/" -> "quickstart"; undefined for the index and every other path. */
function docSlug(pathname: string): string | undefined {
  return pathname.match(/^\/docs\/([^/]+)\/?$/)?.[1]
}

/** "/blog/my-post/" -> "my-post"; undefined for the index and every other path. */
function blogSlug(pathname: string): string | undefined {
  return pathname.match(/^\/blog\/([^/]+)\/?$/)?.[1]
}

/**
 * Fetches the lazy chunks a prerendered path needs, before main.tsx hydrates it.
 * Only blog and docs pages are both prerendered and lazy; every other path resolves at once.
 */
export async function preloadRoute(pathname: string): Promise<void> {
  const slug = blogSlug(pathname)
  const doc = docSlug(pathname)
  if (slug) {
    await Promise.all([BlogPost.preload(), preloadPostContent(slug)])
  } else if (doc) {
    await Promise.all([DocPage.preload(), preloadDocContent(doc)])
  } else if (/^\/blog\/?$/.test(pathname)) {
    await BlogIndex.preload()
  }
}

/**
 * Everything behind sign-in, and the test harnesses, load on demand.
 *
 * The marketing pages above stay EAGER on purpose. main.tsx hydrates the
 * prerendered markup, so a lazy page keeps its HTML on screen while its chunk
 * loads -- but its buttons do nothing until then, and on a client-side
 * navigation it shows the Suspense fallback first. The blog is the one
 * exception, lazy to keep the MDX runtime out of every other page. Anything
 * below is reached only after a navigation, where a fallback costs nothing.
 *
 * Adding a page: if it is prerendered (see PRERENDERED_STATIC_ROUTES in
 * src/lib/crawl-files.ts) import it eagerly; otherwise lazy() it here.
 */
const DashboardLayout = lazyRoute(() =>
  import('./src/components/DashboardLayout/DashboardLayout').then((m) => ({ default: m.DashboardLayout })),
)
const LoginPage = lazyRoute(() => import('./src/pages/LoginPage'))
const SignupPage = lazyRoute(() => import('./src/pages/SignupPage'))
const ForgotPasswordPage = lazyRoute(() => import('./src/pages/ForgotPasswordPage'))
const ResetPasswordPage = lazyRoute(() => import('./src/pages/ResetPasswordPage'))
const VerifyEmailPage = lazyRoute(() => import('./src/pages/VerifyEmailPage'))
const AuthCallbackPage = lazyRoute(() => import('./src/pages/AuthCallbackPage'))
const WidgetTestPage = lazyRoute(() => import('./src/pages/WidgetTestPage'))
const WidgetTestPreviewPage = lazyRoute(() => import('./src/pages/WidgetTestPreviewPage'))
const FormTestPage = lazyRoute(() => import('./src/pages/FormTestPage'))
const FormTestPreviewPage = lazyRoute(() => import('./src/pages/FormTestPreviewPage'))
const VoiceTestPage = lazyRoute(() => import('./src/pages/VoiceTestPage'))
const VoiceTestPreviewPage = lazyRoute(() => import('./src/pages/VoiceTestPreviewPage'))
const DashboardHome = lazyRoute(() => import('./src/pages/DashboardHome'))
const BotsPage = lazyRoute(() => import('./src/pages/BotsPage'))
const NewBotPage = lazyRoute(() => import('./src/pages/NewBotPage'))
const BotDetailPage = lazyRoute(() => import('./src/pages/BotDetailPage'))
const LeadsPage = lazyRoute(() => import('./src/pages/LeadsPage'))
const LeadLinkPage = lazyRoute(() => import('./src/pages/LeadLinkPage'))
const LeadDetailPage = lazyRoute(() => import('./src/pages/LeadDetailPage'))
const SchedulerPage = lazyRoute(() => import('./src/pages/SchedulerPage'))
const AppointmentsPage = lazyRoute(() => import('./src/pages/AppointmentsPage'))
const JourneysPage = lazyRoute(() => import('./src/pages/JourneysPage'))
const JourneyBuilderPage = lazyRoute(() => import('./src/pages/JourneyBuilderPage'))
const KnowledgeBasePage = lazyRoute(() => import('./src/pages/KnowledgeBasePage'))
const VoiceKnowledgeBasePage = lazyRoute(() => import('./src/pages/VoiceKnowledgeBasePage'))
const Settings = lazyRoute(() => import('./src/pages/Settings'))
const WhatsApp = lazyRoute(() => import('./src/pages/WhatsApp'))
const MetaAds = lazyRoute(() => import('./src/pages/MetaAds'))
const BillingPage = lazyRoute(() => import('./src/pages/BillingPage'))
const FormsPage = lazyRoute(() => import('./src/pages/FormsPage'))
const NewFormPage = lazyRoute(() => import('./src/pages/NewFormPage'))
const FormDetailPage = lazyRoute(() => import('./src/pages/FormDetailPage'))
const FormLeadsPage = lazyRoute(() => import('./src/pages/FormLeadsPage'))
const VoiceAgentsPage = lazyRoute(() => import('./src/pages/VoiceAgentsPage'))
const NewVoiceAgentPage = lazyRoute(() => import('./src/pages/NewVoiceAgentPage'))
const VoiceAgentDetailPage = lazyRoute(() => import('./src/pages/VoiceAgentDetailPage'))
const DataDeletionStatus = lazyRoute(() => import('./src/pages/DataDeletionStatus'))
const Status = lazyRoute(() => import('./src/pages/Status'))
const AdminLoginPage = lazyRoute(() => import('./src/pages/admin/AdminLoginPage'))
const AdminAccountsPage = lazyRoute(() => import('./src/pages/admin/AdminAccountsPage'))
const AdminContactMessagesPage = lazyRoute(() => import('./src/pages/admin/AdminContactMessagesPage'))

/**
 * Everything inside the router. Exported so the build-time prerender renders
 * this exact tree under a StaticRouter: main.tsx hydrates the prerendered
 * markup, and hydration only holds if the server and the browser render the
 * same components in the same order, Suspense boundary included.
 */
export function AppRoutes() {
  const { pathname } = useLocation()

  return (
    <>
      {/* Inside the router so it can see navigations; above Routes so page
          titles are already set when it reads them. */}
      <AnalyticsPageViews />
      {/* One boundary for every lazy route. The fallback is a plain surface:
          these are post-navigation loads, so a spinner would flash and go. */}
      {/* Keyed by path so navigating away from a failed page clears the error. */}
      <RouteErrorBoundary key={pathname}>
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
          <Route path="/features/voice-agent" element={<VoiceAgent />} />
          <Route path="/features/zoho-crm" element={<ZohoCrm />} />
          <Route path="/careers" element={<Careers />} />
          <Route path="/pricing" element={<Pricing />} />
          <Route path="/faq" element={<Faq />} />
          <Route path="/whatsapp-link-generator" element={<WhatsAppLinkGenerator />} />
          <Route path="/integrations" element={<IntegrationsIndex />} />
          <Route path="/integrations/meta-lead-ads" element={<IntegrationPage integration={META_LEAD_ADS} />} />
          <Route path="/industries/real-estate" element={<IndustryPage industry={REAL_ESTATE} />} />
          <Route path="/docs" element={<DocsIndex />} />
          <Route
            path="/docs/:slug"
            element={
              <Suspense fallback={<div className="min-h-screen bg-background" />}>
                <DocPage />
              </Suspense>
            }
          />
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
      </RouteErrorBoundary>
      <ToastContainer />
    </>
  )
}

function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  )
}

export default App
