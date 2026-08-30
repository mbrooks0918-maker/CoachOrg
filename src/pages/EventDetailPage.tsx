import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { EventChecklist } from '../components/EventChecklist'
import { MemberPicker } from '../components/MemberPicker'
import { Button, ErrorNote } from '../components/ui'
import { useProgram } from '../lib/programContext'
import { ROLE_LABEL, isStaff, type Member } from '../lib/roster'
import {
  assignVolunteer,
  deleteEvent,
  formatEventTime,
  getEvent,
  loadEventDetail,
  removeVolunteer,
  type EventRow,
  type ListItem,
  type Volunteer,
} from '../lib/gameday'

export default function EventDetailPage() {
  const { eventId } = useParams<{ eventId: string }>()
  const { program, role, memberId, userId } = useProgram()
  const navigate = useNavigate()
  const staff = isStaff(role)

  const [event, setEvent] = useState<EventRow | null>(null)
  const [todo, setTodo] = useState<ListItem[]>([])
  const [equipment, setEquipment] = useState<ListItem[]>([])
  const [volunteers, setVolunteers] = useState<Volunteer[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!eventId) return
    let active = true
    ;(async () => {
      const { event, error } = await getEvent(eventId)
      if (!active) return
      if (error || !event) {
        setError(error ?? 'Event not found.')
        setLoading(false)
        return
      }
      setEvent(event)
      const detail = await loadEventDetail(eventId, program.id)
      if (!active) return
      setTodo(detail.todo)
      setEquipment(detail.equipment)
      setVolunteers(detail.volunteers)
      setMembers(detail.members)
      setLoading(false)
    })()
    return () => {
      active = false
    }
  }, [eventId, program.id])

  if (loading) return <p className="font-body text-muted">Loading…</p>
  if (!event) {
    return (
      <div>
        <BackLink />
        <ErrorNote>{error || 'Event not found.'}</ErrorNote>
      </div>
    )
  }

  const myJobs = volunteers.filter((v) => v.member_id === memberId)

  async function handleDeleteEvent() {
    if (!eventId) return
    const result = await deleteEvent(eventId)
    if (!result.ok) {
      setError(result.message)
      return
    }
    navigate(`/program/${program.id}/game-day`, { replace: true })
  }

  return (
    <div>
      <BackLink />

      <h2 className="mt-4 font-display text-3xl font-bold uppercase tracking-tight text-ink">
        {event.name}
      </h2>
      <p className="mt-2 font-mono text-xs uppercase tracking-[0.2em] text-accent">
        {formatEventTime(event.starts_at)}
      </p>

      <div className="mt-3 space-y-1 font-body text-sm text-muted">
        {event.opponent && <p>vs {event.opponent}</p>}
        {event.location && <p>{event.location}</p>}
      </div>

      {event.notes && (
        <p className="mt-4 rounded-xl border border-border bg-surface px-4 py-3 font-body text-sm text-ink">
          {event.notes}
        </p>
      )}

      {/* Your own jobs first -- it is the one thing a parent opens this for. */}
      {myJobs.length > 0 && (
        <div className="mt-6 rounded-xl border-2 border-accent bg-surface px-5 py-4 shadow-[0_0_60px_-28px] shadow-accent">
          <p className="font-body text-[0.7rem] font-medium uppercase tracking-[0.3em] text-muted">
            Your job at this event
          </p>
          <p className="mt-2 font-display text-lg font-semibold uppercase tracking-wide text-ink">
            {myJobs.map((j) => j.role_label).join(' · ')}
          </p>
        </div>
      )}

      <ErrorNote>{error}</ErrorNote>

      <EventChecklist
        kind="todo"
        title="To-do list"
        blurb="What has to happen before kickoff."
        addPlaceholder="Add something to do"
        items={todo}
        setItems={setTodo}
        members={members}
        eventId={event.id}
        programId={program.id}
        staff={staff}
        memberId={memberId}
        userId={userId}
      />

      <EventChecklist
        kind="equipment"
        title="What to bring"
        blurb="Kit needed for this game. This is a packing list, not the equipment inventory."
        addPlaceholder="Add something to bring"
        items={equipment}
        setItems={setEquipment}
        members={members}
        eventId={event.id}
        programId={program.id}
        staff={staff}
        memberId={memberId}
        userId={userId}
      />

      <Volunteers
        volunteers={volunteers}
        setVolunteers={setVolunteers}
        members={members}
        eventId={event.id}
        programId={program.id}
        staff={staff}
        memberId={memberId}
      />

      {staff && (
        <div className="mt-14 border-t border-border pt-6">
          <button
            type="button"
            onClick={handleDeleteEvent}
            className="font-body text-sm text-muted underline underline-offset-4 transition hover:text-accent"
          >
            Delete this event
          </button>
          <p className="mt-1 font-body text-xs text-muted/70">
            Removes its lists and volunteer assignments too.
          </p>
        </div>
      )}
    </div>
  )
}

function BackLink() {
  return (
    <Link
      to=".."
      relative="path"
      className="font-body text-sm text-muted underline underline-offset-4 transition hover:text-ink"
    >
      ← All events
    </Link>
  )
}

