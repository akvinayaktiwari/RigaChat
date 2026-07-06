import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { Spinner } from '../components/Spinner/Spinner'
import styles from './AuthCallbackPage.module.css'

export default function AuthCallbackPage() {
  const { handleCallback } = useAuth()
  const navigate = useNavigate()
  // The authorization code is single-use, so this effect must fire the
  // exchange exactly once even under React.StrictMode's dev-mode double
  // mount/unmount/remount (and even though handleCallback's identity
  // changes on every AuthProvider re-render).
  const exchangeStarted = useRef(false)

  useEffect(() => {
    if (exchangeStarted.current) return
    exchangeStarted.current = true

    const code = new URLSearchParams(window.location.search).get('code')

    if (!code) {
      navigate('/login', { replace: true })
      return
    }

    handleCallback(code).then((succeeded) => {
      if (succeeded) {
        navigate('/dashboard', { replace: true })
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className={styles.page}>
      <Spinner size="lg" />
      <p>Signing you in...</p>
    </div>
  )
}
