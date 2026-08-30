import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, ErrorNote, Field, TextArea } from '../components/ui'
import { useProgram } from '../lib/programContext'
import { isStaff } from '../lib/roster'
import {
  createEvent,
  defaultKickoff,
  formatEventTime,
  isUpcoming,
  listEvents,
  myAssignments,
  type EventRow,
  type Volunteer,
} from '../lib/gameday'

export default function GameDayPage() {
  const { program, role, memberId } = useProgram()
  const staff = isStaff(role)

  const [events, setEvents] = useState<EventRow[]>([])
  const [mine, setMine] = useState<Volunteer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    ;(async () => {
      const [{ events, error }, assignments] = await Promise.all([
        listEvents(program.id),
        myAssignments(program.id, memberId),
      ])
      if (!active) return
      setEvents(events)
      setMine(assignments)
      if (error) setError(error)
      setLoading(false)
    })()
    return () => {
      active = false
    }
  }, [program.id, memberId])

  if (loading) return <p className="font-body text-muted">Loading…</p>

  const upcoming = events.filter(isUpcoming)
  // Most recent first: a coach looking back wants last Friday, not the opener.
  const past = events.filter((e) => !isUpcoming(e)).reverse()
  const myRoles = new Map<string, string[]>()
  for (const v of mine) myRoles.set(v.event_id, [...(myRoles.get(v.event_id) ?? []), v.role_label])

  return (
    <div>
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="font-display text-2xl font-bold uppercase tracking-tight text-ink">
          Game Day
        </h2>
        <span className="font-body text-sm text-muted">
          {events.length} {events.length === 1 ? 'event' : 'events'}
        </span>
      </div>
      <p className="mt-2 font-body text-sm text-muted">
        Every game gets its own to-do list, kit list and volunteer jobs.
      </p>

      <ErrorNote>{error}</ErrorNote>

      {staff && <NewEventForm programId={program.id} onCreated={(e) => setEvents((c) => [...c, e].sort((a, b) => a.starts_at.localeCompare(b.starts_at)))} />}

      <EventList title="Upcoming" events={upcoming} myRoles={myRoles} empty={staff ? 'Nothing scheduled yet. Add your first game above.' : 'No games scheduled yet.'} />
      {past.length > 0 && <EventList title="Past" events={past} myRoles={myRoles} empty="" />}
    </div>
  )
}

function EventList({
  title,
  events,
  myRoles,
  empty,
}: {
  title: string
  events: EventRow[]
  myRoles: Map<string, string[]>
  empty: string
}) {
  return (
    <section className="mt-10">
      <h3 className="font-body text-xs font-medium uppercase tracking-[0.22em] text-muted">
        {title}
        <span className="ml-2 text-muted/60">{events.length}</span>
      </h3>

      {events.length === 0 ? (
        <p className="mt-3 font-body text-sm text-muted/70">{empty}</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {events.map((event) => {
            const roles = myRoles.get(event.id)
            return (
              <li key={event.id}>
                <Link
                  to={event.id}
                  className="block rounded-xl border border-border bg-surface px-5 py-4 transition hover:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-display text-lg font-semibold uppercase tracking-wide text-ink">
                      {event.name}
                    </span>
                    {event.opponent && (
                      <span className="shrink-0 font-body text-sm text-muted">
                        vs {event.opponent}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 font-mono text-[0.7rem] uppercase tracking-wider text-accent">
                    {formatEventTime(event.starts_at)}
                  </p>
                  {event.location && (
                    <p className="mt-1 font-body text-sm text-muted">{event.location}</p>
                  )}
                  {roles && roles.length > 0 && (
                    <p className="mt-2.5 inline-flex rounded-full border border-accent/40 bg-accent/10 px-2.5 py-0.5 font-body text-xs text-ink">
                      You: {roles.join(', ')}
                    </p>
                  )}
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

function NewEventForm({
  programId,
  onCreated,
}: {
  programId: string
  onCreated: (event: EventRow) => void
}) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [startsAt, setStartsAt] = useState(defaultKickoff)
  const [location, setLocation] = useState('')
  const [opponent, setOpponent] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    const result = await createEvent({
      programId,
      name,
      startsAtLocal: startsAt,
      location,
      opponent,
      notes,
    })
    setBusy(false)
    if (!result.ok || !result.event) {
      setError(result.message)
      return
    }
    onCreated(result.event)
    setName('')
    setLocation('')
    setOpponent('')
    setNotes('')
    setStartsAt(defaultKickoff())
    setOpen(false)
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-6 w-full rounded-xl border border-dashed border-border px-5 py-4 font-body text-sm text-muted transition hover:border-accent hover:text-ink"
      >
        + New event
      </button>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-5 rounded-xl border border-border bg-surface px-5 py-6">
      <div className="flex items-baseline justify-between gap-4">
        <h3 className="font-display text-base font-semibold uppercase tracking-wide text-ink">
          New event
        </h3>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="font-body text-xs uppercase tracking-wider text-muted transition hover:text-ink"
        >
          Close
        </button>
      </div>

      <Field label="Name" name="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Week 3 — Home" maxLength={80} required />
      <Field label="Date and time" name="startsAt" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} required />
      <Field label="Opponent" name="opponent" value={opponent} onChange={(e) => setOpponent(e.target.value)} placeholder="Optional" maxLength={60} />
      <Field label="Location" name="location" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Aggie Stadium" maxLength={80} />
      <TextArea label="Notes" name="notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional. Anything the team should know." maxLength={400} />

      <ErrorNote>{error}</ErrorNote>

      <Button type="submit" disabled={busy}>
        {busy ? 'Creating…' : 'Create Event'}
      </Button>
    </form>
  )
}
