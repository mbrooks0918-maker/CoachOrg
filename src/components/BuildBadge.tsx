import { useState } from 'react'
import { BUILD, buildTimeLabel } from '../lib/buildInfo'

/**
 * Which build is this?
 *
 * Small enough to ignore and always there, so "are we looking at the latest
 * deploy?" is answered by looking rather than by guessing at cache behaviour.
 * Sits on every screen including the public sign-up pages, because that is
 * exactly where a stale bundle is hardest to notice.
 *
 * Tapping it opens the detail -- full commit, branch, subject, build time --
 * rather than putting any of that on screen by default.
 */
export function BuildBadge() {
  const [open, setOpen] = useState(false)

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-end">
      <div className="pointer-events-auto m-3 mb-[calc(env(safe-area-inset-bottom)+5rem)] flex flex-col items-end lg:mb-3">
        {open && (
          <div className="mb-2 max-w-[min(20rem,calc(100vw-1.5rem))] rounded-lg border border-border bg-raised px-3 py-3 shadow-lg">
            <dl className="space-y-2 font-mono text-[0.7rem] leading-snug text-muted">
              <div>
                <dt className="uppercase tracking-wider text-muted/70">Commit</dt>
                <dd className="break-all text-ink">{BUILD.sha || 'not a git build'}</dd>
              </div>
              <div>
                <dt className="uppercase tracking-wider text-muted/70">Branch</dt>
                <dd className="text-ink">{BUILD.ref}</dd>
              </div>
              {BUILD.message && (
                <div>
                  <dt className="uppercase tracking-wider text-muted/70">Subject</dt>
                  <dd className="text-ink">{BUILD.message}</dd>
                </div>
              )}
              <div>
                <dt className="uppercase tracking-wider text-muted/70">Built</dt>
                <dd className="text-ink">{buildTimeLabel()}</dd>
              </div>
            </dl>
          </div>
        )}

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={`Build ${BUILD.short}. Show build details.`}
          className="rounded-full border border-border bg-surface/90 px-2.5 py-1 font-mono text-[0.65rem] tracking-wider text-muted backdrop-blur transition hover:border-accent hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          build {BUILD.short}
        </button>
      </div>
    </div>
  )
}
