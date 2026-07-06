import { useEffect } from 'react'
import { useAuth } from '../hooks/useAuth'
import { Spinner } from '../components/Spinner/Spinner'
import styles from './AuthCallbackPage.module.css'

export default function AuthCallbackPage() {
  const { handleCallback } = useAuth()

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('code')

    if (!code) {
      window.location.href = '/login'
      return
    }

    handleCallback(code).catch(() => {
      window.location.href = '/login'
    })
  }, [handleCallback])

  return (
    <div className={styles.page}>
      <Spinner size="lg" />
      <p>Signing you in...</p>
    </div>
  )
}
