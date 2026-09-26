import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { visibleNav } from '../lib/navSections'
import { useProgram } from '../lib/programContext'
import { ROLE_LABEL, isStaff } from '../lib/roster'
import { loadHomeSummary, plural, shortDate, type HomeSummary } from '../lib/programHome'
import { RESOURCE_COUNT } from '../lib/resources'

/**
 * The screen you land on after logging in.
 *
 * One tile per section, in the same order as the tab bar, each led by its
 * icon at full size with the name and a status line captioned underneath.
 * The status differs by role, because what is behind the tile differs by
 * role. No new views: every tile is a link to a screen that already exists.
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

      case 'resources':
        return {
          title: 'Resources',
          line: `${RESOURCE_COUNT} coaching links`,
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

  const sections = visibleNav(features, staff || orgLeader)

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

      {/* Two across even on a phone: six large targets without scrolling.

          The icon is the tile. It is what the eye lands on and what the thumb
          aims at, so it is drawn large and centred, with the section name and
          its status line reading as a caption beneath rather than a headline
          above. The names are short and the icons are distinct enough to carry
          recognition on their own once you have used the app twice. */}
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
              className={`group flex min-h-44 flex-col items-center gap-4 rounded-xl border border-border bg-surface px-5 pb-6 pt-7 text-center transition hover:border-accent hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg sm:min-h-52 sm:pb-8 sm:pt-9 ${wide ? 'col-span-2 min-h-36 pt-6 sm:min-h-40 sm:pt-7' : ''}`}
            >
              {/* The circle is kept, and grown with the icon: the mark itself
                  is dots ringing a space, so a round chip is the tile echoing
                  the logo rather than decorating it. Turf at rest, deeper on
                  hover -- the icon is the colour in the layout now, so leaving
                  it grey would flatten the whole grid.

                  Held at a fixed distance from the top rather than centred in
                  the tile, because "Roster & Comms" wraps to two lines where
                  "Equipment" does not, and centring pushed the two icons in a
                  row out of line with each other. The icon is the thing being
                  aimed at, so the icon is what stays aligned. */}
              <span className="flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-full bg-accent/10 text-accent transition group-hover:bg-accent/20 [&>svg]:h-9 [&>svg]:w-9 sm:h-20 sm:w-20 sm:[&>svg]:h-10 sm:[&>svg]:w-10">
                <Icon />
              </span>

              <span className="block">
                <span className="block font-display text-sm font-semibold uppercase leading-tight tracking-wide text-ink">
                  {title}
                </span>
                <span className="mt-1 block font-body text-xs text-muted">{line}</span>
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
