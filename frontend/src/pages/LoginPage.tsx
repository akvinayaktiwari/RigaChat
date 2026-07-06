import { useAuth } from '../hooks/useAuth'
import { Button } from '../components/Button/Button'
import styles from './LoginPage.module.css'

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#fff"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 01-1.8 2.72v2.26h2.9c1.7-1.57 2.7-3.88 2.7-6.62z"
      />
      <path
        fill="#fff"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.95v2.33A9 9 0 009 18z"
      />
      <path
        fill="#fff"
        d="M3.95 10.7A5.4 5.4 0 013.68 9c0-.59.1-1.16.27-1.7V4.97H.95A9 9 0 000 9c0 1.45.35 2.83.95 4.03l3-2.33z"
      />
      <path
        fill="#fff"
        d="M9 3.58c1.32 0 2.51.46 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 00.95 4.97l3 2.33C4.66 5.17 6.65 3.58 9 3.58z"
      />
    </svg>
  )
}

export default function LoginPage() {
  const { login } = useAuth()

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.logo}>ChatIQ</div>
        <p className={styles.tagline}>AI-powered conversations for your website</p>

        <Button size="lg" onClick={login}>
          <GoogleIcon />
          Continue with Google
        </Button>

        <p className={styles.finePrint}>By signing in you agree to our terms</p>
      </div>
    </div>
  )
}
