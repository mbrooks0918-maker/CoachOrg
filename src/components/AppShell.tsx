import { useEffect, useState, type ReactNode } from 'react'
import { Link, NavLink, Outlet, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { ProgramContext, type Program } from '../lib/programContext'
import { loadProgramFeatures, type Feature } from '../lib/features'
import { visibleNav } from '../lib/navSections'

/** Belongs to the shell rather than the section list -- it is not a section. */
const SignOutIcon = () => (
  <svg
    width={22}
    height={22}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.75}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M15 17v1.5A1.5 1.5 0 0 1 13.5 20h-7A1.5 1.5 0 0 1 5 18.5v-13A1.5 1.5 0 0 1 6.5 4h7A1.5 1.5 0 0 1 15 5.5V7" />
    <path d="M18.5 12H10m0 0 2.75-2.75M10 12l2.75 2.75" />
  </svg>
)

// ----------------------------------------------------------------- shell ----

export default function AppShell() {
  const { programId } = useParams<{ programId: string }>()
  const navigate = useNavigate()
  const [program, setProgram] = useState<Program | null>(null)
  const [role, setRole] = useState<string | null>(null)
  const [memberId, setMemberId] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [features, setFeatures] = useState<Feature[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!programId) return
    let active = true

    ;(async () => {
      const { data: userData } = await supabase.auth.getUser()
      const uid = userData.user?.id ?? null

      const [programResult, roleResult, memberResult, featureResult] = await Promise.all([
        supabase.from('programs').select('id, name, sport').eq('id', programId).single(),
        supabase.rpc('program_role', { p_program_id: programId }),
        uid
          ? supabase
              .from('program_members')
              .select('id')
              .eq('program_id', programId)
              .eq('user_id', uid)
              .maybeSingle()
          : Promise.resolve({ data: null }),
        loadProgramFeatures(programId),
      ])
      if (!active) return

      if (programResult.error) setError(programResult.error.message)
      else setProgram(programResult.data)
      if (roleResult.data) setRole(roleResult.data as string)
      setUserId(uid)
      setMemberId(memberResult.data?.id ?? null)
      setFeatures(featureResult)
      setLoading(false)
    })()

    return () => {
      active = false
    }
  }, [programId])

  // AuthProvider is subscribed to auth state, so clearing the session is
  // enough to make RequireAuth bounce to /login; the navigate just gets there
  // without a flash of the program screen.
  async function handleSignOut() {
    await supabase.auth.signOut()
    navigate('/login', { replace: true })
  }

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
    <ProgramContext value={{ program, role, memberId, userId, features }}>
      <div className="min-h-svh lg:flex">
        {/* ---- Sidebar, desktop only ---- */}
        <aside className="hidden w-64 shrink-0 border-r border-border bg-surface lg:flex lg:flex-col">
          <Link
            to=""
            className="block border-b border-border px-6 py-6 transition hover:bg-accent/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
          >
            <p className="font-body text-[0.65rem] font-medium uppercase tracking-[0.3em] text-muted">
              CoachOrg
            </p>
            <p className="mt-2 font-display text-xl font-bold uppercase leading-tight tracking-tight text-ink">
              {program.name}
            </p>
            <p className="mt-1 font-body text-xs uppercase tracking-wider text-muted">
              {program.sport}
            </p>
          </Link>

          <nav className="flex flex-1 flex-col gap-1 px-3 py-4">
            {visibleNav(features).map(({ to, label, Icon }) => (
              <NavLink key={to} to={to} className={sidebarLink}>
                <Icon />
                <span>{label}</span>
              </NavLink>
            ))}
          </nav>

          <div className="border-t border-border px-3 py-4">
            <button
              type="button"
              onClick={handleSignOut}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 font-body text-sm font-medium text-muted transition hover:bg-accent/10 hover:text-ink"
            >
              <SignOutIcon />
              <span>Sign out</span>
            </button>
          </div>
        </aside>

        {/* ---- Content ---- */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Mobile header: the sidebar carries this on desktop. */}
          <header className="flex items-start justify-between gap-4 border-b border-border px-6 py-5 lg:hidden">
            <Link to="" className="min-w-0 focus-visible:outline-none">
              <p className="font-body text-[0.65rem] font-medium uppercase tracking-[0.3em] text-muted">
                {program.sport}
              </p>
              <h1 className="mt-1.5 font-display text-2xl font-bold uppercase leading-tight tracking-tight text-ink">
                {program.name}
              </h1>
            </Link>
            <button
              type="button"
              onClick={handleSignOut}
              aria-label="Sign out"
              className="mt-1 shrink-0 rounded-full border border-border px-3 py-1.5 font-body text-xs uppercase tracking-wider text-muted transition hover:border-accent hover:text-ink"
            >
              Sign out
            </button>
          </header>

          {/* pb leaves room for the tab bar, which is fixed over the page. */}
          <main className="flex-1 px-6 pb-32 pt-8 lg:px-10 lg:pb-16 lg:pt-12">
            <div className="mx-auto max-w-3xl">
              <Outlet />
            </div>
          </main>
        </div>

        {/* ---- Bottom tabs, mobile only ---- */}
        <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
          {visibleNav(features).map(({ to, short, Icon }) => (
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
