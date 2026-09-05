import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { visibleNav } from '../lib/navSections'
import { useProgram } from '../lib/programContext'
import { ROLE_LABEL, isStaff } from '../lib/roster'
import { loadHomeSummary, plural, shortDate, type HomeSummary } from '../lib/programHome'

/**
 * The screen you land on after logging in.
 *
 * Four tiles, one per section, in the same order as the tab bar. Each carries
 * a line describing what that person will find behind it -- which differs by
 * role, because the sections themselves differ by role. No new views: every
 * tile is a link to a screen that already exists.
 */
export default function ProgramHome() {
  const { program, role, memberId, features, orgLeader } = useProgram()
  const staff = isStaff(role)

  const [summary, setSummary] = useState<HomeSummary | null>(null)

  useEffect(() => {
    let active = true
    ;(async () => {
      const result = await loadHomeSummary(program.id, memberId, staff)
      if (active) setSummary(result)
    })()
    return () => {
      active = false
    }
  }, [program.id, memberId, staff])

  // Each tile gets a headline and a subtitle. Staff and roster differ because
  // what is behind the tile differs; the wording follows the section.
  function describe(section: string): { title: string; line: string } {
    if (!summary) return { title: '', line: '…' }

    switch (section) {
      case 'roster':
        return {
          title: 'Roster & Comms',
          line: plural(summary.memberCount, 'member', 'members'),
        }

      case 'tasks':
        return {
          title: 'Scheduled Tasks',
          line: staff
            ? summary.upcomingTasks > 0
              ? `${plural(summary.upcomingTasks, 'reminder', 'reminders')} queued`
              : 'Nothing scheduled'
            : summary.upcomingTasks > 0
              ? `${plural(summary.upcomingTasks, 'reminder', 'reminders')} coming`
              : 'Notification settings',
        }

      case 'equipment':
        return {
          title: staff ? 'Equipment' : 'My Gear',
          line: staff
            ? summary.equipmentCount > 0
              ? `${plural(summary.equipmentCount, 'item', 'items')} tracked`
              : 'Nothing logged yet'
            : summary.equipmentCount > 0
              ? `${plural(summary.equipmentCount, 'item', 'items')} checked out to you`
              : 'Nothing checked out',
        }

      case 'registration':
        return {
          title: 'Registration',
          line:
            summary.openSeasons > 0
              ? `${plural(summary.openSeasons, 'season', 'seasons')} open`
              : 'No sign-ups open',
        }

      case 'documents':
        return {
          title: 'Documents',
          line:
            summary.documentCount > 0
              ? `${plural(summary.documentCount, 'file', 'files')} shared`
              : staff
                ? 'Nothing uploaded yet'
                : 'Nothing shared yet',
        }

      case 'game-day':
      default:
        if (summary.myJobs.length > 0) {
          return { title: 'Game-Day Ops', line: `You: ${summary.myJobs.join(', ')}` }
        }
        return {
          title: 'Game-Day Ops',
          line: summary.nextEvent
            ? shortDate(summary.nextEvent.starts_at)
            : staff
              ? 'No games scheduled'
              : 'Nothing scheduled',
        }
    }
  }

  const sections = visibleNav(features)

  return (
    <div>
      <p className="font-body text-xs font-medium uppercase tracking-[0.3em] text-muted">
        {role ? (ROLE_LABEL[role] ?? role) : 'Welcome'}
      </p>
      <h2 className="mt-3 font-display text-3xl font-bold uppercase tracking-tight text-ink sm:text-4xl">
        {summary?.displayName ? `Hi, ${summary.displayName.split(' ')[0]}` : program.name}
      </h2>
      <p className="mt-2 font-body text-sm text-muted">
        {staff
          ? 'Everything for this team, in one place.'
          : 'Your team, and what you need from it.'}
      </p>

      {/* The way up. Only for whoever runs the organization; a coach of every
          team in the park still does not see it. Lives here as well as in the
          sidebar because the sidebar is desktop-only. */}
      {orgLeader && (
        <Link
          to={`/org/${program.organization_id}`}
          className="mt-6 flex items-center justify-between gap-4 rounded-xl border border-border bg-surface p-5 transition hover:border-accent hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <span>
            <span className="block font-body text-[0.65rem] font-medium uppercase tracking-[0.25em] text-muted">
              Every program
            </span>
            <span className="mt-1 block font-display text-base font-semibold uppercase tracking-wide text-ink">
              Organization overview
            </span>
          </span>
          <span aria-hidden="true" className="font-mono text-accent">
            →
          </span>
        </Link>
      )}

      {/* Two across even on a phone: four large targets without scrolling. */}
      <div className="mt-6 grid grid-cols-2 gap-4">
        {sections.map(({ to, Icon }, index) => {
          const { title, line } = describe(to)
          // With an odd number of sections the last tile takes the full row
          // rather than leaving a gap beside it.
          const wide = index === sections.length - 1 && sections.length % 2 === 1
          return (
            <Link
              key={to}
              to={to}
              className={`group flex min-h-36 flex-col justify-between rounded-xl border border-border bg-surface p-5 transition hover:border-accent hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg sm:min-h-40 ${wide ? 'col-span-2 min-h-28 sm:min-h-32' : ''}`}
            >
              {/* The icon sits in a chip rather than floating, which is what
                  ties the tiles to the empty states and keeps the top edge of
                  every card at the same optical weight. */}
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-raised text-muted transition group-hover:bg-accent/15 group-hover:text-accent">
                <Icon size={22} />
              </span>

              <span className="mt-5 block">
                <span className="block font-display text-base font-semibold uppercase leading-tight tracking-wide text-ink">
                  {title}
                </span>
                <span className="mt-1 block font-body text-sm text-muted">{line}</span>
              </span>
            </Link>
          )
        })}
      </div>

      {/* The one thing worth surfacing above a tap: what is next on the field. */}
      {summary?.nextEvent && (
        <Link
          to={`game-day/${summary.nextEvent.id}`}
          className="mt-4 block rounded-xl border border-accent/60 bg-surface p-5 transition hover:border-accent hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <p className="font-body text-[0.7rem] font-medium uppercase tracking-[0.3em] text-muted">
            Next up
          </p>
          <p className="mt-2 font-display text-lg font-semibold uppercase tracking-wide text-ink">
            {summary.nextEvent.name}
          </p>
          <p className="mt-1 font-mono text-[0.7rem] uppercase tracking-wider text-accent">
            {shortDate(summary.nextEvent.starts_at)}
          </p>
        </Link>
      )}
    </div>
  )
}
