import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Link, NavLink, Outlet, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { ProgramContext, type Program, type ProgramGroup } from '../lib/programContext'
import { loadProgramFeatures, type Feature } from '../lib/features'
import { Wordmark } from './brand'
import { unreadCount } from '../lib/announcements'
import { rememberLastProgram } from '../lib/lastProgram'
import { isOrgLeader } from '../lib/orgOverview'
import { visibleNav } from '../lib/navSections'
import { listMyPrograms, type MyProgram } from '../lib/program'
import { ProgramSwitcher } from './ProgramSwitcher'
import { isStaff } from '../lib/roster'

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
  const [orgLeader, setOrgLeader] = useState(false)
  const [myPrograms, setMyPrograms] = useState<MyProgram[]>([])
  const [group, setGroup] = useState<ProgramGroup | null>(null)
  const [groupAdmin, setGroupAdmin] = useState(false)
  const [unread, setUnread] = useState(0)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const refreshUnread = useCallback(async () => {
    if (programId) setUnread(await unreadCount(programId))
  }, [programId])

  useEffect(() => {
    if (!programId) return
    let active = true

    ;(async () => {
      const { data: userData } = await supabase.auth.getUser()
      const uid = userData.user?.id ?? null

      const [programResult, roleResult, memberResult, featureResult, unreadResult] =
        await Promise.all([
        supabase
          .from('programs')
          .select('id, name, sport, organization_id, program_group_id')
          .eq('id', programId)
          .single(),
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
        unreadCount(programId),
      ])

      // The group this division sits in, and whether the viewer runs it. Only
      // asked when the program is actually grouped, which almost none are.
      const groupId = (programResult.data as { program_group_id?: string | null } | null)
        ?.program_group_id
      if (groupId) {
        const [groupRow, adminRow] = await Promise.all([
          supabase.from('program_groups').select('id, name').eq('id', groupId).maybeSingle(),
          supabase
            .from('program_group_admins')
            .select('id')
            .eq('program_group_id', groupId)
            .maybeSingle(),
        ])
        if (!active) return
        setGroup((groupRow.data as ProgramGroup | null) ?? null)
        // The policy only returns this person's own row, so finding one is
        // the same question as "do I administer this group".
        setGroupAdmin(Boolean(adminRow.data))
      } else if (active) {
        setGroup(null)
        setGroupAdmin(false)
      }

      // The switcher's list. Separate from the rest because a failure here
      // costs the menu, not the screen: an empty list simply renders the
      // program name the way it looked before there was a switcher.
      if (uid) {
        const mine = await listMyPrograms(uid)
        if (active) setMyPrograms(mine)
      }
      if (!active) return

      if (programResult.error) {
        // A program the policies do not return is not an error the person
        // caused, and "cannot coerce the result to a single JSON object" is
        // not a sentence to show anybody. PGRST116 is PostgREST saying the
        // filtered set was empty, which here means "not yours" -- a typed id,
        // a stale link, or a division in somebody else's group.
        const missing =
          programResult.error.code === 'PGRST116' ||
          programResult.error.message.includes('coerce the result')
        setError(
          missing
            ? 'That team is not one of yours. Your coaches and families only see the teams they are on.'
            : programResult.error.message,
        )
      }
      else {
        setProgram(programResult.data)
        // Recorded only once the program actually loaded, so a mistyped or
        // forbidden id never becomes the place this person lands next time.
        if (uid) rememberLastProgram(uid, programId)
        // Asked after the program loads because it is keyed on the
        // organization, which the program row is what tells us.
        setOrgLeader(await isOrgLeader(programResult.data.organization_id))
      }
      if (roleResult.data) setRole(roleResult.data as string)
      setUserId(uid)
      setMemberId(memberResult.data?.id ?? null)
      setFeatures(featureResult)
      setUnread(unreadResult)
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
        {/* Otherwise this screen is a cul-de-sac: the shell never rendered, so
            there is no wordmark and no navigation to leave by. */}
        <Link
          to="/"
          className="mt-6 inline-block font-body text-sm text-accent underline underline-offset-4"
        >
          Back to your team
        </Link>
      </Centered>
    )
  }

  return (
    <ProgramContext
      value={{
        program,
        role,
        memberId,
        userId,
        features,
        orgLeader,
        groupAdmin,
        group,
        staff: isStaff(role) || orgLeader || groupAdmin,
        unreadCount: unread,
        refreshUnread,
      }}
    >
      <div className="min-h-svh lg:flex">
        {/* ---- Sidebar, desktop only ---- */}
        <aside className="hidden w-64 shrink-0 border-r border-border bg-surface lg:flex lg:flex-col">
          <div className="border-b border-border px-6 py-5">
            <Wordmark />
          </div>
          <ProgramSwitcher
            programs={myPrograms}
            currentId={program.id}
            name={program.name}
            sport={program.sport}
            variant="sidebar"
          />

          {orgLeader && (
            <Link
              to={`/org/${program.organization_id}`}
              className="border-b border-border px-6 py-3 font-body text-xs uppercase tracking-wider text-muted transition hover:bg-accent/5 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
            >
              ← Organization overview
            </Link>
          )}

          {/* The way up for a Program Admin. Not shown to a director, who has
              the wider view above and would only be offered a narrower one. */}
          {groupAdmin && group && !orgLeader && (
            <Link
              to={`/group/${group.id}`}
              className="border-b border-border px-6 py-3 font-body text-xs uppercase tracking-wider text-muted transition hover:bg-accent/5 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
            >
              ← All of {group.name}
            </Link>
          )}

          <nav className="flex flex-1 flex-col gap-1 px-3 py-4">
            {visibleNav(features, isStaff(role) || orgLeader || groupAdmin).map(({ to, label, Icon }) => (
              <NavLink key={to} to={to} className={sidebarLink}>
                <IconWithBadge Icon={Icon} show={to === 'roster' && unread > 0} />
                <span>{label}</span>
                {to === 'roster' && unread > 0 && (
                  <span className="ml-auto rounded-full bg-accent px-1.5 py-0.5 font-mono text-[0.65rem] font-medium text-bg">
                    {unread}
                  </span>
                )}
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
          <header className="border-b border-border px-6 py-4 lg:hidden">
            <div className="flex items-center justify-between gap-4">
              <Wordmark size="sm" />
              {orgLeader ? (
                <Link
                  to={`/org/${program.organization_id}`}
                  className="font-body text-[0.7rem] uppercase tracking-wider text-muted transition hover:text-accent"
                >
                  Overview
                </Link>
              ) : (
                groupAdmin &&
                group && (
                  <Link
                    to={`/group/${group.id}`}
                    className="font-body text-[0.7rem] uppercase tracking-wider text-muted transition hover:text-accent"
                  >
                    All {group.name}
                  </Link>
                )
              )}
            </div>
            <div className="mt-3 flex items-start justify-between gap-4">
            <ProgramSwitcher
              programs={myPrograms}
              currentId={program.id}
              name={program.name}
              sport={program.sport}
              variant="header"
            />
            <button
              type="button"
              onClick={handleSignOut}
              aria-label="Sign out"
              className="mt-1 shrink-0 rounded-full border border-border px-3 py-1.5 font-body text-xs uppercase tracking-wider text-muted transition hover:border-accent hover:text-ink"
            >
              Sign out
            </button>
            </div>
          </header>

          {/* pb leaves room for the tab bar, which is fixed over the page. */}
          <main className="flex-1 px-6 pb-32 pt-8 lg:px-10 lg:pb-16 lg:pt-12">
            <div className="mx-auto max-w-3xl">
              <Outlet />
            </div>
          </main>
        </div>

        {/* ---- Bottom tabs, mobile only ---- */}
        {/* Columns follow the sections on offer: hard-coding five wrapped the
            sixth onto a row of its own the moment registration was unlocked.

            Seven is the most this bar holds at 375px, which is why the short
            labels are as short as they are -- "Game Day" and "Sign-ups" each
            took two lines once Resources arrived, and a tab bar with some
            icons a line higher than the others looks broken. They never wrap
            now; if an eighth section is ever added this bar needs rethinking
            rather than another shortened word. */}
        <nav
          className="fixed inset-x-0 bottom-0 z-20 grid border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
          style={{
            gridTemplateColumns: `repeat(${visibleNav(features, isStaff(role) || orgLeader || groupAdmin).length}, minmax(0, 1fr))`,
          }}
        >
          {visibleNav(features, isStaff(role) || orgLeader || groupAdmin).map(({ to, short, Icon }) => (
            <NavLink key={to} to={to} className={tabLink}>
              <IconWithBadge Icon={Icon} show={to === 'roster' && unread > 0} />
              <span className="whitespace-nowrap text-[0.65rem] font-medium uppercase tracking-wider">{short}</span>
            </NavLink>
          ))}
        </nav>
      </div>
    </ProgramContext>
  )
}

/**
 * A section icon, with a dot when that section is waiting on you.
 *
 * The dot rather than the number on the tab bar: at that size a count is
 * unreadable, and "there is something new" is the whole message anyway. The
 * sidebar has room for the number and shows it.
 */
function IconWithBadge({
  Icon,
  show,
}: {
  Icon: (props: { size?: number }) => ReactNode
  show: boolean
}) {
  return (
    <span className="relative inline-flex">
      <Icon />
      {show && (
        <span
          aria-hidden="true"
          className="absolute -right-1 -top-0.5 h-2 w-2 rounded-full bg-accent ring-2 ring-surface"
        />
      )}
    </span>
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
    <main className="flex min-h-svh flex-col items-center justify-center px-6 text-center font-body text-muted">
      {children}
    </main>
  )
}
