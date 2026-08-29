import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { findPrimaryProgramId } from '../lib/program'
import { Button, ErrorNote, Field, FormShell } from '../components/ui'

export default function Login() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)

    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (signInError) {
      setBusy(false)
      setError(signInError.message)
      return
    }

    // Returning users belong to a program already; only someone with none
    // should ever see the setup form.
    const programId = data.user ? await findPrimaryProgramId(data.user.id) : null
    setBusy(false)
    navigate(programId ? `/program/${programId}` : '/create-org', { replace: true })
  }

  return (
    <FormShell
      title="Log in"
      subtitle="Welcome back."
      footer={
        <>
          Need an account?{' '}
          <Link to="/signup" className="text-accent underline underline-offset-4">
            Create one
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-5">
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
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <ErrorNote>{error}</ErrorNote>

        <Button type="submit" disabled={busy}>
          {busy ? 'Logging in…' : 'Log In'}
        </Button>
      </form>
    </FormShell>
  )
}
