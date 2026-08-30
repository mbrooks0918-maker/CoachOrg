import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { findPrimaryProgramId } from '../lib/program'
import { Button, ErrorNote, Field, FormShell } from '../components/ui'
import { AuthDivider, GoogleButton } from '../components/GoogleButton'

export default function SignUp() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setNotice('')

    if (password !== confirm) {
      setError('Those passwords do not match.')
      return
    }
    if (password.length < 8) {
      setError('Use at least 8 characters.')
      return
    }

    setBusy(true)
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
    })
    setBusy(false)

    if (signUpError) {
      setError(signUpError.message)
      return
    }

    // With email confirmation enabled, signUp returns a user but no session.
    // There is nothing to redirect into yet -- the account cannot insert rows
    // until it is confirmed -- so say so instead of bouncing to a page that
    // would immediately fail RLS.
    if (!data.session) {
      setNotice(
        'Account created. Check your email for a confirmation link, then log in.',
      )
      return
    }

    // Almost always null for a brand-new account, but signUp on an email
    // that already exists returns a session for the existing user.
    const programId = data.user ? await findPrimaryProgramId(data.user.id) : null
    navigate(programId ? `/program/${programId}` : '/create-org', { replace: true })
  }

  return (
    <FormShell
      title="Create account"
      subtitle="Set up your coaching account to get a program running."
      footer={
        <>
          Already have one?{' '}
          <Link to="/login" className="text-accent underline underline-offset-4">
            Log in
          </Link>
        </>
      }
    >
      <div className="space-y-5">
        <GoogleButton label="Sign up with Google" />
        <AuthDivider />
      </div>

      <form onSubmit={handleSubmit} className="mt-5 space-y-5">
        <Field
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Field
          label="Password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          hint="At least 8 characters."
        />
        <Field
          label="Confirm password"
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />

        <ErrorNote>{error}</ErrorNote>
        {notice && (
          <p className="rounded-lg border border-border bg-surface px-4 py-3 font-body text-sm text-ink">
            {notice}
          </p>
        )}

        <Button type="submit" disabled={busy}>
          {busy ? 'Creating…' : 'Create Account'}
        </Button>
      </form>
    </FormShell>
  )
}
