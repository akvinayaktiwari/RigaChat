import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { LoadingScreen } from '../components/LoadingScreen'
import { takePostLoginPath } from '../lib/post-login-redirect'

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
        // sessionStorage rather than a query param: useAuth.login() leaves the
        // app via window.location.href and Cognito returns to a FIXED
        // redirect_uri, so nothing we put in the URL survives the round trip.
        // This is the path the Google-federated account actually uses.
        navigate(takePostLoginPath(), { replace: true })
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return <LoadingScreen status="Signing you in…" />
}
