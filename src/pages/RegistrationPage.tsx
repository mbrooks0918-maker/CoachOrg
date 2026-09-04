import { useCallback, useEffect, useState } from 'react'
import { Button, ErrorNote, Field } from '../components/ui'
import { useProgram } from '../lib/programContext'
import { isStaff } from '../lib/roster'
import {
  addQuestion,
  bracketLabel,
  confirmRegistration,
  deleteQuestion,
  loadQuestions,
  loadRegistrations,
  loadSeasons,
  longDate,
  saveSeason,
  withdrawRegistration,
  type Registration,
  type Season,
  type SeasonQuestion,
} from '../lib/registration'

/**
 * Seasons and the sign-ups they collect.
 *
 * Only reachable for an organization on the registration plan -- the section
 * is not in the navigation otherwise, and the policies behind every table here
 * check the same thing, so a guessed URL finds nothing to act on.
 */
export default function RegistrationPage() {
  const { program, role } = useProgram()
  const staff = isStaff(role)

  const [seasons, setSeasons] = useState<Season[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [editing, setEditing] = useState<Season | 'new' | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    const rows = await loadSeasons(program.id)
    setSeasons(rows)
    setSelected((current) => current ?? rows[0]?.id ?? null)
  }, [program.id])

  useEffect(() => {
    let active = true
    ;(async () => {
      await refresh()
      if (active) setLoading(false)
    })()
    return () => {
      active = false
    }
  }, [refresh])

  if (loading) return <p className="font-body text-muted">Loading…</p>

  if (!staff) {
    return (
      <div>
        <Heading>Registration</Heading>
        <p className="mt-4 font-body text-sm text-muted">
          Your coaches manage sign-ups for this program.
        </p>
      </div>
    )
  }

  const season = seasons.find((s) => s.id === selected) ?? null

  return (
    <div>
      <div className="flex items-baseline justify-between gap-4">
        <Heading>Registration</Heading>
        <button
          type="button"
          onClick={() => setEditing('new')}
          className="font-body text-xs uppercase tracking-wider text-muted underline underline-offset-4 transition hover:text-accent"
        >
          + New season
        </button>
      </div>

      {editing && (
        <SeasonForm
          programId={program.id}
          season={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={async (saved) => {
            await refresh()
            setSelected(saved.id)
            setEditing(null)
          }}
        />
      )}

      {seasons.length === 0 ? (
        <p className="mt-6 rounded-lg border border-border bg-surface px-4 py-6 text-center font-body text-sm text-muted">
          No seasons yet. Create one, give it a registration window, and you will get a link to
          share.
        </p>
      ) : (
        <>
          <div className="mt-6 flex flex-wrap gap-2">
            {seasons.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setSelected(s.id)}
                className={`rounded-full border px-4 py-2 font-body text-sm transition ${
                  selected === s.id
                    ? 'border-accent bg-accent/15 text-ink'
                    : 'border-border text-muted hover:border-accent hover:text-ink'
                }`}
              >
                {s.name}
              </button>
            ))}
          </div>

          {season && (
            <SeasonDetail
              key={season.id}
              season={season}
              onEdit={() => setEditing(season)}
              onChanged={refresh}
            />
          )}
        </>
      )}
    </div>
  )
}

function Heading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-display text-2xl font-bold uppercase tracking-tight text-ink">{children}</h2>
  )
}

// ------------------------------------------------------------ season form --

