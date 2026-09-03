import { Link } from 'react-router-dom'

/**
 * The TeamOps mark: four dots ringing an empty centre.
 *
 * A huddle seen from above, with the negative space reading as a ball. From
 * the "Huddle" brand package, whose rules are: never rotate it, never recolour
 * individual dots, never add a stroke.
 *
 * Two geometries, not one scaled. The package ships a separate 32px optical
 * version with larger dots and a tighter gap, because the 512px proportions go
 * muddy when shrunk to sit next to a word. The switch is at 32px, matching the
 * package's own React component.
 *
 * Colours come from the tokens rather than hard-coded hexes so the mark cannot
 * drift from the palette. 'reverse' -- a turf tile with ink dots -- is the
 * default because the app chrome is dark, and that is the variant the package
 * specifies for dark backgrounds.
 */
export function Logo({
  size = 24,
  variant = 'reverse',
  className = '',
}: {
  size?: number
  variant?: 'reverse' | 'ink'
  className?: string
}) {
  const tile = variant === 'reverse' ? 'var(--color-accent)' : 'var(--color-bg)'
  const dot = variant === 'reverse' ? 'var(--color-bg)' : 'var(--color-accent)'

  // Below 32px the package uses its favicon proportions instead of scaling.
  const small = size < 32
  const box = small ? 32 : 512
  const radius = small ? 7 : 116
  const r = small ? 4.2 : 56
  const near = small ? 7.8 : 133
  const far = small ? 24.2 : 379
  const mid = small ? 16 : 256

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${box} ${box}`}
      role="img"
      aria-label="TeamOps"
      className={className}
    >
      <rect width={box} height={box} rx={radius} fill={tile} />
      <circle cx={mid} cy={near} r={r} fill={dot} />
      <circle cx={far} cy={mid} r={r} fill={dot} />
      <circle cx={mid} cy={far} r={r} fill={dot} />
      <circle cx={near} cy={mid} r={r} fill={dot} />
    </svg>
  )
}

/**
 * Wordmark, and the way home from anywhere.
 *
 * Always one word, capital T, capital O, never italicised or condensed. On a
 * dark ground the package sets "Team" in white and "Ops" in turf; turf-deep is
 * for light backgrounds only, where plain turf would fail contrast.
 *
 * Always a link to "/", which sends a signed-in person to their program and
 * everyone else to the front page. It is not a substitute for a back button --
 * one returns you a step, the other returns you to the start, and a person
 * halfway through something needs the first.
 */
export function Wordmark({
  size = 'base',
  className = '',
}: {
  size?: 'sm' | 'base'
  className?: string
}) {
  const text = size === 'sm' ? 'text-base' : 'text-xl'
  return (
    <Link
      to="/"
      aria-label="TeamOps home"
      className={`inline-flex items-center transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg ${
        size === 'sm' ? 'gap-2' : 'gap-2.5'
      } ${className}`}
    >
      <Logo size={size === 'sm' ? 22 : 28} />
      <span
        className={`font-display font-semibold leading-none tracking-[-0.04em] ${text}`}
      >
        <span className="text-ink">Team</span>
        <span className="text-accent">Ops</span>
      </span>
    </Link>
  )
}
