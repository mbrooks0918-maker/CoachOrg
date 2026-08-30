import { useEffect, useState, type ReactNode } from 'react'
import { NavLink, Outlet, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { ProgramContext, type Program } from '../lib/programContext'

// ----------------------------------------------------------------- icons ----
// Inline so the app keeps no icon dependency. All four share a 24px box and
// inherit colour from the nav item, which is what drives the active state.

const iconProps = {
  width: 22,
  height: 22,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
}

const RosterIcon = () => (
  <svg {...iconProps}>
    <path d="M16 19v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 17.5V19" />
    <circle cx="10" cy="8" r="3.25" />
    <path d="M20 19v-1.5a3.5 3.5 0 0 0-2.6-3.38M15.6 5.2a3.25 3.25 0 0 1 0 5.6" />
  </svg>
)

const TasksIcon = () => (
  <svg {...iconProps}>
    <path d="M18 9a6 6 0 1 0-12 0c0 4.5-1.75 5.75-1.75 5.75h15.5S18 13.5 18 9Z" />
    <path d="M10.4 18.5a2 2 0 0 0 3.2 0" />
  </svg>
)

const EquipmentIcon = () => (
  <svg {...iconProps}>
    <path d="M3.5 8.5 12 4l8.5 4.5v7L12 20l-8.5-4.5v-7Z" />
    <path d="M3.5 8.5 12 13l8.5-4.5M12 13v7" />
  </svg>
)

const GameDayIcon = () => (
  <svg {...iconProps}>
    <path d="M5 21V4" />
    <path d="M5 5h11.5l-1.75 3.25L16.5 11.5H5" />
  </svg>
)

const NAV = [
  { to: 'roster', label: 'Roster & Comms', short: 'Roster', Icon: RosterIcon },
  { to: 'tasks', label: 'Scheduled Tasks', short: 'Tasks', Icon: TasksIcon },
  { to: 'equipment', label: 'Equipment', short: 'Gear', Icon: EquipmentIcon },
  { to: 'game-day', label: 'Game-Day Ops', short: 'Game Day', Icon: GameDayIcon },
]

// ----------------------------------------------------------------- shell ----

export default function AppShell() {
  const { programId } = useParams<{ programId: string }>()
  const [program, setProgram] = useState<Program | null>(null)
  const [role, setRole] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!programId) return
    let active = true

    ;(async () => {
      const [programResult, roleResult] = await Promise.all([
        supabase.from('programs').select('id, name, sport').eq('id', programId).single(),
        supabase.rpc('program_role', { p_program_id: programId }),
      ])
      if (!active) return

      if (programResult.error) setError(programResult.error.message)
      else setProgram(programResult.data)
      if (roleResult.data) setRole(roleResult.data as string)
      setLoading(false)
    })()

    return () => {
      active = false
    }
  }, [programId])

  if (loading) return <Centered>Loading…</Centered>
  if (error || !program) {
    return (
      <Centered>
        <span
          role="alert"
          className="rounded-lg border border-accent/40 bg-accent/10 px-4 py-3 text-ink"
        >
          {error || 'Program not found.'}
        </span>
      </Centered>
    )
  }

  return (
    <ProgramContext value={{ program, role }}>
      <div className="min-h-svh lg:flex">
        {/* ---- Sidebar, desktop only ---- */}
        <aside className="hidden w-64 shrink-0 border-r border-border bg-surface lg:flex lg:flex-col">
          <div className="border-b border-border px-6 py-6">
            <p className="font-body text-[0.65rem] font-medium uppercase tracking-[0.3em] text-muted">
              CoachOrg
            </p>
            <p className="mt-2 font-display text-xl font-bold uppercase leading-tight tracking-tight text-ink">
              {program.name}
            </p>
            <p className="mt-1 font-body text-xs uppercase tracking-wider text-muted">
              {program.sport}
            </p>
          </div>

          <nav className="flex flex-1 flex-col gap-1 px-3 py-4">
            {NAV.map(({ to, label, Icon }) => (
              <NavLink key={to} to={to} className={sidebarLink}>
                <Icon />
                <span>{label}</span>
              </NavLink>
            ))}
          </nav>
        </aside>

        {/* ---- Content ---- */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Mobile header: the sidebar carries this on desktop. */}
          <header className="border-b border-border px-6 py-5 lg:hidden">
            <p className="font-body text-[0.65rem] font-medium uppercase tracking-[0.3em] text-muted">
              {program.sport}
            </p>
            <h1 className="mt-1.5 font-display text-2xl font-bold uppercase leading-tight tracking-tight text-ink">
              {program.name}
            </h1>
          </header>

          {/* pb leaves room for the tab bar, which is fixed over the page. */}
          <main className="flex-1 px-6 pb-32 pt-8 lg:px-10 lg:pb-16 lg:pt-12">
            <div className="mx-auto max-w-3xl">
              <Outlet />
            </div>
          </main>
        </div>

        {/* ---- Bottom tabs, mobile only ---- */}
        <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
          {NAV.map(({ to, short, Icon }) => (
            <NavLink key={to} to={to} className={tabLink}>
              <Icon />
              <span className="text-[0.65rem] font-medium uppercase tracking-wider">{short}</span>
            </NavLink>
          ))}
        </nav>
      </div>
    </ProgramContext>
  )
}

// NavLink hands the callback an isActive flag; both variants use it to decide
// between accent and muted rather than relying on a URL comparison.
function sidebarLink({ isActive }: { isActive: boolean }) {
  return [
    'flex items-center gap-3 rounded-lg px-3 py-2.5 font-body text-sm font-medium transition',
    isActive
      ? 'bg-accent/15 text-ink shadow-[inset_2px_0_0] shadow-accent'
      : 'text-muted hover:bg-accent/10 hover:text-ink',
  ].join(' ')
}

function tabLink({ isActive }: { isActive: boolean }) {
  return [
    'flex flex-col items-center justify-center gap-1 py-2.5 transition',
    isActive ? 'text-accent' : 'text-muted',
  ].join(' ')
}

function Centered({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-svh items-center justify-center px-6 font-body text-muted">
      {children}
    </main>
  )
}