function Volunteers({
  volunteers,
  setVolunteers,
  members,
  eventId,
  programId,
  staff,
  memberId,
}: {
  volunteers: Volunteer[]
  setVolunteers: (updater: (current: Volunteer[]) => Volunteer[]) => void
  members: Member[]
  eventId: string
  programId: string
  staff: boolean
  memberId: string | null
}) {
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [roleLabel, setRoleLabel] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const byId = new Map(members.map((m) => [m.id, m]))
  // Staff and family are who actually work a game day; players are not offered.
  const helpers = members.filter((m) => m.role !== 'player')

  async function handleAssign() {
    if (!selected) return
    setBusy(true)
    setError('')
    const result = await assignVolunteer({ eventId, programId, memberId: selected, roleLabel })
    setBusy(false)
    if (!result.ok || !result.volunteer) {
      setError(result.message)
      return
    }
    const added = result.volunteer
    setVolunteers((current) => [...current, added])
    setSelected(null)
    setRoleLabel('')
    setOpen(false)
  }

  async function handleRemove(volunteer: Volunteer) {
    setError('')
    const result = await removeVolunteer(volunteer.id)
    if (!result.ok) {
      setError(result.message)
      return
    }
    setVolunteers((current) => current.filter((v) => v.id !== volunteer.id))
  }

  return (
    <section className="mt-12">
      <div className="flex items-baseline justify-between gap-4">
        <h3 className="font-display text-xl font-semibold uppercase tracking-wide text-ink">
          Volunteers
        </h3>
        {volunteers.length > 0 && (
          <span className="font-mono text-xs uppercase tracking-wider text-muted">
            {volunteers.length} assigned
          </span>
        )}
      </div>
      <p className="mt-2 font-body text-sm text-muted">Who is working this game.</p>

      {volunteers.length === 0 ? (
        <p className="mt-4 rounded-xl border border-border bg-surface px-4 py-5 font-body text-sm text-muted">
          Nobody assigned yet.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
          {volunteers.map((v) => {
            const person = byId.get(v.member_id)
            return (
              <li key={v.id} className="flex items-center justify-between gap-3 px-4 py-3.5">
                <div className="min-w-0">
                  <p className="font-body text-base font-medium text-ink">
                    {person?.display_name ?? 'Someone'}
                    {v.member_id === memberId && (
                      <span className="ml-2 font-body text-xs text-accent">(you)</span>
                    )}
                  </p>
                  <p className="mt-0.5 font-body text-sm text-muted">
                    {v.role_label}
                    {person && (
                      <span className="text-muted/60"> · {ROLE_LABEL[person.role] ?? person.role}</span>
                    )}
                  </p>
                </div>
                {staff && (
                  <button
                    type="button"
                    onClick={() => handleRemove(v)}
                    aria-label={`Remove ${person?.display_name ?? 'assignment'}`}
                    className="shrink-0 font-body text-sm text-muted transition hover:text-accent"
                  >
                    ×
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {error && <div className="mt-3"><ErrorNote>{error}</ErrorNote></div>}

      {staff &&
        (open ? (
          <div className="mt-4 rounded-xl border border-border bg-surface px-5 py-5">
            <div className="flex items-baseline justify-between gap-4">
              <h4 className="font-display text-base font-semibold uppercase tracking-wide text-ink">
                Assign a job
              </h4>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="font-body text-xs uppercase tracking-wider text-muted transition hover:text-ink"
              >
                Close
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <MemberPicker
                label="Person"
                members={helpers}
                selectedIds={selected ? [selected] : []}
                onToggle={(id) => setSelected((c) => (c === id ? null : id))}
                emptyText="No staff or family on the roster yet."
              />

              <label htmlFor="volunteer-role" className="block">
                <span className="font-body text-xs font-medium uppercase tracking-[0.18em] text-muted">
                  Job
                </span>
                <input
                  id="volunteer-role"
                  value={roleLabel}
                  onChange={(e) => setRoleLabel(e.target.value)}
                  placeholder="Chain gang"
                  maxLength={60}
                  className="mt-2 w-full rounded-lg border border-border bg-bg px-4 py-2.5 font-body text-base text-ink placeholder:text-muted/60 transition focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/40"
                />
              </label>

              <div className="flex flex-wrap gap-2">
                {['Chain gang', 'Concessions', 'Team parent', 'Scorebook', 'Gate'].map((job) => (
                  <button
                    key={job}
                    type="button"
                    onClick={() => setRoleLabel(job)}
                    className="rounded-full border border-border px-3 py-1.5 font-body text-xs text-muted transition hover:border-accent hover:text-ink"
                  >
                    {job}
                  </button>
                ))}
              </div>

              <Button onClick={handleAssign} disabled={busy || !selected || !roleLabel.trim()}>
                {busy ? 'Assigning…' : 'Assign'}
              </Button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="mt-4 w-full rounded-xl border border-dashed border-border px-5 py-4 font-body text-sm text-muted transition hover:border-accent hover:text-ink"
          >
            + Assign someone a job
          </button>
        ))}
    </section>
  )
}
