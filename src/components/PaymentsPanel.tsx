import { useCallback, useEffect, useState } from 'react'
import { Button, ErrorNote } from './ui'
import {
  refreshPaymentStatus,
  startConnectOnboarding,
  STATUS_LABEL,
  type ConnectStatus,
} from '../lib/payments'

/**
 * Connecting an organization's own Stripe account.
 *
 * The status shown is whatever Stripe last said the account could do, not
 * whether somebody once clicked the button. An account can finish onboarding
 * and still be unable to take money, which is why "setup unfinished" and
 * "connected and ready" are different answers and both are possible after a
 * completed flow.
 *
 * Refreshed on mount and on return from Stripe, and re-checkable by hand,
 * because Stripe can enable an account minutes or days after the forms are
 * submitted and nobody should have to guess whether that has happened.
 */
export function PaymentsPanel({ organizationId }: { organizationId: string }) {
  const [status, setStatus] = useState<ConnectStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    const result = await refreshPaymentStatus(organizationId)
    if (!result.ok) {
      setError(result.message)
      return
    }
    setError('')
    setStatus(result.status ?? null)
  }, [organizationId])

  useEffect(() => {
    let active = true
    ;(async () => {
      const result = await refreshPaymentStatus(organizationId)
      if (!active) return
      if (result.ok) setStatus(result.status ?? null)
      else setError(result.message)
      setLoading(false)
    })()
    return () => {
      active = false
    }
  }, [organizationId])

  async function connect() {
    setBusy(true)
    setError('')
    const result = await startConnectOnboarding(organizationId)
    setBusy(false)
    if (!result.ok || !result.url) {
      setError(result.message)
      return
    }
    // Stripe's own hosted flow. Card and identity details never come near us.
    window.location.href = result.url
  }

  const state = status?.status ?? 'not_connected'
  const ready = state === 'ready'
  const started = state !== 'not_connected'
  const due = status?.requirements?.currently_due ?? []

  return (
    <section className="mt-12">
      <h2 className="font-display text-xl font-semibold uppercase tracking-wide text-ink">
        Payments
      </h2>

      <div className="mt-4 rounded-xl border border-border bg-surface px-5 py-5">
        {loading ? (
          <p className="font-body text-sm text-muted">Checking with Stripe…</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <span
                className={`inline-block h-2.5 w-2.5 rounded-full ${
                  ready ? 'bg-good' : started ? 'bg-accent' : 'bg-muted/50'
                }`}
                aria-hidden="true"
              />
              <span className="font-body text-base text-ink">{STATUS_LABEL[state]}</span>
              {status?.livemode === false && (
                <span className="rounded-full border border-border px-2 py-0.5 font-mono text-[0.65rem] uppercase tracking-wider text-muted">
                  Test mode
                </span>
              )}
            </div>

            <p className="mt-3 max-w-xl font-body text-sm text-muted">
              {ready
                ? 'Registration fees go straight to this organization’s own Stripe account. TeamOps never holds the money, and refunds and disputes are handled by whoever runs the program.'
                : started
                  ? 'Stripe still needs something before this account can take money. Picking up where you left off will show you what.'
                  : 'Connect a Stripe account to charge registration fees. Families pay on Stripe’s own checkout page, and the money lands in this organization’s bank account — not ours.'}
            </p>

            {due.length > 0 && (
              <ul className="mt-3 space-y-1 font-mono text-[0.7rem] text-muted">
                {due.slice(0, 6).map((item) => (
                  <li key={item}>· Stripe still wants: {item.replace(/_/g, ' ')}</li>
                ))}
              </ul>
            )}

            {status?.account_id && (
              <p className="mt-3 font-mono text-[0.7rem] uppercase tracking-wider text-muted/70">
                {status.account_id}
              </p>
            )}

            <div className="mt-5">
              <ErrorNote>{error}</ErrorNote>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-4">
              {!ready && (
                <span className="w-full sm:w-auto">
                  <Button onClick={connect} disabled={busy}>
                    {busy ? 'Opening Stripe…' : started ? 'Finish setting up' : 'Connect Stripe'}
                  </Button>
                </span>
              )}
              <button
                type="button"
                onClick={refresh}
                className="font-body text-sm text-muted underline underline-offset-4 transition hover:text-ink"
              >
                Re-check with Stripe
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  )
}
