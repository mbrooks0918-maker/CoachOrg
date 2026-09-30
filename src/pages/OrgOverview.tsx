import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { PaymentsPanel } from '../components/PaymentsPanel'
import { TopBar } from '../components/ui'
import { byDay, eventWhen, loadOrgOverview, type OrgOverview as Overview } from '../lib/orgOverview'
import { Empty, ProgramCard, Section, Shell, Stat } from '../components/overview'

/**
 * What the person running the park sees, as opposed to what a coach sees.
 *
 * Deliberately a snapshot and not a control panel: numbers, what is coming up
 * across every team on one list, and a way into each program. Anything that
 * changes something lives in the program it belongs to, because that is where
 * the person doing it has the context to do it safely.
 */
export default function OrgOverview() {
  const { organizationId = '' } = useParams<{ organizationId: string }>()
  const [overview, setOverview] = useState<Overview | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    ;(async () => {
      const { overview, error } = await loadOrgOverview(organizationId)
      if (!active) return
      if (error) setError(error)
      else setOverview(overview ?? null)
      setLoading(false)
    })()
    return () => {
      active = false
    }
  }, [organizationId])

  if (loading) {
    return (
      <Shell>
        <p className="font-body text-muted">Loading…</p>
      </Shell>
    )
  }

  if (error || !overview) {
    return (
      <Shell>
        <TopBar />
        <h1 className="font-display text-3xl font-bold uppercase tracking-tight text-ink">
          Not your overview
        </h1>
        <p className="mt-3 max-w-md font-body text-base text-muted">{error}</p>
        <Link
          to="/"
          className="mt-8 inline-block font-body text-sm text-accent underline underline-offset-4"
        >
          Back to your team
        </Link>
      </Shell>
    )
  }

  const { totals, programs, upcoming_events: events, equipment } = overview
  const days = byDay(events)

  return (
    <Shell>
      <TopBar />
      <p className="font-body text-xs font-medium uppercase tracking-[0.3em] text-muted">
        Overview
      </p>
      <h1 className="mt-4 font-display text-4xl font-bold uppercase leading-[1.05] tracking-tight text-ink sm:text-5xl">
        {overview.organization.name}
      </h1>
      <p className="mt-3 font-body text-base text-muted">
        Every program in one place. Your coaches see only their own.
      </p>

      {/* The headline pair: a child playing two sports is one child and two
          sign-ups, and both numbers matter to whoever is ordering shirts. */}
      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Children" value={totals.children} note={`${totals.signups} sign-ups`} />
        <Stat label="Confirmed" value={totals.confirmed} />
        <Stat
          label="Waiting"
          value={totals.waitlisted}
          note={totals.waitlisted > 0 ? 'needs a decision' : 'nobody waiting'}
          urgent={totals.waitlisted > 0}
        />
        <Stat label="Families" value={totals.families} note={`${totals.programs} programs`} />
      </div>

      {/* ---------------------------------------------------------- programs */}
      <Section title="Programs" count={programs.length}>
        <div className="grid gap-4 sm:grid-cols-2">
          {programs.map((program) => (
            <ProgramCard key={program.id} program={program} />
          ))}
        </div>
      </Section>

      {/* ------------------------------------------------------------ events */}
      <Section title="What is coming up" count={events.length}>
        {events.length === 0 ? (
          <Empty>Nothing scheduled across any program.</Empty>
        ) : (
          <div className="space-y-6">
            {days.map(({ day, events }) => (
              <div key={day}>
                <p className="font-body text-xs font-medium uppercase tracking-[0.22em] text-muted">
                  {day}
                </p>
                <ul className="mt-2 divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
                  {events.map((event) => (
                    <li key={event.id} className="px-4 py-3.5">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                        <Link
                          to={`/program/${event.program_id}/game-day/${event.id}`}
                          className="font-body text-base font-medium text-ink underline-offset-4 hover:underline"
                        >
                          {event.name}
                        </Link>
                        <span className="font-mono text-[0.7rem] uppercase tracking-wider text-accent">
                          {eventWhen(event.starts_at)}
                        </span>
                      </div>
                      <p className="mt-1 font-body text-xs text-muted">
                        {event.program_name}
                        {event.location && <> · {event.location}</>}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* ---------------------------------------------------------- payments */}
      <PaymentsPanel organizationId={overview.organization.id} />

      {/* --------------------------------------------------------- equipment */}
      <Section title="Equipment">
        <div className="grid grid-cols-3 gap-4">
          <Stat label="Kinds of item" value={equipment.items} />
          <Stat label="Total pieces" value={equipment.total_quantity} />
          <Stat
            label="Out on loan"
            value={equipment.checked_out}
            note={equipment.checked_out > 0 ? 'with players' : 'all in the cupboard'}
          />
        </div>
      </Section>
    </Shell>
  )
}
