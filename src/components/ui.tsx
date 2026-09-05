import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  TextareaHTMLAttributes,
} from 'react'
import { BackLink } from './BackLink'
import { Wordmark } from './brand'

/**
 * The bar every standalone page wears: a step back on the left, the way home
 * on the right. They are not the same job -- back returns you a step, the
 * wordmark returns you to the start -- so both are here rather than one
 * standing in for the other.
 */
export function TopBar({
  backTo = '/',
  backLabel = 'Back',
}: {
  backTo?: string
  backLabel?: string
}) {
  return (
    <div className="mb-8 flex items-center justify-between gap-4">
      <BackLink fallback={backTo} label={backLabel} />
      <Wordmark size="sm" />
    </div>
  )
}

/** Centred single-column shell used by every form page. */
export function FormShell({
  title,
  subtitle,
  children,
  footer,
  backTo = '/',
}: {
  title: string
  subtitle?: string
  children: ReactNode
  footer?: ReactNode
  backTo?: string
}) {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center px-6 py-16">
      <div className="w-full max-w-md">
        <TopBar backTo={backTo} />
        <h1 className="font-display text-4xl font-bold uppercase tracking-tight text-ink sm:text-5xl">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-3 font-body text-base text-muted">{subtitle}</p>
        )}
        <div className="mt-8">{children}</div>
        {footer && (
          <div className="mt-6 font-body text-sm text-muted">{footer}</div>
        )}
      </div>
    </main>
  )
}

type FieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string
  hint?: string
}

export function Field({ label, hint, id, ...props }: FieldProps) {
  const inputId = id ?? props.name
  return (
    <label htmlFor={inputId} className="block">
      <span className="font-body text-xs font-medium uppercase tracking-[0.18em] text-muted">
        {label}
      </span>
      <input
        id={inputId}
        {...props}
        className="mt-2 w-full rounded-lg border border-border bg-surface px-4 py-3 font-body text-base text-ink placeholder:text-muted/60 transition focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/40"
      />
      {hint && <span className="mt-1.5 block font-body text-xs text-muted">{hint}</span>}
    </label>
  )
}

type TextAreaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string
  hint?: string
}

/** Field's multi-line twin, sharing its border, focus ring and label style. */
export function TextArea({ label, hint, id, rows = 3, ...props }: TextAreaProps) {
  const inputId = id ?? props.name
  return (
    <label htmlFor={inputId} className="block">
      <span className="font-body text-xs font-medium uppercase tracking-[0.18em] text-muted">
        {label}
      </span>
      <textarea
        id={inputId}
        rows={rows}
        {...props}
        className="mt-2 w-full resize-y rounded-lg border border-border bg-surface px-4 py-3 font-body text-base text-ink placeholder:text-muted/60 transition focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/40"
      />
      {hint && <span className="mt-1.5 block font-body text-xs text-muted">{hint}</span>}
    </label>
  )
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'outline'
}

export function Button({ variant = 'primary', className = '', ...props }: ButtonProps) {
  const base =
    'inline-flex w-full items-center justify-center rounded-lg px-6 py-3.5 font-body text-base font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:cursor-not-allowed disabled:opacity-50'
  const look =
    variant === 'primary'
      ? 'bg-accent text-bg hover:brightness-110'
      : 'border-2 border-accent bg-transparent text-accent hover:bg-accent/10'
  return <button {...props} className={`${base} ${look} ${className}`} />
}

/**
 * An empty section, on purpose.
 *
 * "Nothing scheduled" on its own reads as a gap where content failed to load.
 * The useful thing to say is what will be here once there is something, so the
 * shape has room for that: a muted mark, a plain statement, and a line about
 * what this section does when it is doing its job.
 */
export function EmptyState({
  Icon,
  title,
  line,
}: {
  Icon?: (props: { size?: number }) => ReactNode
  title: string
  line?: string
}) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-border bg-surface px-6 py-10 text-center">
      {Icon && (
        <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-raised text-muted/60">
          <Icon size={24} />
        </span>
      )}
      <p className="font-display text-base font-semibold text-ink">{title}</p>
      {line && <p className="mt-2 max-w-sm font-body text-sm leading-relaxed text-muted">{line}</p>}
    </div>
  )
}

/** Error surfaced from Supabase or from local validation. */
export function ErrorNote({ children }: { children: ReactNode }) {
  if (!children) return null
  return (
    <p
      role="alert"
      className="rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 font-body text-sm text-ink"
    >
      {children}
    </p>
  )
}

/** Code tile — the same treatment the marketing page uses. */
export function CodeTile({
  label,
  blurb,
  code,
}: {
  label: string
  blurb?: string
  code: string
}) {
  return (
    <div className="rounded-xl border border-accent/60 bg-surface px-5 py-6 text-center">
      <p className="font-body text-[0.7rem] font-medium uppercase tracking-[0.3em] text-muted">
        {label}
      </p>
      <p className="mt-3 whitespace-nowrap font-mono text-lg font-bold tracking-[0.04em] text-accent sm:text-xl lg:text-2xl">
        {code}
      </p>
      {blurb && <p className="mt-3 font-body text-xs text-muted">{blurb}</p>}
    </div>
  )
}
