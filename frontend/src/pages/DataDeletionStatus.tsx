import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AlertCircle, CheckCircle2, Clock, Loader2, Mail, ShieldCheck } from 'lucide-react'
import { getMetaDeletionRequestStatus } from '../services/api'
import type { MetaDeletionRequestStatus } from '../types'
import Navbar from '../components/landing/Navbar'
import Footer from '../components/landing/Footer'
import DemoModal from '../components/landing/modals/DemoModal'

const JAKARTA_FONT = { fontFamily: "'Plus Jakarta Sans', sans-serif" }

// Where Meta sends someone after they request deletion of their data from
// within Facebook. backend/src/routes/webhooks.ts's /meta/data-deletion
// callback returns this URL with the confirmation code appended.
//
// This page deliberately does NOT say the data has been deleted. The purge is
// manual: Meta's signed request carries only an app-scoped user_id, which
// appears on no record we store, so nothing can be located automatically (see
// TODOS.md, "Meta data deletion callback fabricates success"). Claiming
// completion here would be a false statement to the person asking and to
// Meta's reviewers. It reports what is actually true, and now reads that from
// the stored request rather than trusting the URL: a code that was never
// issued says so, instead of rendering an identical success page.

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

type LookupState =
  | { phase: 'idle' }
  | { phase: 'loading' }
  | { phase: 'found'; request: MetaDeletionRequestStatus }
  | { phase: 'unknown' }
  // A failed lookup is NOT reported as "no such request" -- telling someone
  // their deletion request does not exist because our API was down would be
  // the worst wrong answer this page can give.
  | { phase: 'error' }

function formatRequestedAt(iso: string): string {
  const parsed = new Date(iso)
  if (Number.isNaN(parsed.getTime())) return iso

  return parsed.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

export default function DataDeletionStatus() {
  const [searchParams] = useSearchParams()
  const [isDemoOpen, setIsDemoOpen] = useState(false)
  const confirmationCode = searchParams.get('id')
  const [lookup, setLookup] = useState<LookupState>({ phase: 'idle' })

  useEffect(() => {
    if (!confirmationCode) {
      setLookup({ phase: 'idle' })
      return
    }

    let cancelled = false
    setLookup({ phase: 'loading' })

    getMetaDeletionRequestStatus(confirmationCode)
      .then((response) => {
        if (cancelled) return
        if (response.success && response.data) {
          setLookup({ phase: 'found', request: response.data })
        } else {
          setLookup({ phase: 'unknown' })
        }
      })
      .catch((error: unknown) => {
        if (cancelled) return
        console.error('Deletion status lookup failed:', error)
        setLookup({ phase: 'error' })
      })

    // The code changes only if someone edits the URL in place, but without
    // this the stale response could overwrite the newer one.
    return () => {
      cancelled = true
    }
  }, [confirmationCode])

  const isComplete = lookup.phase === 'found' && lookup.request.status === 'completed'
  const showRequestDetail = lookup.phase === 'found'

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
            {!confirmationCode
              ? 'Data deletion requests'
              : lookup.phase === 'unknown'
                ? 'We can’t find that request'
                : isComplete
                  ? 'Your request is complete'
                  : 'We’ve received your request'}
          </h1>

          {lookup.phase === 'loading' && (
            <p className="mt-3 flex items-center gap-2 text-base text-on-surface-variant">
              <Loader2 className="w-4 h-4 animate-spin" />
              Looking up your request…
            </p>
          )}

          {lookup.phase === 'error' && (
            <div className="mt-6 p-5 bg-amber-50 border border-amber-200 rounded-2xl flex gap-4">
              <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-sm text-on-surface leading-relaxed">
                We couldn’t load the status of your request just now. This doesn’t mean the request
                was lost — please try again shortly, or email us at {SUPPORT_EMAIL} with your
                confirmation code.
              </p>
            </div>
          )}

          {lookup.phase === 'unknown' && (
            <p className="mt-3 text-base text-on-surface-variant leading-relaxed">
              We have no record of a deletion request with that confirmation code. Check the link
              you followed is complete, or email us at {SUPPORT_EMAIL} and we’ll look into it.
            </p>
          )}

          {showRequestDetail ? (
            <>
              <p className="mt-3 text-base text-on-surface-variant leading-relaxed">
                {isComplete
                  ? 'Your request to delete the data VyostraAI holds about you has been completed. Keep the confirmation code below for your records.'
                  : 'Your request to delete the data VyostraAI holds about you has been received and verified. Keep the confirmation code below — you’ll need it if you contact us about this request.'}
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
                  {lookup.phase === 'found' ? lookup.request.confirmationCode : confirmationCode}
                </p>
                {lookup.phase === 'found' && (
                  <p className="text-sm text-on-surface-variant mt-2">
                    Received {formatRequestedAt(lookup.request.requestedAt)}
                  </p>
                )}
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
                  body={
                    isComplete
                      ? 'Our team located and removed the data associated with your request.'
                      : `Our team locates and removes the data associated with your request. We complete this within ${RESPONSE_WINDOW}.`
                  }
                  done={isComplete}
                />
                <Step
                  icon={Mail}
                  title="Confirmation"
                  body={
                    isComplete
                      ? 'This request is closed. Email us at the address below if you have questions about it.'
                      : 'We email you once the deletion is complete. If we need anything from you to identify your records, we’ll get in touch.'
                  }
                  done={isComplete}
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
            !confirmationCode && (
              <p className="mt-3 text-base text-on-surface-variant leading-relaxed">
                This page shows the status of a request to delete the data VyostraAI holds about
                you. You’ll normally arrive here from a link with a confirmation code. If you’d like
                to request deletion directly, email us at the address below and we’ll handle it.
              </p>
            )
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
