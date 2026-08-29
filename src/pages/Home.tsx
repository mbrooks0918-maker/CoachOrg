import { Link } from 'react-router-dom'

export default function Home() {
  return (
    <main className="min-h-svh">
      {/* ---------- Hero ---------- */}
      <section className="relative flex min-h-svh flex-col items-center justify-center overflow-hidden px-6 py-20 text-center">
        {/* soft red wash behind the headline */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-1/3 -z-10 h-[36rem] w-[36rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/15 blur-[120px]"
        />

        <p className="font-body text-xs font-medium uppercase tracking-[0.3em] text-muted">
          CoachOrg
        </p>

        <h1 className="mt-6 max-w-4xl font-display text-5xl font-bold leading-[1.05] tracking-tight text-ink sm:text-6xl lg:text-7xl">
          Run your team. Skip the chaos.
        </h1>

        <p className="mt-6 max-w-xl font-body text-lg leading-relaxed text-muted sm:text-xl">
          Roster, messages, equipment, and game day — one simple app for coaches.
        </p>

        <div className="mt-10 flex w-full max-w-md flex-col gap-4 sm:w-auto sm:flex-row">
          <Link
            to="/signup"
            className="inline-flex items-center justify-center rounded-lg bg-accent px-8 py-3.5 font-body text-base font-semibold text-ink transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
          >
            Create a Team
          </Link>
          <Link
            to="/login"
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
          <h2 className="font-display text-2xl font-semibold uppercase tracking-wide text-ink sm:text-3xl">
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
              ALB-AGGIES-24
            </p>
          </div>
        </div>
      </section>
    </main>
  )
}
