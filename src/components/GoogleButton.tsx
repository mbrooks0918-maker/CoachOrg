import { useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { providerEnabled } from '../lib/authProviders'

/** Google's four-colour mark. Their brand terms require the official glyph. */
function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z"
      />
      <path
        fill="#34A853"
        d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z"
      />
      <path
        fill="#FBBC05"
        d="M11.69 28.18C11.25 26.86 11 25.45 11 24s.25-2.86.69-4.18v-5.7H4.34C2.85 17.09 2 20.45 2 24s.85 6.91 2.34 9.88l7.35-5.7z"
      />
      <path
        fill="#EA4335"
        d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z"
      />
    </svg>
  )
}

/**
 * Starts Google's OAuth flow.
 *
 * Sends people back to /auth/callback rather than to the program, so a brand
 * new Google account lands in the same onboarding as an email sign-up instead
 * of skipping it.
 */
export function GoogleButton({ label = 'Continue with Google' }: { label?: string }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function handleClick() {
    setBusy(true)
    setError('')

    // Ask before leaving: a disabled provider does not come back as an error
    // here, it strands the browser on Supabase's JSON error page.
    if (!(await providerEnabled('google'))) {
      setBusy(false)
      setError('Google sign-in is not switched on for this site yet. Use your email and password for now.')
      return
    }

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })

    if (error) {
      setBusy(false)
      setError(error.message)
    }
    // On success the browser leaves for Google, so there is nothing to reset.
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        className="inline-flex w-full items-center justify-center gap-3 rounded-lg border border-border bg-surface px-6 py-3.5 font-body text-base font-semibold text-ink transition hover:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:cursor-not-allowed disabled:opacity-50"
      >
        <GoogleMark />
        {busy ? 'Opening Google…' : label}
      </button>

      {error && (
        <p role="alert" className="mt-3 font-body text-sm text-muted">
          {error}
        </p>
      )}
    </div>
  )
}

/** "or" rule between the Google button and the email form. */
export function AuthDivider() {
  return (
    <div className="flex items-center gap-4">
      <span className="h-px flex-1 bg-border" />
      <span className="font-body text-xs uppercase tracking-[0.2em] text-muted">or</span>
      <span className="h-px flex-1 bg-border" />
    </div>
  )
}
