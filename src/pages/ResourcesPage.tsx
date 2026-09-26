import { useState } from 'react'
import { useProgram } from '../lib/programContext'
import { isStaff } from '../lib/roster'
import {
  RESOURCE_CATEGORIES,
  RESOURCE_COUNT,
  type Resource,
} from '../lib/resources'

/**
 * The coaching library.
 *
 * Read-only, identical for every organization, and not scoped to the program
 * whose navigation you arrived through -- a coach looking up concussion
 * guidance should not have to remember which team they were looking at.
 *
 * Videos are not framed until asked for. A page that mounts four YouTube
 * iframes on load pulls in several hundred kilobytes and lets Google set
 * cookies on a screen full of children's names, so each one starts as a
 * poster and becomes a player on a click.
 */
export default function ResourcesPage() {
  const { role, orgLeader } = useProgram()

  // Staff-only, and org leaders too: an athletic director carries no role in
  // any single program, so isStaff() alone would lock them out of their own
  // organization's library.
  if (!isStaff(role) && !orgLeader) {
    return (
      <div>
        <h2 className="font-display text-2xl font-bold uppercase tracking-tight text-ink">
          Resources
        </h2>
        <p className="mt-2 font-body text-sm text-muted">
          The coaching library is for your team's staff. Ask a coach if there is
          something in it you need.
        </p>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="font-display text-2xl font-bold uppercase tracking-tight text-ink">
          Resources
        </h2>
        <span className="font-body text-sm text-muted">{RESOURCE_COUNT} links</span>
      </div>
      <p className="mt-2 font-body text-sm text-muted">
        Training, certification and drills for youth coaches. The whole library
        is here whatever program you came in through — safety applies to
        everyone, and next season may be a different sport.
      </p>

      {RESOURCE_CATEGORIES.map((category) => (
        <section key={category.key} className="mt-10">
          <h3 className="font-body text-xs font-medium uppercase tracking-[0.25em] text-muted">
            {category.title}
          </h3>
          <p className="mt-2 font-body text-sm text-ink/80">{category.blurb}</p>

          <div className="mt-4 space-y-4">
            {category.items.map((item) => (
              <ResourceCard key={item.url} item={item} />
            ))}
          </div>
        </section>
      ))}

      <p className="mt-12 font-body text-xs text-muted">
        Links open on the provider's own site. Every one was checked on
        25 September 2026.
      </p>
    </div>
  )
}

function ResourceCard({ item }: { item: Resource }) {
  const [playing, setPlaying] = useState(false)

  return (
    <div className="rounded-xl border border-border bg-surface transition hover:border-accent/60">
      <div className="p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-display text-base font-semibold uppercase tracking-wide text-ink underline-offset-4 hover:text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            {item.title}
          </a>
          {item.tag && (
            <span className="rounded-full border border-accent/40 px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-wider text-accent">
              {item.tag}
            </span>
          )}
        </div>

        <p className="mt-2 font-body text-sm text-muted">{item.description}</p>

        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex items-center gap-1.5 font-mono text-[0.7rem] uppercase tracking-wider text-accent underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          Open
          <span aria-hidden="true">↗</span>
        </a>
      </div>

      {item.youtubeId && (
        <div className="border-t border-border p-5 pt-4">
          {playing ? (
            <div className="aspect-video overflow-hidden rounded-lg bg-bg">
              <iframe
                className="h-full w-full"
                src={`https://www.youtube-nocookie.com/embed/${item.youtubeId}?autoplay=1&rel=0`}
                title={item.title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setPlaying(true)}
              className="group relative block aspect-video w-full overflow-hidden rounded-lg bg-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <img
                src={`https://i.ytimg.com/vi/${item.youtubeId}/hqdefault.jpg`}
                alt=""
                loading="lazy"
                className="h-full w-full object-cover opacity-80 transition group-hover:opacity-100"
              />
              <span className="absolute inset-0 flex items-center justify-center">
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-bg/80 text-accent backdrop-blur transition group-hover:bg-accent group-hover:text-bg">
                  <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M9.2 7.4 17 12l-7.8 4.6Z" fill="currentColor" />
                  </svg>
                </span>
              </span>
              <span className="sr-only">Play {item.title}</span>
            </button>
          )}
        </div>
      )}
    </div>
  )
}
