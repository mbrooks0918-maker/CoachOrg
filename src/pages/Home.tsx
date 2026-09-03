import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { Wordmark } from '../components/brand'
import { findPrimaryProgramId } from '../lib/program'

/**
 * The marketing page, but only for people who are not signed in.
 *
 * This is the app's start_url, so it is what the Home Screen icon opens. A
 * signed-in coach landing on "Create a Team / Log In" reads as being logged
 * out and sends them to type their password again, even though the session was
 * there the whole time. Anyone with a session is forwarded to their program --
 * the same decision the login screen makes.
 */
export default function Home() {
  const { session, loading } = useAuth()
  const [destination, setDestination] = useState<string | null>(null)
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    if (loading) return

    let active = true
    ;(async () => {
      // Always awaits, so neither state update lands synchronously inside the
      // effect and starts a second render pass.
      const programId = await (session
        ? findPrimaryProgramId(session.user.id)
        : Promise.resolve(null))
      if (!active) return
      if (session) setDestination(programId ? `/program/${programId}` : '/create-org')
      setChecked(true)
    })()
    return () => {
      active = false
    }
  }, [session, loading])

  // Held back rather than shown and yanked away, which would flash the sales
  // pitch at someone who is already a member.
  if (loading || !checked) {
    return (
      <main className="flex min-h-svh items-center justify-center px-6">
        <p className="font-body text-muted">Loading…</p>
      </main>
    )
  }

  if (destination) return <Navigate to={destination} replace />

  return (
    <main className="min-h-svh">
      {/* ---------- Hero ---------- */}
      <section className="relative flex min-h-svh flex-col items-center justify-center overflow-hidden px-6 py-20 text-center">
        {/* soft red wash behind the headline */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-1/3 -z-10 h-[36rem] w-[36rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/15 blur-[120px]"
        />

        <Wordmark />

        <h1 className="mt-8 max-w-4xl font-display text-5xl font-extrabold leading-[1.03] tracking-tight text-ink sm:text-6xl lg:text-7xl">
          Run the season,<br className="hidden sm:block" /> not the spreadsheet.
        </h1>

        <p className="mt-6 max-w-xl font-body text-lg leading-relaxed text-muted sm:text-xl">
          Registration, roster, equipment and game day — one place for the people who run
          youth sport.
        </p>

        <div className="mt-10 flex w-full max-w-md flex-col gap-4 sm:w-auto sm:flex-row">
          <Link
            to="/signup"
            className="inline-flex items-center justify-center rounded-lg bg-accent px-8 py-3.5 font-body text-base font-semibold text-ink transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
          >
            Start a Team
          </Link>
          <Link
            to="/join"
            className="inline-flex items-center justify-center rounded-lg border-2 border-accent bg-transparent px-8 py-3.5 font-body text-base font-semibold text-ink transition hover:bg-accent/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
          >
            Join with a Code
          </Link>
        </div>

        <p className="mt-8 font-body text-sm text-muted">
          Already have an account?{' '}
          <Link
            to="/login"
            className="font-semibold text-accent underline underline-offset-4 transition hover:brightness-125 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
          >
            Log In
          </Link>
        </p>
      </section>

      {/* ---------- Join-code scoreboard tile ---------- */}
      <section id="join-code" className="border-t border-border px-6 py-20 sm:py-24">
        <div className="mx-auto flex max-w-lg flex-col items-center text-center">
          <h2 className="font-display text-2xl font-bold uppercase tracking-wide text-ink sm:text-3xl">
            Every team gets a code
          </h2>
          <p className="mt-3 font-body text-base text-muted">
            Share it once. Players and parents join in seconds — no invites to chase.
          </p>

          <div className="mt-10 w-full rounded-xl border-2 border-accent bg-surface px-6 py-8 shadow-[0_0_60px_-20px] shadow-accent sm:px-10">
            <p className="font-body text-[0.7rem] font-medium uppercase tracking-[0.35em] text-muted">
              Team Code
            </p>
            <p className="mt-4 font-mono text-3xl font-bold tracking-[0.08em] text-accent sm:text-4xl">
              OAK-FAM-7K2Q
            </p>
          </div>
        </div>
      </section>
    </main>
  )
}
