import { Navigate, useParams } from 'react-router-dom'
import { AlertCircle } from 'lucide-react'
import { Link } from 'react-router-dom'
import { leadDetailPath, unpackLeadRef } from '../lib/lead-ref'

// The landing point for the "Open this lead" button on the WhatsApp handoff
// alert. Its whole job is to turn one packed path segment back into a LeadRef
// and forward to the real detail route.
//
// Deliberately PUBLIC. It renders no lead data of its own -- the redirect
// target is inside /dashboard, so ProtectedRoute still decides whether the
// person may read the lead. Putting the guard here instead would only move the
// same bounce one route earlier.
//
// A client who is not signed in on the device still reaches the lead: the
// forward lands on ProtectedRoute, which records the attempted path before
// bouncing to /login and returns them here afterwards. See
// lib/post-login-redirect.ts -- that mechanism exists for this button.
export default function LeadLinkPage() {
  const { token } = useParams<{ token: string }>()
  const leadRef = token ? unpackLeadRef(token) : null

  if (leadRef) {
    return <Navigate to={leadDetailPath(leadRef)} replace />
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-6">
      <div className="max-w-md w-full bg-white rounded-2xl border border-slate-200 p-8 text-center">
        <AlertCircle className="w-10 h-10 text-amber-500 mx-auto mb-4" />
        <h1 className="text-lg font-semibold text-slate-900">This lead link is not valid</h1>
        <p className="mt-2 text-sm text-slate-600">
          This link could not be read. Open your inbox and the lead will be near the top of the queue.
        </p>
        <Link
          to="/dashboard/leads"
          className="inline-block mt-6 bg-violet-600 text-white px-5 py-2.5 rounded-xl font-semibold text-sm hover:opacity-90 transition-opacity"
        >
          Open inbox
        </Link>
      </div>
    </div>
  )
}