function SeasonForm({
  programId,
  season,
  onClose,
  onSaved,
}: {
  programId: string
  season: Season | null
  onClose: () => void
  onSaved: (season: Season) => Promise<void>
}) {
  const [name, setName] = useState(season?.name ?? '')
  const [startsOn, setStartsOn] = useState(season?.starts_on ?? '')
  const [endsOn, setEndsOn] = useState(season?.ends_on ?? '')
  const [opensAt, setOpensAt] = useState(toLocal(season?.registration_opens_at))
  const [closesAt, setClosesAt] = useState(toLocal(season?.registration_closes_at))
  const [capacity, setCapacity] = useState(season?.capacity?.toString() ?? '')
  const [minAge, setMinAge] = useState(season?.min_age?.toString() ?? '')
  const [maxAge, setMaxAge] = useState(season?.max_age?.toString() ?? '')
  const [ageAsOf, setAgeAsOf] = useState(season?.age_as_of ?? '')
  const [fee, setFee] = useState(
    season?.fee_cents != null ? (season.fee_cents / 100).toFixed(2) : '',
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function handleSave(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    const result = await saveSeason(programId, {
      id: season?.id,
      name,
      starts_on: startsOn || null,
      ends_on: endsOn || null,
      registration_opens_at: opensAt ? new Date(opensAt).toISOString() : null,
      registration_closes_at: closesAt ? new Date(closesAt).toISOString() : null,
      capacity: capacity ? Number(capacity) : null,
      min_age: minAge ? Number(minAge) : null,
      max_age: maxAge ? Number(maxAge) : null,
      age_as_of: ageAsOf || null,
      fee_cents: fee.trim() ? Math.round(Number(fee) * 100) : null,
    })
    setBusy(false)
    if (!result.ok || !result.season) {
      setError(result.message)
      return
    }
    await onSaved(result.season)
  }

  return (
    <form onSubmit={handleSave} className="mt-6 rounded-xl border border-border bg-surface px-5 py-6">
      <div className="flex items-baseline justify-between gap-4">
        <h3 className="font-display text-base font-semibold uppercase tracking-wide text-ink">
          {season ? 'Edit season' : 'New season'}
        </h3>
        <button
          type="button"
          onClick={onClose}
          className="font-body text-xs uppercase tracking-wider text-muted transition hover:text-ink"
        >
          Close
        </button>
      </div>

      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        <Field label="Season name" name="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Fall 2026" required />
        <Field label="Places (optional)" name="capacity" type="number" min={1} value={capacity} onChange={(e) => setCapacity(e.target.value)} placeholder="Leave blank for no limit" hint="Anyone after this joins the waiting list." />
        <Field label="Season starts" name="startsOn" type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />
        <Field label="Season ends" name="endsOn" type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />
        <Field label="Registration opens" name="opensAt" type="datetime-local" value={opensAt} onChange={(e) => setOpensAt(e.target.value)} hint="Setting both windows publishes the link." />
        <Field label="Registration closes" name="closesAt" type="datetime-local" value={closesAt} onChange={(e) => setClosesAt(e.target.value)} />
        <Field label="Youngest age" name="minAge" type="number" min={0} value={minAge} onChange={(e) => setMinAge(e.target.value)} placeholder="Any" />
        <Field label="Oldest age" name="maxAge" type="number" min={0} value={maxAge} onChange={(e) => setMaxAge(e.target.value)} placeholder="Any" />
        <Field label="Ages measured on" name="ageAsOf" type="date" value={ageAsOf} onChange={(e) => setAgeAsOf(e.target.value)} hint="Defaults to the season start." />
        <Field label="Registration fee" name="fee" type="number" min={0} step="0.01" value={fee} onChange={(e) => setFee(e.target.value)} placeholder="Leave blank for free" hint="Charged when a family signs up. Needs Stripe connected." />
      </div>

      <div className="mt-4"><ErrorNote>{error}</ErrorNote></div>

      <div className="mt-5">
        <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save Season'}</Button>
      </div>
    </form>
  )
}

/** datetime-local wants "YYYY-MM-DDTHH:mm" in local time, not an ISO string. */
function toLocal(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// ---------------------------------------------------------- season detail --

function SeasonDetail({
  season,
  onEdit,
  onChanged,
}: {
  season: Season
  onEdit: () => void
  onChanged: () => Promise<void>
}) {
  const [questions, setQuestions] = useState<SeasonQuestion[]>([])
  const [registrations, setRegistrations] = useState<Registration[]>([])
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    const [q, r] = await Promise.all([loadQuestions(season.id), loadRegistrations(season.id)])
    setQuestions(q)
    setRegistrations(r)
  }, [season.id])

  useEffect(() => {
    let active = true
    ;(async () => {
      const [q, r] = await Promise.all([loadQuestions(season.id), loadRegistrations(season.id)])
      if (!active) return
      setQuestions(q)
      setRegistrations(r)
    })()
    return () => {
      active = false
    }
  }, [season.id])

  const published = !!season.registration_opens_at && !!season.registration_closes_at
  const link = `${window.location.origin}/register/${season.public_token}`
  const confirmed = registrations.filter((r) => r.status === 'confirmed')
  const waiting = registrations.filter((r) => r.status === 'waitlisted')
  const bracket = bracketLabel(season)

  return (
    <div className="mt-8 space-y-8">
      <section className="rounded-xl border border-border bg-surface px-5 py-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h3 className="font-display text-lg font-semibold uppercase tracking-wide text-ink">
            {season.name}
          </h3>
          <button type="button" onClick={onEdit} className="font-body text-xs uppercase tracking-wider text-muted underline underline-offset-4 transition hover:text-accent">
            Edit
          </button>
        </div>
        <p className="mt-2 font-body text-sm text-muted">
          {longDate(season.starts_on)} – {longDate(season.ends_on)}
          {bracket && <> · {bracket}</>}
          {season.capacity !== null && <> · {confirmed.length} of {season.capacity} places filled</>}
        </p>

        {published ? (
          <div className="mt-4">
            <p className="font-body text-[0.7rem] font-medium uppercase tracking-[0.22em] text-muted">
              Share this link
            </p>
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(link)
                  setCopied(true)
                  setTimeout(() => setCopied(false), 2000)
                } catch {
                  setError('Could not copy. Select the link and copy it by hand.')
                }
              }}
              className="mt-2 block w-full break-all rounded-lg border border-accent/50 bg-bg px-4 py-3 text-left font-mono text-xs text-accent transition hover:border-accent"
            >
              {link}
            </button>
            <p className="mt-2 font-body text-xs text-muted">
              {copied ? 'Copied.' : `Open ${longDate(season.registration_opens_at)} – ${longDate(season.registration_closes_at)}.`}
            </p>
          </div>
        ) : (
          <p className="mt-4 rounded-lg border border-dashed border-border px-4 py-3 font-body text-sm text-muted">
            Not published. Add a registration opens and closes date to get a shareable link.
          </p>
        )}
        <ErrorNote>{error}</ErrorNote>
      </section>

      <QuestionEditor seasonId={season.id} questions={questions} onChanged={refresh} />

      <section>
        <h3 className="font-body text-xs font-medium uppercase tracking-[0.22em] text-muted">
          Registered <span className="ml-2 text-muted/60">{confirmed.length}</span>
        </h3>
        <RegistrationList rows={confirmed} onChanged={async () => { await refresh(); await onChanged() }} />

        {waiting.length > 0 && (
          <>
            <h3 className="mt-8 font-body text-xs font-medium uppercase tracking-[0.22em] text-muted">
              Waiting list <span className="ml-2 text-muted/60">{waiting.length}</span>
            </h3>
            <RegistrationList rows={waiting} waitlist onChanged={async () => { await refresh(); await onChanged() }} />
          </>
        )}
      </section>
    </div>
  )
}

