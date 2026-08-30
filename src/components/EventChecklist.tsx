import { useCallback, useEffect, useState } from 'react'
import { MemberPicker } from './MemberPicker'
import { Button, ErrorNote } from './ui'
import type { Member } from '../lib/roster'
import {
  STARTER_ITEMS,
  addItem,
  applyTemplate,
  deleteItem,
  deleteTemplate,
  formatStamp,
  listTemplates,
  saveTemplate,
  toggleItem,
  type ListItem,
  type ListKind,
  type ListTemplate,
} from '../lib/gameday'

/**
 * One of an event's two checkable lists.
 *
 * The to-do list and the equipment list behave identically -- add, assign,
 * tick, template -- so they share this component and differ only in wording
 * and which table they write to.
 */
export function EventChecklist({
  kind,
  title,
  blurb,
  addPlaceholder,
  items,
  setItems,
  members,
  eventId,
  programId,
  staff,
  memberId,
  userId,
}: {
  kind: ListKind
  title: string
  blurb: string
  addPlaceholder: string
  items: ListItem[]
  setItems: (updater: (current: ListItem[]) => ListItem[]) => void
  members: Member[]
  eventId: string
  programId: string
  staff: boolean
  memberId: string | null
  userId: string | null
}) {
  const [label, setLabel] = useState('')
  const [assignee, setAssignee] = useState<string | null>(null)
  const [showAssign, setShowAssign] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const done = items.filter((i) => i.done_at !== null).length
  const byMemberId = new Map(members.map((m) => [m.id, m]))
  const byUserId = new Map(members.map((m) => [m.user_id, m]))

  async function handleAdd(text: string) {
    setBusy(true)
    setError('')
    const position = items.length === 0 ? 0 : Math.max(...items.map((i) => i.position)) + 1
    const result = await addItem(kind, {
      eventId,
      programId,
      label: text,
      assignedMemberId: assignee,
      position,
    })
    setBusy(false)
    if (!result.ok || !result.item) {
      setError(result.message)
      return
    }
    const added = result.item
    setItems((current) => [...current, added])
    setLabel('')
    setAssignee(null)
    setShowAssign(false)
  }

  async function handleToggle(item: ListItem) {
    setError('')
    const result = await toggleItem(kind, item, userId)
    if (!result.ok || !result.item) {
      setError(result.message)
      return
    }
    const updated = result.item
    setItems((current) => current.map((i) => (i.id === updated.id ? updated : i)))
  }

  async function handleDelete(item: ListItem) {
    setError('')
    const result = await deleteItem(kind, item.id)
    if (!result.ok) {
      setError(result.message)
      return
    }
    setItems((current) => current.filter((i) => i.id !== item.id))
  }

  return (
    <section className="mt-12">
      <div className="flex items-baseline justify-between gap-4">
        <h3 className="font-display text-xl font-semibold uppercase tracking-wide text-ink">
          {title}
        </h3>
        {items.length > 0 && (
          <span className="font-mono text-xs uppercase tracking-wider text-muted">
            {done}/{items.length} done
          </span>
        )}
      </div>
      <p className="mt-2 font-body text-sm text-muted">{blurb}</p>

      {staff && (
        <TemplateBar
          kind={kind}
          items={items}
          eventId={eventId}
          programId={programId}
          onApplied={(added) => setItems((current) => [...current, ...added])}
        />
      )}

      {items.length === 0 ? (
        <div className="mt-4 rounded-xl border border-border bg-surface px-4 py-5">
          <p className="font-body text-sm text-muted">Nothing on this list yet.</p>
          {staff && (
            <div className="mt-3 flex flex-wrap gap-2">
              {STARTER_ITEMS[kind].map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  disabled={busy}
                  onClick={() => handleAdd(suggestion)}
                  className="rounded-full border border-border px-3 py-1.5 font-body text-xs text-muted transition hover:border-accent hover:text-ink disabled:opacity-50"
                >
                  + {suggestion}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <ul className="mt-4 divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
          {items.map((item) => {
            const assigned = item.assigned_member_id
              ? byMemberId.get(item.assigned_member_id)
              : undefined
            const finisher = item.done_by ? byUserId.get(item.done_by) : undefined
            const mine = item.assigned_member_id !== null && item.assigned_member_id === memberId
            const canTick = staff || mine

            return (
              <li key={item.id} className="flex items-start gap-3 px-4 py-3.5">
                <button
                  type="button"
                  onClick={() => handleToggle(item)}
                  disabled={!canTick}
                  aria-pressed={item.done_at !== null}
                  aria-label={`${item.done_at ? 'Uncheck' : 'Check off'} ${item.label}`}
                  title={canTick ? undefined : 'Only a coach or the person assigned can check this off'}
                  className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded border transition ${
                    item.done_at !== null
                      ? 'border-accent bg-accent text-ink'
                      : 'border-border bg-bg text-transparent'
                  } ${canTick ? 'hover:border-accent' : 'cursor-not-allowed opacity-60'}`}
                >
                  <span aria-hidden="true" className="text-xs font-bold leading-none">
                    ✓
                  </span>
                </button>

                <div className="min-w-0 flex-1">
                  <p
                    className={`font-body text-base ${
                      item.done_at !== null ? 'text-muted line-through' : 'text-ink'
                    }`}
                  >
                    {item.label}
                  </p>

                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                    {assigned && (
                      <span className="inline-flex rounded-full border border-accent/40 bg-accent/10 px-2 py-0.5 font-body text-xs text-ink">
                        {assigned.display_name}
                        {mine && ' (you)'}
                      </span>
                    )}
                    {item.done_at && (
                      <span className="font-mono text-[0.7rem] uppercase tracking-wider text-muted/70">
                        {finisher ? `${finisher.display_name} · ` : ''}
                        {formatStamp(item.done_at)}
                      </span>
                    )}
                  </div>
                </div>

                {staff && (
                  <button
                    type="button"
                    onClick={() => handleDelete(item)}
                    aria-label={`Remove ${item.label}`}
                    className="shrink-0 font-body text-sm text-muted transition hover:text-accent"
                  >
                    ×
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {error && <div className="mt-3"><ErrorNote>{error}</ErrorNote></div>}

      {staff && (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (label.trim()) handleAdd(label)
          }}
          className="mt-4 space-y-3"
        >
          <div className="flex gap-2">
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={addPlaceholder}
              maxLength={100}
              aria-label={`Add to ${title}`}
              className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-4 py-2.5 font-body text-base text-ink placeholder:text-muted/60 transition focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/40"
            />
            <button
              type="submit"
              disabled={busy || !label.trim()}
              className="shrink-0 rounded-lg bg-accent px-5 py-2.5 font-body text-sm font-semibold text-ink transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Add
            </button>
          </div>

          <button
            type="button"
            onClick={() => setShowAssign((v) => !v)}
            className="font-body text-xs uppercase tracking-wider text-muted transition hover:text-ink"
          >
            {assignee
              ? `Assigned to ${byMemberId.get(assignee)?.display_name} — change`
              : showAssign
                ? 'Hide'
                : '+ Assign this to someone'}
          </button>

          {showAssign && (
            <MemberPicker
              label="Assign to"
              members={members}
              selectedIds={assignee ? [assignee] : []}
              onToggle={(id) => setAssignee((current) => (current === id ? null : id))}
            />
          )}
        </form>
      )}
    </section>
  )
}

// ---------------------------------------------------------------- templates ----

function TemplateBar({
  kind,
  items,
  eventId,
  programId,
  onApplied,
}: {
  kind: ListKind
  items: ListItem[]
  eventId: string
  programId: string
  onApplied: (items: ListItem[]) => void
}) {
  const [templates, setTemplates] = useState<ListTemplate[]>([])
  const [mode, setMode] = useState<'idle' | 'save' | 'use'>('idle')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  const refresh = useCallback(
    () => listTemplates(programId, kind).then(setTemplates),
    [programId, kind],
  )
  useEffect(() => {
    refresh()
  }, [refresh])

  async function handleSave() {
    setBusy(true)
    setError('')
    setNotice('')
    const result = await saveTemplate({ programId, kind, name, items })
    setBusy(false)
    if (!result.ok) {
      setError(result.message)
      return
    }
    setNotice(result.message)
    setName('')
    setMode('idle')
    refresh()
  }

  async function handleApply(template: ListTemplate) {
    setBusy(true)
    setError('')
    setNotice('')
    const startPosition = items.length === 0 ? 0 : Math.max(...items.map((i) => i.position)) + 1
    const result = await applyTemplate({
      kind,
      templateId: template.id,
      eventId,
      programId,
      startPosition,
    })
    setBusy(false)
    if (!result.ok) {
      setError(result.message)
      return
    }
    onApplied(result.items)
    setNotice(result.message)
    setMode('idle')
  }

  async function handleDelete(template: ListTemplate) {
    await deleteTemplate(template.id)
    refresh()
  }

  return (
    <div className="mt-4">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setMode((m) => (m === 'save' ? 'idle' : 'save'))}
          disabled={items.length === 0}
          className="rounded-full border border-border px-3 py-1.5 font-body text-xs uppercase tracking-wider text-muted transition hover:border-accent hover:text-ink disabled:opacity-40"
        >
          Save as template
        </button>
        <button
          type="button"
          onClick={() => setMode((m) => (m === 'use' ? 'idle' : 'use'))}
          disabled={templates.length === 0}
          className="rounded-full border border-border px-3 py-1.5 font-body text-xs uppercase tracking-wider text-muted transition hover:border-accent hover:text-ink disabled:opacity-40"
        >
          {templates.length === 0 ? 'No templates yet' : `Use a template (${templates.length})`}
        </button>
      </div>

      {mode === 'save' && (
        <div className="mt-3 rounded-lg border border-border bg-surface px-4 py-4">
          <label htmlFor={`tpl-${kind}`} className="block">
            <span className="font-body text-xs font-medium uppercase tracking-[0.18em] text-muted">
              Template name
            </span>
            <input
              id={`tpl-${kind}`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Standard home game"
              maxLength={60}
              className="mt-2 w-full rounded-lg border border-border bg-bg px-4 py-2.5 font-body text-base text-ink placeholder:text-muted/60 transition focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/40"
            />
          </label>
          <p className="mt-2 font-body text-xs text-muted">
            Saves the {items.length} item{items.length === 1 ? '' : 's'} on this list. Names only —
            not who is assigned or what is already ticked.
          </p>
          <div className="mt-3">
            <Button onClick={handleSave} disabled={busy || !name.trim()}>
              {busy ? 'Saving…' : 'Save Template'}
            </Button>
          </div>
        </div>
      )}

      {mode === 'use' && (
        <ul className="mt-3 divide-y divide-border overflow-hidden rounded-lg border border-border">
          {templates.map((template) => (
            <li key={template.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <button
                type="button"
                disabled={busy}
                onClick={() => handleApply(template)}
                className="min-w-0 flex-1 text-left font-body text-sm text-ink transition hover:text-accent disabled:opacity-50"
              >
                {template.name}
              </button>
              <button
                type="button"
                onClick={() => handleDelete(template)}
                aria-label={`Delete template ${template.name}`}
                className="shrink-0 font-body text-xs uppercase tracking-wider text-muted transition hover:text-accent"
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}

      {notice && !error && <p className="mt-3 font-body text-sm text-muted">{notice}</p>}
      {error && <div className="mt-3"><ErrorNote>{error}</ErrorNote></div>}
    </div>
  )
}
