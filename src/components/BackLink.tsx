import { useNavigate } from 'react-router-dom'

/**
 * One step back, wherever "back" actually is.
 *
 * A phone's own back gesture is not enough: the app is installed to a Home
 * Screen where there is no browser chrome, and a parent who followed a link
 * into a game day has no way out of it. This is that way out.
 *
 * react-router records how many entries it has pushed in history.state.idx.
 * Zero means this page is where the person arrived -- a pasted link, a new
 * tab, a Home Screen launch -- so there is nothing of ours behind it and
 * going back would leave the app entirely. In that case it goes to a sensible
 * place instead of nowhere.
 */
export function BackLink({
  fallback = '/',
  label = 'Back',
  className = '',
}: {
  fallback?: string
  label?: string
  className?: string
}) {
  const navigate = useNavigate()

  function goBack() {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0
    if (idx > 0) navigate(-1)
    else navigate(fallback)
  }

  return (
    <button
      type="button"
      onClick={goBack}
      className={`inline-flex items-center gap-1.5 font-body text-sm text-muted transition hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg ${className}`}
    >
      <svg
        width={16}
        height={16}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M15 18l-6-6 6-6" />
      </svg>
      {label}
    </button>
  )
}
