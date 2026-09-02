import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { Button, ErrorNote, Field, TextArea } from '../components/ui'
import { supabase } from '../lib/supabaseClient'
import {
  bracketLabel,
  loadMyChildren,
  loadPublicSeason,
  longDate,
  submitRegistration,
  type PublicSeason,
  type SubmitResult,
} from '../lib/registration'

/**
 * The public sign-up form. The only screen in CoachOrg a stranger can open.
 *
 * Anyone may read the season and fill the form in; finishing requires an
 * account, because a registration nobody owns cannot be looked after -- the
 * rec centre has to be able to reach somebody, and that somebody has to be
 * able to come back and see where they stand. The account step therefore sits
 * at the END, inline, rather than as a wall at the front: a parent should not
 * have to sign up to find out what the season costs them in time.
 *
 * Keeping it inline also keeps everything they have typed. Sending them away
 * to /login and back would lose the form.
 */
export default function RegisterPublic() {
  const { token = '' } = useParams<{ token: string }>()
  const { session, loading: authLoading } = useAuth()

  const [season, setSeason] = useState<PublicSeason | null>(null)
  const [loadError, setLoadError] = useState('')
  const [loading, setLoading] = useState(true)

  const [children, setChildren] = useState<{ id: string; full_name: string }[]>([])
  const [personId, setPersonId] = useState<string | null>(null)

  const [childName, setChildName] = useState('')
  const [birthdate, setBirthdate] = useState('')
  const [emergencyName, setEmergencyName] = useState('')
  const [emergencyPhone, setEmergencyPhone] = useState('')
  const [medicalNotes, setMedicalNotes] = useState('')
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [parentName, setParentName] = useState('')
  const [parentPhone, setParentPhone] = useState('')

  // The account step, shown only once they try to finish without one.
  const [needsAccount, setNeedsAccount] = useState(false)
  const [mode, setMode] = useState<'signup' | 'login'>('signup')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState<SubmitResult | null>(null)

  useEffect(() => {
    let active = true
    ;(async () => {
      const { season, error } = await loadPublicSeason(token)
      if (!active) return
      if (error) setLoadError(error)
      else setSeason(season ?? null)
      setLoading(false)
    })()
    return () => {
      active = false
    }
  }, [token])

  // Once there is a session, offer the children this adult already has here
  // rather than making them retype a child the system already knows.
  useEffect(() => {
    let active = true
    ;(async () => {
      if (!session || !season) return
      const mine = await loadMyChildren(season.organization_id)
      if (active) setChildren(mine)
    })()
    return () => {
      active = false
    }
  }, [session, season])

  const finish = useCallback(async () => {
    if (!season) return
    setBusy(true)
    setError('')
    const result = await submitRegistration({
      token,
      parentName,
      parentPhone,
      personId,
      childName,
      birthdate,
      emergencyName,
      emergencyPhone,
      medicalNotes,
      answers,
    })
    setBusy(false)
    if (!result.ok) {
      setError(result.message)
      return
    }
    setDone(result.result ?? null)
  }, [
    season, token, parentName, parentPhone, personId, childName, birthdate,
    emergencyName, emergencyPhone, medicalNotes, answers,
  ])

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    if (!session) {
      setNeedsAccount(true)
      return
    }
    await finish()
  }

  async function handleAccount(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')

    const { data, error } =
      mode === 'signup'
        ? await supabase.auth.signUp({ email: email.trim(), password })
        : await supabase.auth.signInWithPassword({ email: email.trim(), password })

    if (error) {
      setBusy(false)
      setError(error.message)
      return
    }

    // With email confirmation switched on, signUp returns no session. Say so
    // rather than silently failing the submission that follows.
    if (!data.session) {
      setBusy(false)
      setError('Check your email to confirm the address, then open this link again to finish.')
      return
    }

    setBusy(false)
    await finish()
  }

  // ---------------------------------------------------------------- states

  if (loading || authLoading) {
    return <Shell><p className="font-body text-muted">Loading…</p></Shell>
  }

  if (loadError || !season) {
    return (
      <Shell>
        <h1 className="font-display text-3xl font-bold uppercase tracking-tight text-ink">
          Registration not found
        </h1>
        <p className="mt-3 font-body text-base text-muted">
          {loadError || 'That registration link is not valid.'} Check the link with whoever sent it
          to you.
        </p>
      </Shell>
    )
  }

  if (done) {
    return (
      <Shell>
        <p className="font-body text-xs font-medium uppercase tracking-[0.3em] text-accent">
          {done.status === 'confirmed' ? 'You are in' : 'On the waiting list'}
        </p>
        <h1 className="mt-4 font-display text-4xl font-bold uppercase tracking-tight text-ink">
          {done.status === 'confirmed' ? 'Registered' : 'Waitlisted'}
        </h1>
        <p className="mt-4 font-body text-base text-muted">
          {done.status === 'confirmed' ? (
            <>
              <span className="text-ink">{done.child_name}</span> has a place in{' '}
              {done.season_name} with {done.program_name}.
            </>
          ) : (
            <>
              {done.season_name} is full, so <span className="text-ink">{done.child_name}</span> is
              on the waiting list
              {done.waitlist_rank ? ` at number ${done.waitlist_rank}` : ''}. You will be told if a
              place opens.
            </>
          )}
        </p>
        <Link
          to={`/program/${done.program_id}`}
          className="mt-8 inline-flex items-center justify-center rounded-lg bg-accent px-8 py-3.5 font-body text-base font-semibold text-ink transition hover:brightness-110"
        >
          Go to the team
        </Link>
      </Shell>
    )
  }

  const bracket = bracketLabel(season)
  const closed = !season.open_now
  const notYet = new Date() < new Date(season.registration_opens_at)

  return (
    <Shell>
      <p className="font-body text-xs font-medium uppercase tracking-[0.3em] text-muted">
        {season.organization_name}
      </p>
      <h1 className="mt-4 font-display text-4xl font-bold uppercase leading-[1.05] tracking-tight text-ink sm:text-5xl">
        {season.program_name}
      </h1>
      <p className="mt-3 font-body text-lg text-muted">
        {season.season_name}
        {season.starts_on && <> · {longDate(season.starts_on)}</>}
        {season.ends_on && <> – {longDate(season.ends_on)}</>}
      </p>

      <div className="mt-6 flex flex-wrap gap-2">
        {bracket && <Chip>{bracket}</Chip>}
        {season.spots_remaining !== null && (
          <Chip>
            {season.spots_remaining > 0
              ? `${season.spots_remaining} of ${season.capacity} places left`
              : 'Full — joining the waiting list'}
          </Chip>
        )}
      </div>

      {closed ? (
        <div className="mt-8 rounded-xl border border-border bg-surface px-5 py-6">
          <p className="font-body text-base text-ink">
            {notYet
              ? `Registration opens ${longDate(season.registration_opens_at)}.`
              : `Registration closed ${longDate(season.registration_closes_at)}.`}
          </p>
          <p className="mt-2 font-body text-sm text-muted">
            {notYet
              ? 'Come back to this link then.'
              : 'Get in touch with the program if you still need a place.'}
          </p>
        </div>
      ) : needsAccount ? (
        <form onSubmit={handleAccount} className="mt-8 space-y-5">
          <div className="rounded-xl border border-border bg-surface px-5 py-4">
            <p className="font-body text-sm text-ink">Last step — an account for you.</p>
            <p className="mt-1.5 font-body text-xs text-muted">
              It is how you will see your child's team, get messages, and come back to this
              registration. Nothing you typed is lost.
            </p>
          </div>

          <Field
            label="Email"
            name="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
          <Field
            label="Password"
            name="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            required
          />

          <ErrorNote>{error}</ErrorNote>

          <Button type="submit" disabled={busy}>
            {busy ? 'Finishing…' : mode === 'signup' ? 'Create Account & Register' : 'Sign In & Register'}
          </Button>

          <button
            type="button"
            onClick={() => { setMode(mode === 'signup' ? 'login' : 'signup'); setError('') }}
            className="w-full font-body text-sm text-muted underline underline-offset-4 transition hover:text-ink"
          >
            {mode === 'signup' ? 'I already have an account' : 'I need to create an account'}
          </button>
        </form>
      ) : (
        <form onSubmit={handleSubmit} className="mt-8 space-y-6">
          {children.length > 0 && (
            <div>
              <span className="font-body text-xs font-medium uppercase tracking-[0.18em] text-muted">
                Who are you signing up?
              </span>
              <div className="mt-2 flex flex-wrap gap-2">
                {children.map((child) => (
                  <button
                    key={child.id}
                    type="button"
                    onClick={() => setPersonId(child.id)}
                    className={`rounded-full border px-4 py-2 font-body text-sm transition ${
                      personId === child.id
                        ? 'border-accent bg-accent/15 text-ink'
                        : 'border-border text-muted hover:border-accent hover:text-ink'
                    }`}
                  >
                    {child.full_name}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setPersonId(null)}
                  className={`rounded-full border px-4 py-2 font-body text-sm transition ${
                    personId === null
                      ? 'border-accent bg-accent/15 text-ink'
                      : 'border-border text-muted hover:border-accent hover:text-ink'
                  }`}
                >
                  Someone else
                </button>
              </div>
            </div>
          )}

          {personId === null && (
            <>
              <Field
                label="Player's full name"
                name="childName"
                value={childName}
                onChange={(e) => setChildName(e.target.value)}
                placeholder="Jordan Reed"
                required
              />
              <Field
                label="Date of birth"
                name="birthdate"
                type="date"
                value={birthdate}
                onChange={(e) => setBirthdate(e.target.value)}
                hint={bracket ?? undefined}
                required
              />
              <Field
                label="Emergency contact"
                name="emergencyName"
                value={emergencyName}
                onChange={(e) => setEmergencyName(e.target.value)}
                placeholder="Who to call, and who they are"
              />
              <Field
                label="Emergency phone"
                name="emergencyPhone"
                type="tel"
                value={emergencyPhone}
                onChange={(e) => setEmergencyPhone(e.target.value)}
              />
              <TextArea
                label="Anything the coach should know"
                name="medicalNotes"
                value={medicalNotes}
                onChange={(e) => setMedicalNotes(e.target.value)}
                hint="Allergies, medication, injuries. Only staff and you can read this."
                placeholder="Optional"
              />
            </>
          )}

          {season.questions.map((question) => (
            <QuestionField
              key={question.id}
              question={question}
              value={answers[question.id] ?? ''}
              onChange={(value) => setAnswers((a) => ({ ...a, [question.id]: value }))}
            />
          ))}

          <div className="border-t border-border pt-6">
            <Field
              label="Your name"
              name="parentName"
              value={parentName}
              onChange={(e) => setParentName(e.target.value)}
              placeholder="The parent or guardian"
              required={!session}
            />
            <div className="mt-5">
              <Field
                label="Your phone"
                name="parentPhone"
                type="tel"
                value={parentPhone}
                onChange={(e) => setParentPhone(e.target.value)}
                placeholder="Optional"
                hint="So the coach can reach you."
              />
            </div>
          </div>

          <ErrorNote>{error}</ErrorNote>

          <Button type="submit" disabled={busy}>
            {busy
              ? 'Registering…'
              : season.spots_remaining === 0
                ? 'Join the waiting list'
                : 'Register'}
          </Button>
        </form>
      )}
    </Shell>
  )
}

// ------------------------------------------------------------------ pieces

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-svh px-6 py-14">
      <div className="mx-auto w-full max-w-xl">{children}</div>
    </main>
  )
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-border px-3 py-1 font-body text-xs uppercase tracking-wider text-muted">
      {children}
    </span>
  )
}

