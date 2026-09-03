import { Link } from 'react-router-dom'

/**
 * The mark: a player, and the route they run.
 *
 * The old icon was a whistle, which says "coach" -- one role, in one of the
 * five things this app now does. A dot and a route says movement and a plan,
 * which is closer to what the product is for and does not pick a sport.
 */
export function Logo({ size = 24, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <circle cx="6" cy="18" r="2.6" fill="currentColor" stroke="none" />
      <path d="M7.7 16.3 17 7" />
      <path d="M11.4 7H17v5.6" />
    </svg>
  )
}

/**
 * Wordmark, and the way home from anywhere.
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
  const text = size === 'sm' ? 'text-sm' : 'text-lg'
  return (
    <Link
      to="/"
      aria-label="TeamOps home"
      className={`inline-flex items-center gap-2 text-accent transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg ${className}`}
    >
      <Logo size={size === 'sm' ? 18 : 22} />
      <span
        className={`font-display font-extrabold uppercase leading-none tracking-tight ${text}`}
      >
        <span className="text-ink">Team</span>
        <span className="text-accent">Ops</span>
      </span>
    </Link>
  )
}
