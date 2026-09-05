import { useCallback, useEffect, useState } from 'react'
import { Button, EmptyState, ErrorNote, Field, TextArea } from './ui'
import { RosterIcon } from './navItems'
import { useProgram } from '../lib/programContext'
import { isStaff, type Member } from '../lib/roster'
import {
  deleteAnnouncement,
  editAnnouncement,
  loadAnnouncements,
  markRead,
  postAnnouncement,
  setPinned,
  whenPosted,
  type Announcement,
} from '../lib/announcements'

/**
 * The "Comms" half of Roster & Comms.
 *
 * Sits above the roster rather than behind a toggle: a person who tapped
 * through because the tab had a dot on it should be looking at the thing that
 * put the dot there, not choosing a mode first.
 *
 * Author names come from the roster the page has already loaded rather than a
 * second query. Somebody who has left the program no longer has a row, so
 * their posts say "Staff" -- which is true, and better than a spinner or a
 * blank.
 */
export function Announcements({
  members,
  onUnreadChanged,
}: {
  members: Member[]
  onUnreadChanged: () => Promise<void>
}) {
  const { program, role, userId, orgLeader } = useProgram()
  const staff = isStaff(role)

  const [items, setItems] = useState<Announcement[]>([])
  const [readIds, setReadIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [composing, setComposing] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const refresh = useCallback(async () => {
    const { announcements, readIds } = await loadAnnouncements(program.id)
    setItems(announcements)
    setReadIds(readIds)
    return announcements
  }, [program.id])

  useEffect(() => {
    let active = true
    ;(async () => {
      const { announcements, readIds } = await loadAnnouncements(program.id)
      if (!active) return
      setItems(announcements)
      setReadIds(readIds)
      setLoading(false)

      // Having it on screen is what counts as reading it. The receipts go in
      // after the render so the "new" markers are visible for this pass and
      // gone the next time they come back.
      const unread = announcements
        .filter((a) => !readIds.has(a.id) && a.author_id !== userId)
        .map((a) => a.id)
      if (unread.length > 0) {
        await markRead(unread)
        await onUnreadChanged()
      }
    })()
    return () => {
      active = false
    }
  }, [program.id, userId, onUnreadChanged])

  const nameFor = (authorId: string | null) =>
    members.find((m) => m.user_id === authorId)?.display_name ?? 'Staff'

  const canManage = (a: Announcement) => (staff && a.author_id === userId) || orgLeader

  async function handlePost(input: { title: string; body: string; pinned: boolean }) {
    setError('')
    const result = await postAnnouncement(program.id, input)
    if (!result.ok) {
      setError(result.message)
      return false
    }
    setNotice(result.message)
    setComposing(false)
    await refresh()
    return true
  }

  if (loading) return <p className="font-body text-sm text-muted">Loading announcements…</p>

  return (
    <section className="mb-10">
      <div className="flex items-baseline justify-between gap-4">
        <h3 className="font-body text-xs font-medium uppercase tracking-[0.22em] text-muted">
          Announcements
          {items.length > 0 && <span className="ml-2 text-muted/60">{items.length}</span>}
        </h3>
        {staff && (
          <button
            type="button"
            onClick={() => {
              setComposing((v) => !v)
              setNotice('')
            }}
            className="font-body text-xs uppercase tracking-wider text-muted underline underline-offset-4 transition hover:text-accent"
          >
            {composing ? 'Close' : '+ Post an announcement'}
          </button>
        )}
      </div>

      {composing && <Composer onSubmit={handlePost} error={error} />}
      {notice && !composing && <p className="mt-3 font-body text-sm text-good">{notice}</p>}

      {items.length === 0 ? (
        <div className="mt-3">
          <EmptyState
            Icon={RosterIcon}
            title={staff ? 'Nothing posted yet' : 'No news yet'}
            line={
              staff
                ? 'Anything you post reaches every family on the roster and sends them a notification.'
                : 'Team news and changes from your coaches show up here, and you get a notification when they do.'
            }
          />
        </div>
      ) : (
        <ul className="mt-3 space-y-3">
          {items.map((a) => (
            <li key={a.id}>
              {editingId === a.id ? (
                <Composer
                  initial={a}
                  onSubmit={async (input) => {
                    const result = await editAnnouncement(a.id, input)
                    if (!result.ok) {
                      setError(result.message)
                      return false
                    }
                    setEditingId(null)
                    await refresh()
                    return true
                  }}
                  onCancel={() => setEditingId(null)}
                  error={error}
                />
              ) : (
                <article
                  className={`rounded-xl border bg-surface px-5 py-4 ${
                    a.pinned ? 'border-accent/50' : 'border-border'
                  }`}
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <h4 className="font-display text-base font-semibold text-ink">
                      {!readIds.has(a.id) && a.author_id !== userId && (
                        <span
                          aria-label="Unread"
                          className="mr-2 inline-block h-2 w-2 rounded-full bg-accent align-middle"
                        />
                      )}
                      {a.title}
                    </h4>
                    {a.pinned && (
                      <span className="rounded-full border border-accent/50 px-2 py-0.5 font-body text-[0.65rem] uppercase tracking-wider text-accent">
                        Pinned
                      </span>
                    )}
                  </div>

                  <p className="mt-2 whitespace-pre-wrap font-body text-sm leading-relaxed text-ink/90">
                    {a.body}
                  </p>

                  <p className="mt-3 font-mono text-[0.7rem] uppercase tracking-wider text-muted">
                    {nameFor(a.author_id)} · {whenPosted(a.created_at)}
                    {a.edited_at && ' · edited'}
                  </p>

                  {canManage(a) && (
                    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-border pt-3">
                      <Action onClick={() => { setEditingId(a.id); setError('') }}>Edit</Action>
                      <Action
                        onClick={async () => {
                          await setPinned(a.id, !a.pinned)
                          await refresh()
                        }}
                      >
                        {a.pinned ? 'Unpin' : 'Pin to top'}
                      </Action>
                      <Action
                        onClick={async () => {
                          const result = await deleteAnnouncement(a.id)
                          if (!result.ok) setError(result.message)
                          await refresh()
                          await onUnreadChanged()
                        }}
                      >
                        Delete
                      </Action>
                    </div>
                  )}
                </article>
              )}
            </li>
          ))}
        </ul>
      )}
      {error && !composing && editingId === null && (
        <div className="mt-3">
          <ErrorNote>{error}</ErrorNote>
        </div>
      )}
    </section>
  )
}

function Action({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="font-body text-xs uppercase tracking-wider text-muted underline underline-offset-4 transition hover:text-accent"
    >
      {children}
    </button>
  )
}

function Composer({
  initial,
  onSubmit,
  onCancel,
  error,
}: {
  initial?: Announcement
  onSubmit: (input: { title: string; body: string; pinned: boolean }) => Promise<boolean>
  onCancel?: () => void
  error: string
}) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [body, setBody] = useState(initial?.body ?? '')
  const [pinned, setPinnedState] = useState(initial?.pinned ?? false)
  const [busy, setBusy] = useState(false)

  return (
    <div className="mt-3 rounded-xl border border-border bg-surface p-5">
      <Field
        label="Title"
        name="title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Practice moved to Thursday"
      />
      <div className="mt-4">
        <TextArea
          label="Message"
          name="body"
          rows={4}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="What everyone needs to know."
          hint="Goes to every family on this roster, and sends a notification."
        />
      </div>
      {!initial && (
        <label className="mt-4 flex items-center gap-3 font-body text-sm text-muted">
          <input
            type="checkbox"
            checked={pinned}
            onChange={(e) => setPinnedState(e.target.checked)}
            className="h-4 w-4 accent-accent"
          />
          Keep this at the top
        </label>
      )}

      <div className="mt-4">
        <ErrorNote>{error}</ErrorNote>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-4">
        <span className="w-full sm:w-auto">
          <Button
            onClick={async () => {
              setBusy(true)
              await onSubmit({ title, body, pinned })
              setBusy(false)
            }}
            disabled={busy || !title.trim() || !body.trim()}
          >
            {busy ? 'Posting…' : initial ? 'Save changes' : 'Post & Notify'}
          </Button>
        </span>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="font-body text-sm text-muted underline underline-offset-4 transition hover:text-ink"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  )
}