function QuestionField({
  question,
  value,
  onChange,
}: {
  question: PublicSeason['questions'][number]
  value: string
  onChange: (value: string) => void
}) {
  const label = question.required ? `${question.prompt} *` : question.prompt

  if (question.kind === 'text') {
    return (
      <Field
        label={label}
        name={`q-${question.id}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={question.required}
      />
    )
  }

  if (question.kind === 'boolean') {
    return (
      <div>
        <span className="font-body text-xs font-medium uppercase tracking-[0.18em] text-muted">
          {label}
        </span>
        <div className="mt-2 flex gap-2">
          {[
            { v: 'true', l: 'Yes' },
            { v: 'false', l: 'No' },
          ].map((option) => (
            <button
              key={option.v}
              type="button"
              onClick={() => onChange(option.v)}
              className={`rounded-lg border px-5 py-2.5 font-body text-sm transition ${
                value === option.v
                  ? 'border-accent bg-accent/15 text-ink'
                  : 'border-border text-muted hover:border-accent hover:text-ink'
              }`}
            >
              {option.l}
            </button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div>
      <span className="font-body text-xs font-medium uppercase tracking-[0.18em] text-muted">
        {label}
      </span>
      <div className="mt-2 flex flex-wrap gap-2">
        {question.options.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            className={`rounded-lg border px-4 py-2.5 font-body text-sm transition ${
              value === option
                ? 'border-accent bg-accent/15 text-ink'
                : 'border-border text-muted hover:border-accent hover:text-ink'
            }`}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  )
}
