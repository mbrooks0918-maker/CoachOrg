import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { resolveLandingProgramId } from '../lib/program'

/**
 * Where Google drops people after they approve.
 *
 * The Supabase client exchanges the code in the URL by itself, so this screen
 * only waits for the session to appear and then makes the same decision the
 * email login makes: into your program if you have one, into setup if you do
 * not. That is what keeps a Google sign-up from skipping onboarding.
 */
export default function AuthCallback() {
  const { session, loading } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState('')

  useEffect(() => {
    if (loading) return

    // Arriving with no session means the exchange failed or the user backed
    // out at Google's screen.
    if (!session) {
      const params = new URLSearchParams(window.location.search)
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
      setError(
        params.get('error_description') ??
          hash.get('error_description') ??
          'Sign-in did not complete. Please try again.',
      )
      return
    }

    let active = true
    ;(async () => {
      const programId = await resolveLandingProgramId(session.user.id)
      if (!active) return
      navigate(programId ? `/program/${programId}` : '/create-org', { replace: true })
    })()
    return () => {
      active = false
    }
  }, [session, loading, navigate])

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-5 px-6 text-center">
      {error ? (
        <>
          <p
            role="alert"
            className="max-w-md rounded-lg border border-accent/40 bg-accent/10 px-4 py-3 font-body text-sm text-ink"
          >
            {error}
          </p>
          <button
            type="button"
            onClick={() => navigate('/login', { replace: true })}
            className="font-body text-sm text-accent underline underline-offset-4"
          >
            Back to log in
          </button>
        </>
      ) : (
        <p className="font-body text-muted">Signing you in…</p>
      )}
    </main>
  )
}