function RegistrationList({
  rows,
  waitlist = false,
  onChanged,
}: {
  rows: Registration[]
  waitlist?: boolean
  onChanged: () => Promise<void>
}) {
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')

  if (rows.length === 0) {
    return <p className="mt-3 font-body text-sm text-muted/70">Nobody yet.</p>
  }

  async function act(id: string, action: 'confirm' | 'withdraw') {
    setBusy(id)
    setError('')
    const result = action === 'confirm' ? await confirmRegistration(id) : await withdrawRegistration(id)
    setBusy(null)
    if (!result.ok) setError(result.message)
    else await onChanged()
  }

  return (
    <>
      <ul className="mt-3 divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
        {rows.map((row, index) => (
          <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5">
            <span className="font-body text-base text-ink">
              {waitlist && (
                <span className="mr-2 font-mono text-xs text-muted">#{index + 1}</span>
              )}
              {row.people?.full_name ?? 'Someone'}
            </span>
            <span className="flex items-center gap-3">
              {waitlist && (
                <button type="button" disabled={busy === row.id} onClick={() => act(row.id, 'confirm')} className="font-body text-xs uppercase tracking-wider text-accent underline underline-offset-4 transition hover:brightness-125 disabled:opacity-50">
                  {busy === row.id ? 'Working…' : 'Give a place'}
                </button>
              )}
              <button type="button" disabled={busy === row.id} onClick={() => act(row.id, 'withdraw')} className="font-body text-xs uppercase tracking-wider text-muted underline underline-offset-4 transition hover:text-ink disabled:opacity-50">
                Withdraw
              </button>
            </span>
          </li>
        ))}
      </ul>
      <ErrorNote>{error}</ErrorNote>
    </>
  )
}

