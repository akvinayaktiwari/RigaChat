import Razorpay from 'razorpay'

const keyId = process.env.RAZORPAY_KEY_ID
const keySecret = process.env.RAZORPAY_KEY_SECRET

if (!keyId || !keySecret) {
  throw new Error(
    'Missing required environment variables RAZORPAY_KEY_ID and/or RAZORPAY_KEY_SECRET. Set them in your .env file before starting the server.'
  )
}

export const razorpayClient = new Razorpay({ key_id: keyId, key_secret: keySecret })
