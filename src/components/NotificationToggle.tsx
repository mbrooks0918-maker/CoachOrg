import { useEffect, useState } from 'react'
import { disablePush, enablePush, getPushState, type PushState } from '../lib/push'
import { Button } from './ui'

export function NotificationToggle() {
  const [state, setState] = useState<PushState | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let active = true
    getPushState().then((s) => active && setState(s))
    return () => {
      active = false
    }
  }, [])

  async function handleEnable() {
    setBusy(true)
    setMessage('')
    const result = await enablePush()
    setBusy(false)
    setMessage(result.message)
    if (result.ok) setState('subscribed')
  }

  async function handleDisable() {
    setBusy(true)
    setMessage('')
    const result = await disablePush()
    setBusy(false)
    setMessage(result.message)
    if (result.ok) setState('default')
  }

  if (state === null) return null

  // iPhones need the app on the Home Screen before the notification APIs even
  // exist, so this case gets instructions instead of a message.
  if (state === 'needs-install') {
    return (
      <div className="rounded-xl border border-border bg-surface px-5 py-5">
        <h3 className="font-display text-base font-semibold uppercase tracking-wide text-ink">
          Turn on notifications
        </h3>
        <p className="mt-1 font-body text-sm text-muted">
          On iPhone and iPad, add TeamOps to your Home Screen first. Notifications only
          work from there.
        </p>
        <ol className="mt-4 space-y-2 font-body text-sm text-ink">
          <li>
            <span className="font-semibold text-accent">1.</span> Tap the Share button at the
            bottom of Safari (the square with an arrow pointing up).
          </li>
          <li>
            <span className="font-semibold text-accent">2.</span> Scroll down and tap{' '}
            <span className="font-semibold">Add to Home Screen</span>.
          </li>
          <li>
            <span className="font-semibold text-accent">3.</span> Open TeamOps from your Home
            Screen and come back to this page.
          </li>
        </ol>
      </div>
    )
  }

  // Explain rather than showing a button that cannot work.
  const blocked: Partial<Record<PushState, string>> = {
    unsupported: 'This browser does not support push notifications.',
    insecure: 'Notifications need a secure (https) connection.',
    denied:
      'Notifications are blocked for this site. Re-enable them in your browser settings, then reload.',
  }

  return (
    <div className="rounded-xl border border-border bg-surface px-5 py-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="font-display text-base font-semibold uppercase tracking-wide text-ink">
            Notifications
          </h3>
          <p className="mt-1 font-body text-sm text-muted">
            {state === 'subscribed'
              ? 'This device will receive reminders for this program.'
              : 'Get reminders on this device when a coach schedules one.'}
          </p>
        </div>

        {blocked[state] ? null : (
          <div className="sm:w-56 sm:shrink-0">
            {state === 'subscribed' ? (
              <Button variant="outline" onClick={handleDisable} disabled={busy}>
                {busy ? 'Turning off…' : 'Turn Off'}
              </Button>
            ) : (
              <Button onClick={handleEnable} disabled={busy}>
                {busy ? 'Enabling…' : 'Enable Notifications'}
              </Button>
            )}
          </div>
        )}
      </div>

      {(blocked[state] || message) && (
        <p className="mt-4 font-body text-sm text-muted">{blocked[state] ?? message}</p>
      )}
    </div>
  )
}