// -------------------------------------------------------- question editor --

function QuestionEditor({
  seasonId,
  questions,
  onChanged,
}: {
  seasonId: string
  questions: SeasonQuestion[]
  onChanged: () => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [prompt, setPrompt] = useState('')
  const [kind, setKind] = useState<SeasonQuestion['kind']>('text')
  const [options, setOptions] = useState('')
  const [required, setRequired] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function add() {
    setBusy(true)
    setError('')
    const result = await addQuestion(
      seasonId,
      {
        prompt,
        kind,
        options: options.split(',').map((o) => o.trim()).filter(Boolean),
        required,
      },
      questions.length,
    )
    setBusy(false)
    if (!result.ok) { setError(result.message); return }
    setPrompt(''); setOptions(''); setRequired(false); setKind('text'); setOpen(false)
    await onChanged()
  }

  return (
    <section>
      <div className="flex items-baseline justify-between gap-4">
        <h3 className="font-body text-xs font-medium uppercase tracking-[0.22em] text-muted">
          Questions asked <span className="ml-2 text-muted/60">{questions.length}</span>
        </h3>
        <button type="button" onClick={() => setOpen(!open)} className="font-body text-xs uppercase tracking-wider text-muted underline underline-offset-4 transition hover:text-accent">
          {open ? 'Close' : '+ Add a question'}
        </button>
      </div>

      {open && (
        <div className="mt-3 rounded-xl border border-border bg-surface px-5 py-5">
          <Field label="Question" name="prompt" value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="What size shirt does your player wear?" />
          <div className="mt-4 flex flex-wrap gap-2">
            {(['text', 'boolean', 'choice'] as const).map((k) => (
              <button key={k} type="button" onClick={() => setKind(k)} className={`rounded-lg border px-4 py-2 font-body text-sm transition ${kind === k ? 'border-accent bg-accent/15 text-ink' : 'border-border text-muted hover:border-accent hover:text-ink'}`}>
                {k === 'text' ? 'Written answer' : k === 'boolean' ? 'Yes / no' : 'Pick one'}
              </button>
            ))}
          </div>
          {kind === 'choice' && (
            <div className="mt-4">
              <Field label="Choices" name="options" value={options} onChange={(e) => setOptions(e.target.value)} placeholder="Small, Medium, Large" hint="Separate them with commas. At least two." />
            </div>
          )}
          <label className="mt-4 flex items-center gap-3 font-body text-sm text-muted">
            <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} className="h-4 w-4 accent-accent" />
            Must be answered
          </label>
          <div className="mt-4"><ErrorNote>{error}</ErrorNote></div>
          <div className="mt-4">
            <Button onClick={add} disabled={busy || !prompt.trim()}>{busy ? 'Adding…' : 'Add Question'}</Button>
          </div>
        </div>
      )}

      {questions.length > 0 && (
        <ul className="mt-3 divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
          {questions.map((q) => (
            <li key={q.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="font-body text-sm text-ink">
                {q.prompt}
                {q.required && <span className="ml-2 text-accent">*</span>}
                <span className="ml-2 font-mono text-[0.7rem] uppercase tracking-wider text-muted">
                  {q.kind === 'choice' ? q.options.join(' / ') : q.kind === 'boolean' ? 'yes / no' : 'written'}
                </span>
              </span>
              <button type="button" onClick={async () => { await deleteQuestion(q.id); await onChanged() }} className="font-body text-xs uppercase tracking-wider text-muted underline underline-offset-4 transition hover:text-ink">
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
