// checkout.js is a third-party script with real payment logic in it — loaded
// lazily on first modal open rather than on every page (marketing, dashboard,
// admin console alike), and only once per session via the module-level
// loadPromise cache / window.Razorpay check.

export interface RazorpayCheckoutResponse {
  razorpay_payment_id: string
  razorpay_subscription_id: string
  razorpay_signature: string
}

export interface RazorpayCheckoutOptions {
  key: string
  subscription_id: string
  name: string
  description?: string
  theme?: { color?: string }
  handler: (response: RazorpayCheckoutResponse) => void
  modal?: { ondismiss?: () => void }
}

export interface RazorpayCheckoutInstance {
  open: () => void
}

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayCheckoutOptions) => RazorpayCheckoutInstance
  }
}

const CHECKOUT_SCRIPT_SRC = 'https://checkout.razorpay.com/v1/checkout.js'

let loadPromise: Promise<void> | null = null

export function loadRazorpayScript(): Promise<void> {
  if (window.Razorpay) {
    return Promise.resolve()
  }

  if (loadPromise) {
    return loadPromise
  }

  loadPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = CHECKOUT_SCRIPT_SRC
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => {
      loadPromise = null
      reject(new Error('Failed to load Razorpay checkout script'))
    }
    document.head.appendChild(script)
  })

  return loadPromise
}
