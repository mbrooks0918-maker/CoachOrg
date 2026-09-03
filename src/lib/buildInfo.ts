/**
 * Which build am I looking at?
 *
 * The values are baked in by vite.config.ts, so they cannot drift from the
 * bundle they ship inside. A local `npm run dev` build has a git sha but no
 * Vercel variables, which is fine -- the point is that the string on screen
 * always belongs to the code on screen.
 */
export const BUILD = {
  sha: __BUILD_SHA__,
  short: __BUILD_SHA__ ? __BUILD_SHA__.slice(0, 7) : 'dev',
  ref: __BUILD_REF__,
  message: __BUILD_MESSAGE__,
  time: __BUILD_TIME__,
}

/** "2 Sep 2026, 14:31 UTC" -- unambiguous across whoever is reading it. */
export function buildTimeLabel(): string {
  if (!BUILD.time) return 'unknown'
  const d = new Date(BUILD.time)
  return `${d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })}, ${d.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  })} UTC`
}
