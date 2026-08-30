import type { ReactNode } from 'react'

/**
 * Placeholder for a module that is planned but not built. Deliberately a real
 * styled screen rather than a dead link, so the navigation never leads
 * somewhere blank.
 */
export default function ComingSoon({
  title,
  tagline,
  bullets,
}: {
  title: string
  tagline: string
  bullets: string[]
}): ReactNode {
  return (
    <section>
      <p className="font-body text-xs font-medium uppercase tracking-[0.3em] text-muted">
        Coming soon
      </p>
      <h2 className="mt-3 font-display text-3xl font-bold uppercase tracking-tight text-ink sm:text-4xl">
        {title}
      </h2>
      <p className="mt-4 max-w-lg font-body text-base leading-relaxed text-muted">{tagline}</p>

      <div className="mt-10 rounded-xl border-2 border-accent bg-surface px-6 py-8 shadow-[0_0_60px_-24px] shadow-accent">
        <p className="font-body text-[0.7rem] font-medium uppercase tracking-[0.35em] text-muted">
          What this will do
        </p>
        <ul className="mt-5 space-y-3">
          {bullets.map((line) => (
            <li key={line} className="flex gap-3 font-body text-sm text-ink">
              <span aria-hidden="true" className="font-mono text-accent">
                —
              </span>
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </div>

      <p className="mt-6 font-mono text-xs uppercase tracking-[0.2em] text-muted">
        Not built yet
      </p>
    </section>
  )
}
