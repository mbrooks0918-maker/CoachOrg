import { useEffect, useState } from 'react'
import {
  AUDIENCES,
  audienceLabel,
  cancelReminder,
  createReminder,
  defaultSendAt,
  formatSendAt,
  listReminders,
  relativeToNow,
  toLocalInputValue,
  type Reminder,
} from '../lib/reminders'
import { Button, ErrorNote, Field, TextArea } from './ui'

/**
 * Reminder composer plus the queue for one program.
 *
 * Rendered only for roles the insert policy accepts; the policy is still the
 * real gate, this just avoids showing a form that would be rejected.
 */
export function Reminders({ programId }: { programId: string }) {
  const [reminders, setReminders] = useState<Reminder[]>([])
  const [loading, setLoading] = useState(true)

  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [sendAt, setSendAt] = useState(defaultSendAt)
  const [targetRole, setTargetRole] = useState<string | null>(null)

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    let active = true
    listReminders(programId).then(({ data }) => {
      if (active && data) setReminders(data)
      if (active) setLoading(false)
    })
    return () => {
      active = false
    }
  }, [programId])

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    setNotice('')

    const result = await createReminder({ programId, title, body, sendAtLocal: sendAt, targetRole })
    setBusy(false)

    if (!result.ok || !result.reminder) {
      setError(result.message)
      return
    }

    // Insert locally rather than refetching -- the row is already returned and
    // the list is small enough to keep sorted by hand.
    const added = result.reminder
    setReminders((current) =>
      [...current, added].sort((a, b) => a.send_at.localeCompare(b.send_at)),
    )
    setTitle('')
    setBody('')
    setSendAt(defaultSendAt())
    setTargetRole(null)
    setNotice(`Scheduled for ${formatSendAt(added.send_at)}.`)
  }

  async function handleCancel(reminder: Reminder) {
    setError('')
    setNotice('')
    const result = await cancelReminder(reminder.id)
    if (!result.ok) {
      setError(result.message)
      return
    }
    setReminders((current) => current.filter((r) => r.id !== reminder.id))
    setNotice(result.message)
  }

  const upcoming = reminders.filter((r) => !r.sent)
  // Most recent first, and only a short tail -- this is a receipt, not a log.
  const recentlySent = reminders.filter((r) => r.sent).reverse().slice(0, 5)

  return (
    <section className="mt-14">
      <h2 className="font-display text-xl font-semibold uppercase tracking-wide text-ink">
        Reminders
      </h2>
      <p className="mt-2 font-body text-sm text-muted">
        Schedule a notification for your team. It goes to everyone in the group you pick
        who has notifications turned on.
      </p>

      <form
        onSubmit={handleSubmit}
        className="mt-6 space-y-5 rounded-xl border border-border bg-surface px-5 py-6"
      >
        <Field
          label="Title"
          name="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Practice moved to 5:00"
          maxLength={80}
          required
        />

        <TextArea
          label="Message"
          name="body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Bring cleats and a water bottle. Optional."
          maxLength={300}
          hint="Optional. Shows underneath the title on the phone."
        />

        <Field
          label="Send at"
          name="sendAt"
          type="datetime-local"
          value={sendAt}
          min={toLocalInputValue(new Date())}
          onChange={(e) => setSendAt(e.target.value)}
          required
        />

        <div>
          <span className="font-body text-xs font-medium uppercase tracking-[0.18em] text-muted">
            Send to
          </span>
          <div className="mt-2 flex flex-wrap gap-2">
            {AUDIENCES.map((audience) => {
              const selected = audience.value === targetRole
              return (
                <button
                  key={audience.label}
                  type="button"
                  onClick={() => setTargetRole(audience.value)}
                  aria-pressed={selected}
                  className={`rounded-full border px-4 py-2 font-body text-sm transition ${
                    selected
                      ? 'border-accent bg-accent/20 font-semibold text-ink'
                      : 'border-border text-muted hover:border-accent/50 hover:text-ink'
                  }`}
                >
                  {audience.label}
                </button>
              )
            })}
          </div>
        </div>

        <ErrorNote>{error}</ErrorNote>
        {notice && !error && (
          <p className="font-body text-sm text-muted">{notice}</p>
        )}

        <Button type="submit" disabled={busy}>
          {busy ? 'Scheduling…' : 'Schedule Reminder'}
        </Button>
      </form>

      {!loading && (
        <div className="mt-8 space-y-8">
          <ReminderList
            title="Scheduled"
            reminders={upcoming}
            empty="Nothing scheduled yet."
            onCancel={handleCancel}
          />
          {recentlySent.length > 0 && (
            <ReminderList title="Already sent" reminders={recentlySent} empty="" />
          )}
        </div>
      )}
    </section>
  )
}

function ReminderList({
  title,
  reminders,
  empty,
  onCancel,
}: {
  title: string
  reminders: Reminder[]
  empty: string
  onCancel?: (reminder: Reminder) => void
}) {
  return (
    <div>
      <h3 className="font-body text-xs font-medium uppercase tracking-[0.22em] text-muted">
        {title}
        <span className="ml-2 text-muted/60">{reminders.length}</span>
      </h3>

      {reminders.length === 0 ? (
        <p className="mt-3 font-body text-sm text-muted/70">{empty}</p>
      ) : (
        <ul className="mt-3 divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
          {reminders.map((reminder) => (
            <li key={reminder.id} className="px-4 py-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-body text-base font-medium text-ink">{reminder.title}</p>
                  {reminder.body && (
                    <p className="mt-1 font-body text-sm text-muted">{reminder.body}</p>
                  )}
                  <p className="mt-2 font-body text-xs text-muted">
                    {formatSendAt(reminder.send_at)}
                    {!reminder.sent && ` · ${relativeToNow(reminder.send_at)}`}
                    {' · '}
                    {audienceLabel(reminder.target_role)}
                  </p>
                </div>

                {onCancel && (
                  <button
                    type="button"
                    onClick={() => onCancel(reminder)}
                    className="shrink-0 rounded-full border border-border px-3 py-1.5 font-body text-xs uppercase tracking-wider text-muted transition hover:border-accent hover:text-ink"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
