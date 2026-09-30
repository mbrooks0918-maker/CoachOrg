import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { byDay, eventWhen, type OrgEvent, type OrgProgram } from '../lib/orgOverview'

/**
 * The furniture both overview screens are built from.
 *
 * Organization Overview and Program Overview are the same idea at two scopes
 * -- a director's park and a Program Admin's sport -- so they are the same
 * furniture over different totals. Shared rather than copied so the two cannot
 * drift into looking like different products.
 */

export function Shell({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-svh px-6 py-14">
      <div className="mx-auto w-full max-w-3xl">{children}</div>
    </main>
  )
}

export function Section({
  title,
  count,
  children,
}: {
  title: string
  count?: number
  children: ReactNode
}) {
  return (
    <section className="mt-12">
      <h2 className="font-display text-xl font-semibold uppercase tracking-wide text-ink">
        {title}
        {count !== undefined && <span className="ml-3 text-base text-muted/60">{count}</span>}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  )
}

export function Stat({
  label,
  value,
  note,
  urgent = false,
}: {
  label: string
  value: number
  note?: string
  urgent?: boolean
}) {
  return (
    <div
      className={`rounded-xl border bg-surface px-4 py-4 ${
        urgent ? 'border-accent' : 'border-border'
      }`}
    >
      <p className="font-body text-[0.65rem] font-medium uppercase tracking-[0.2em] text-muted">
        {label}
      </p>
      <p
        className={`mt-2 font-display text-3xl font-bold tabular-nums ${
          urgent ? 'text-accent' : 'text-ink'
        }`}
      >
        {value}
      </p>
      {note && <p className="mt-1 font-body text-xs text-muted">{note}</p>}
    </div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-lg border border-border bg-surface px-4 py-6 text-center font-body text-sm text-muted">
      {children}
    </p>
  )
}

export function ProgramCard({ program }: { program: OrgProgram }) {
  const season = program.season
  const full = season?.spots_remaining === 0

  return (
    <Link
      to={`/program/${program.id}`}
      className="group flex flex-col justify-between rounded-xl border border-border bg-surface px-5 py-5 transition hover:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      <div>
        <p className="font-display text-base font-semibold uppercase tracking-wide text-ink transition group-hover:text-accent sm:text-lg">
          {program.name}
        </p>
        <p className="mt-1 font-body text-xs uppercase tracking-wider text-muted">
          {program.sport}
          {season && <> · {season.name}</>}
        </p>
      </div>

      <div className="mt-4 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="font-body text-sm text-ink">
          <span className="font-display text-xl font-bold tabular-nums">{program.confirmed}</span>{' '}
          confirmed
        </span>
        {program.waitlisted > 0 && (
          <span className="font-body text-sm text-accent">
            <span className="font-display text-xl font-bold tabular-nums">
              {program.waitlisted}
            </span>{' '}
            waiting
          </span>
        )}
      </div>

      {season && (
        <p className="mt-3 font-mono text-[0.7rem] uppercase tracking-wider text-muted">
          {season.capacity === null
            ? 'No place limit'
            : full
              ? `Full at ${season.capacity}`
              : `${season.spots_remaining} of ${season.capacity} places left`}
          {' · '}
          {season.open_now ? 'Sign-ups open' : 'Sign-ups closed'}
        </p>
      )}
    </Link>
  )
}

/** Every fixture in scope, grouped under the day it falls on. */
export function EventList({ events, emptyLine }: { events: OrgEvent[]; emptyLine: string }) {
  if (events.length === 0) return <Empty>{emptyLine}</Empty>

  return (
    <div className="space-y-6">
      {byDay(events).map(({ day, events }) => (
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
                <p className="mt-1 font-body text-sm text-muted">
                  {event.program_name}
                  {event.location && <> · {event.location}</>}
                </p>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}
