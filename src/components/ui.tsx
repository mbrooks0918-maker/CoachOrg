import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  TextareaHTMLAttributes,
} from 'react'

/** Centred single-column shell used by every form page. */
export function FormShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string
  subtitle?: string
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center px-6 py-16">
      <div className="w-full max-w-md">
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
      ? 'bg-accent text-ink hover:brightness-110'
      : 'border-2 border-accent bg-transparent text-ink hover:bg-accent/15'
  return <button {...props} className={`${base} ${look} ${className}`} />
}

/** Error surfaced from Supabase or from local validation. */
export function ErrorNote({ children }: { children: ReactNode }) {
  if (!children) return null
  return (
    <p
      role="alert"
      className="rounded-lg border border-accent/40 bg-accent/10 px-4 py-3 font-body text-sm text-ink"
    >
      {children}
    </p>
  )
}

/** Scoreboard tile — the same treatment the marketing page uses. */
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
    <div className="rounded-xl border-2 border-accent bg-surface px-5 py-6 text-center shadow-[0_0_60px_-24px] shadow-accent">
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
