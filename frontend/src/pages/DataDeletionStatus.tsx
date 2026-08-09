import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CheckCircle2, Clock, Mail, ShieldCheck } from 'lucide-react'
import Navbar from '../components/landing/Navbar'
import Footer from '../components/landing/Footer'
import DemoModal from '../components/landing/modals/DemoModal'

const JAKARTA_FONT = { fontFamily: "'Plus Jakarta Sans', sans-serif" }

// Where Meta sends someone after they request deletion of their data from
// within Facebook. backend/src/routes/webhooks.ts's /meta/data-deletion
// callback returns this URL with the confirmation code appended.
//
// This page deliberately does NOT say the data has been deleted.
// handleMetaDataDeletionRequest verifies the signed request and issues a
// confirmation code, but performs no purge -- the codebase does not store a
// Meta user_id, so a request cannot yet be correlated to specific records
// (see TODOS.md, "Meta data deletion callback fabricates success"). Claiming
// completion here would be a false statement to the person asking and to
// Meta's reviewers. It reports what is actually true: the request was
// received and verified, and it is completed manually.

const SUPPORT_EMAIL = 'support@vyostra.com'
const RESPONSE_WINDOW = '30 days'

function Step({
  icon: Icon,
  title,
  body,
  done,
}: {
  icon: typeof Clock
  title: string
  body: string
  done: boolean
}) {
  return (
    <div className="flex gap-4">
      <div
        className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
          done ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-100 text-gray-400'
        }`}
      >
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0 pt-1">
        <h3 className="font-bold text-on-surface text-base">{title}</h3>
        <p className="text-sm text-on-surface-variant leading-relaxed mt-1">{body}</p>
      </div>
    </div>
  )
}

export default function DataDeletionStatus() {
  const [searchParams] = useSearchParams()
  const [isDemoOpen, setIsDemoOpen] = useState(false)
  const confirmationCode = searchParams.get('id')

  return (
    <div className="landing-page bg-background">
      <Navbar onOpenDemo={() => setIsDemoOpen(true)} />

      <main className="pt-36 pb-24 px-6 lg:px-8">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center gap-2.5 px-3 py-1 bg-primary/10 text-primary text-xs font-bold rounded-full w-fit mb-4">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Data Deletion Request</span>
          </div>

          <h1 className="text-4xl md:text-5xl font-extrabold text-on-surface tracking-tight">
            {confirmationCode ? 'We’ve received your request' : 'Data deletion requests'}
          </h1>

          {confirmationCode ? (
            <>
              <p className="mt-3 text-base text-on-surface-variant leading-relaxed">
                Your request to delete the data VyostraAI holds about you has been received and
                verified. Keep the confirmation code below — you’ll need it if you contact us about
                this request.
              </p>

              <div className="mt-8 p-6 bg-white border border-outline-variant/30 rounded-2xl shadow-xs">
                <p className="text-[10px] font-bold text-outline uppercase tracking-wider">
                  Confirmation code
                </p>
                {/* break-all so a long code stays inside the card on a phone */}
                <p
                  className="text-lg font-bold text-on-surface mt-1.5 break-all"
                  style={JAKARTA_FONT}
                >
                  {confirmationCode}
                </p>
              </div>

              <div className="mt-10 space-y-7">
                <Step
                  icon={CheckCircle2}
                  title="Request received"
                  body="Meta passed your request to us and we verified it came from Facebook."
                  done
                />
                <Step
                  icon={Clock}
                  title="Being processed"
                  body={`Our team locates and removes the data associated with your request. We complete this within ${RESPONSE_WINDOW}.`}
                  done={false}
                />
                <Step
                  icon={Mail}
                  title="Confirmation"
                  body="We email you once the deletion is complete. If we need anything from you to identify your records, we’ll get in touch."
                  done={false}
                />
              </div>

              <div className="mt-10 p-6 bg-white border border-outline-variant/30 rounded-2xl shadow-xs">
                <h2 className="font-bold text-base text-on-surface" style={JAKARTA_FONT}>
                  What we delete
                </h2>
                <p className="text-sm text-on-surface-variant leading-relaxed mt-2">
                  VyostraAI stores the information you submitted to a business’s lead form or chat —
                  typically your name, phone number and email address, along with any answers you
                  gave. We remove that information, and the record of the conversation it came from.
                </p>
                <p className="text-sm text-on-surface-variant leading-relaxed mt-3">
                  We may retain a minimal record that a deletion request was made, where we are
                  required to do so by law.
                </p>
              </div>
            </>
          ) : (
            <p className="mt-3 text-base text-on-surface-variant leading-relaxed">
              This page shows the status of a request to delete the data VyostraAI holds about you.
              You’ll normally arrive here from a link with a confirmation code. If you’d like to
              request deletion directly, email us at the address below and we’ll handle it.
            </p>
          )}

          <div className="mt-10 p-6 bg-white border border-outline-variant/30 rounded-2xl flex items-center gap-5 shadow-xs">
            <div className="w-12 h-12 bg-primary/10 text-primary rounded-full flex items-center justify-center shrink-0">
              <Mail className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <h4 className="font-bold text-xs text-outline uppercase tracking-wider">
                Questions about this request
              </h4>
              <a
                href={`mailto:${SUPPORT_EMAIL}`}
                className="text-base font-bold text-on-surface hover:text-primary transition-colors break-all"
              >
                {SUPPORT_EMAIL}
              </a>
            </div>
          </div>
        </div>
      </main>

      <Footer />
      <DemoModal isOpen={isDemoOpen} onClose={() => setIsDemoOpen(false)} />
    </div>
  )
}
