import { useEffect, useState } from 'react'
import { ExternalLink, Receipt } from 'lucide-react'
import { useToast } from '../components/Toast/Toast'
import { getPaymentHistory } from '../services/api'
import type { PaymentRecord } from '../types/index'

// Razorpay amounts are always in the smallest currency unit (paise for INR),
// never whole rupees - dividing by 100 here matches how the amount is
// captured in webhook-service.ts's subscription.charged handling.
function formatAmount(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(amount / 100)
  } catch {
    return `${(amount / 100).toLocaleString('en-IN')} ${currency}`
  }
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'captured') {
    return <span className="bg-emerald-100 text-emerald-700 text-xs px-2 py-1 rounded-full w-fit">Paid</span>
  }
  if (status === 'failed') {
    return <span className="bg-red-100 text-red-600 text-xs px-2 py-1 rounded-full w-fit">Failed</span>
  }
  return (
    <span className="bg-slate-100 text-slate-500 text-xs px-2 py-1 rounded-full w-fit capitalize">{status}</span>
  )
}

function TableSkeleton() {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 mt-4 overflow-hidden">
      <div className="p-4 space-y-4">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="animate-pulse grid grid-cols-4 gap-4">
            <div className="h-4 bg-slate-100 rounded" />
            <div className="h-4 bg-slate-100 rounded" />
            <div className="h-4 bg-slate-100 rounded" />
            <div className="h-4 bg-slate-100 rounded" />
          </div>
        ))}
      </div>
    </div>
  )
}

export default function BillingPage() {
  const toast = useToast()

  const [payments, setPayments] = useState<PaymentRecord[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getPaymentHistory().then((res) => {
      if (res.success) {
        setPayments(res.data ?? [])
      } else {
        toast.show('Failed to load payment history', 'error')
      }
      setLoading(false)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Billing</h1>
          <p className="text-slate-500 text-sm">Your payment history</p>
        </div>
      </div>

      {loading ? (
        <TableSkeleton />
      ) : payments.length === 0 ? (
        <div className="py-16 flex flex-col items-center text-center">
          <Receipt size={48} className="text-slate-300 mb-4" />
          <p className="text-slate-800 font-medium">No payments yet</p>
          <p className="text-slate-500 text-sm mt-1">Charges will show up here once your subscription is active</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 mt-4 overflow-hidden overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                <th className="text-left px-4 py-3 font-medium whitespace-nowrap">Date</th>
                <th className="text-left px-4 py-3 font-medium whitespace-nowrap">Amount</th>
                <th className="text-left px-4 py-3 font-medium whitespace-nowrap">Status</th>
                <th className="text-left px-4 py-3 font-medium whitespace-nowrap">Payment ID</th>
                <th className="text-left px-4 py-3 font-medium whitespace-nowrap">Invoice</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((payment) => (
                <tr
                  key={payment.paymentId}
                  className="border-b border-slate-50 hover:bg-slate-50 transition-colors"
                >
                  <td className="px-4 py-3 text-slate-700 text-sm whitespace-nowrap">
                    {new Date(payment.paidAt).toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </td>
                  <td className="px-4 py-3 text-slate-700 text-sm whitespace-nowrap">
                    {formatAmount(payment.amount, payment.currency)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <StatusBadge status={payment.status} />
                  </td>
                  <td className="px-4 py-3 text-slate-400 text-sm whitespace-nowrap font-mono">
                    {payment.paymentId}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {payment.invoiceUrl ? (
                      <a
                        href={payment.invoiceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-indigo-600 text-sm hover:underline flex items-center gap-1 w-fit"
                      >
                        View invoice
                        <ExternalLink size={12} />
                      </a>
                    ) : (
                      <span className="text-slate-400 text-sm">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
