import { useCallback, useEffect, useState } from 'react'
import { EquipmentFields } from '../components/EquipmentFields'
import { MemberPicker } from '../components/MemberPicker'
import { Button, ErrorNote } from '../components/ui'
import { useProgram } from '../lib/programContext'
import { ROLE_LABEL, isStaff, type Member } from '../lib/roster'
import {
  EMPTY_ITEM,
  availableCount,
  checkIn,
  checkOut,
  createItem,
  deleteItem,
  formatDateOnly,
  formatSince,
  loadEquipment,
  outstanding,
  updateItem,
  type Checkout,
  type EquipmentItem,
  type ItemInput,
} from '../lib/equipment'

export default function EquipmentPage() {
  const { program, role, memberId } = useProgram()
  const staff = isStaff(role)

  const [items, setItems] = useState<EquipmentItem[]>([])
  const [checkouts, setCheckouts] = useState<Checkout[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [view, setView] = useState<'inventory' | 'people'>('inventory')
  const [adding, setAdding] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    const { items, checkouts, members, error } = await loadEquipment(program.id)
    setItems(items)
    setCheckouts(checkouts)
    setMembers(members)
    if (error) setError(error)
  }, [program.id])

  useEffect(() => {
    let active = true
    ;(async () => {
      await refresh()
      if (active) setLoading(false)
    })()
    return () => {
      active = false
    }
  }, [refresh])

  if (loading) return <p className="font-body text-muted">Loading…</p>

  // A player's copy of this data is already only their own gear, because the
  // policies filtered it on the way out.
  if (!staff) return <MyEquipment items={items} checkouts={checkouts} memberId={memberId} />

  const open = outstanding(checkouts)

  return (
    <div>
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="font-display text-2xl font-bold uppercase tracking-tight text-ink">
          Equipment
        </h2>
        <span className="font-body text-sm text-muted">
          {items.length} {items.length === 1 ? 'item' : 'items'}
        </span>
      </div>
      <p className="mt-2 font-body text-sm text-muted">
        What the program owns and who is holding it. Separate from the packing list on a
        game day.
      </p>

      <div className="mt-6 flex gap-2">
        {(
          [
            ['inventory', 'Inventory'],
            ['people', 'By person'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setView(key)}
            aria-pressed={view === key}
            className={`rounded-full border px-4 py-2 font-body text-sm transition ${
              view === key
                ? 'border-accent bg-accent/20 font-semibold text-ink'
                : 'border-border text-muted hover:border-accent/50 hover:text-ink'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <ErrorNote>{error}</ErrorNote>

      {view === 'inventory' ? (
        <>
          {adding ? (
            <ItemForm
              title="Add equipment"
              initial={EMPTY_ITEM}
              submitLabel="Add Item"
              onCancel={() => setAdding(false)}
              onSubmit={async (values) => {
                const result = await createItem(program.id, values)
                if (result.ok && result.item) {
                  const added = result.item
                  setItems((current) =>
                    [...current, added].sort((a, b) => a.name.localeCompare(b.name)),
                  )
                  setAdding(false)
                }
                return result
              }}
            />
          ) : (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="mt-6 w-full rounded-xl border border-dashed border-border px-5 py-4 font-body text-sm text-muted transition hover:border-accent hover:text-ink"
            >
              + Add equipment
            </button>
          )}

          <Inventory
            items={items}
            checkouts={checkouts}
            members={members}
            programId={program.id}
            setItems={setItems}
            setCheckouts={setCheckouts}
          />
        </>
      ) : (
        <ByPerson items={items} open={open} members={members} setCheckouts={setCheckouts} />
      )}
    </div>
  )
}

// ------------------------------------------------------- the roster's view ----

function MyEquipment({
  items,
  checkouts,
  memberId,
}: {
  items: EquipmentItem[]
  checkouts: Checkout[]
  memberId: string | null
}) {
  const byId = new Map(items.map((i) => [i.id, i]))
  const mine = outstanding(checkouts).filter((c) => c.member_id === memberId)
  const returned = checkouts.filter((c) => c.member_id === memberId && c.returned_at !== null)

  return (
    <div>
      <h2 className="font-display text-2xl font-bold uppercase tracking-tight text-ink">
        Your equipment
      </h2>
      <p className="mt-2 font-body text-sm text-muted">
        What the program has checked out to you. Your coach hands it out and takes it back.
      </p>

      {mine.length === 0 ? (
        <p className="mt-6 rounded-xl border border-border bg-surface px-4 py-6 text-center font-body text-sm text-muted">
          You are not holding any team equipment.
        </p>
      ) : (
        <ul className="mt-6 divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
          {mine.map((c) => {
            const item = byId.get(c.equipment_item_id)
            return (
              <li key={c.id} className="px-4 py-3.5">
                <p className="font-body text-base font-medium text-ink">
                  {item?.name ?? 'Equipment'}
                  {c.quantity > 1 && <span className="text-muted"> × {c.quantity}</span>}
                </p>
                <p className="mt-1 font-mono text-[0.7rem] uppercase tracking-wider text-muted/70">
                  {item?.category} · since {formatSince(c.checked_out_at)}
                </p>
                {c.notes && <p className="mt-1 font-body text-sm text-muted">{c.notes}</p>}
              </li>
            )
          })}
        </ul>
      )}

      {returned.length > 0 && (
        <section className="mt-10">
          <h3 className="font-body text-xs font-medium uppercase tracking-[0.22em] text-muted">
            Returned
            <span className="ml-2 text-muted/60">{returned.length}</span>
          </h3>
          <ul className="mt-3 divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
            {returned.map((c) => (
              <li key={c.id} className="px-4 py-3">
                <p className="font-body text-sm text-muted line-through">
                  {byId.get(c.equipment_item_id)?.name ?? 'Equipment'}
                </p>
                <p className="mt-0.5 font-mono text-[0.7rem] uppercase tracking-wider text-muted/70">
                  Returned {c.returned_at && formatSince(c.returned_at)}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

// ------------------------------------------------------------- inventory ----

function Inventory({
  items,
  checkouts,
  members,
  programId,
  setItems,
  setCheckouts,
}: {
  items: EquipmentItem[]
  checkouts: Checkout[]
  members: Member[]
  programId: string
  setItems: (updater: (current: EquipmentItem[]) => EquipmentItem[]) => void
  setCheckouts: (updater: (current: Checkout[]) => Checkout[]) => void
}) {
  if (items.length === 0) {
    return (
      <p className="mt-6 rounded-xl border border-border bg-surface px-4 py-6 text-center font-body text-sm text-muted">
        No equipment logged yet. Add your first item above.
      </p>
    )
  }

  const categories = [...new Set(items.map((i) => i.category))].sort()

  return (
    <div className="mt-8 space-y-8">
      {categories.map((category) => (
        <div key={category}>
          <h3 className="font-body text-xs font-medium uppercase tracking-[0.22em] text-muted">
            {category}
            <span className="ml-2 text-muted/60">
              {items.filter((i) => i.category === category).length}
            </span>
          </h3>
          <ul className="mt-3 space-y-3">
            {items
              .filter((i) => i.category === category)
              .map((item) => (
                <ItemCard
                  key={item.id}
                  item={item}
                  checkouts={checkouts}
                  members={members}
                  programId={programId}
                  setItems={setItems}
                  setCheckouts={setCheckouts}
                />
              ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

function ItemCard({
  item,
  checkouts,
  members,
  programId,
  setItems,
  setCheckouts,
}: {
  item: EquipmentItem
  checkouts: Checkout[]
  members: Member[]
  programId: string
  setItems: (updater: (current: EquipmentItem[]) => EquipmentItem[]) => void
  setCheckouts: (updater: (current: Checkout[]) => Checkout[]) => void
}) {
  const [mode, setMode] = useState<'idle' | 'edit' | 'checkout'>('idle')
  const [error, setError] = useState('')

  const byId = new Map(members.map((m) => [m.id, m]))
  const open = outstanding(checkouts).filter((c) => c.equipment_item_id === item.id)
  const available = availableCount(item, checkouts)

  async function handleCheckIn(checkout: Checkout) {
    setError('')
    const result = await checkIn(checkout.id)
    if (!result.ok || !result.checkout) {
      setError(result.message)
      return
    }
    const updated = result.checkout
    setCheckouts((current) => current.map((c) => (c.id === updated.id ? updated : c)))
  }

  async function handleDelete() {
    setError('')
    const result = await deleteItem(item.id)
    if (!result.ok) {
      setError(result.message)
      return
    }
    setItems((current) => current.filter((i) => i.id !== item.id))
  }

  if (mode === 'edit') {
    return (
      <li>
        <ItemForm
          title={`Edit ${item.name}`}
          submitLabel="Save Changes"
          initial={{
            name: item.name,
            category: item.category,
            totalQuantity: String(item.total_quantity),
            condition: item.condition ?? '',
            purchaseDate: item.purchase_date ?? '',
          }}
          onCancel={() => setMode('idle')}
          onSubmit={async (values) => {
            const result = await updateItem(item.id, values)
            if (result.ok && result.item) {
              const updated = result.item
              setItems((current) =>
                current
                  .map((i) => (i.id === updated.id ? updated : i))
                  .sort((a, b) => a.name.localeCompare(b.name)),
              )
              setMode('idle')
            }
            return result
          }}
        />
      </li>
    )
  }

  return (
    <li className="rounded-xl border border-border bg-surface px-5 py-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-body text-base font-medium text-ink">{item.name}</p>
          <p className="mt-1 font-mono text-[0.7rem] uppercase tracking-wider text-muted/70">
            {available} of {item.total_quantity} available
            {item.purchase_date && ` · bought ${formatDateOnly(item.purchase_date)}`}
          </p>
          {item.condition && (
            <p className="mt-1 font-body text-sm text-muted">{item.condition}</p>
          )}
        </div>
        <span
          className={`shrink-0 whitespace-nowrap rounded-full border px-2.5 py-0.5 font-body text-[0.7rem] uppercase tracking-wider ${
            available === 0
              ? 'border-accent bg-accent/15 text-ink'
              : 'border-border text-muted'
          }`}
        >
          {available === 0 ? 'All out' : `${available} in`}
        </span>
      </div>

      {open.length > 0 && (
        <ul className="mt-3 space-y-2 border-t border-border pt-3">
          {open.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3">
              <span className="min-w-0 font-body text-sm text-ink">
                {byId.get(c.member_id)?.display_name ?? 'Someone'}
                {c.quantity > 1 && <span className="text-muted"> × {c.quantity}</span>}
                <span className="ml-2 font-mono text-[0.7rem] uppercase tracking-wider text-muted/70">
                  since {formatSince(c.checked_out_at)}
                </span>
              </span>
              <button
                type="button"
                onClick={() => handleCheckIn(c)}
                className="shrink-0 rounded-full border border-border px-3 py-1 font-body text-xs uppercase tracking-wider text-muted transition hover:border-accent hover:text-ink"
              >
                Check in
              </button>
            </li>
          ))}
        </ul>
      )}

      {error && <div className="mt-3"><ErrorNote>{error}</ErrorNote></div>}

      {mode === 'checkout' ? (
        <CheckOutForm
          item={item}
          available={available}
          members={members}
          programId={programId}
          onCancel={() => setMode('idle')}
          onDone={(checkout) => {
            setCheckouts((current) => [checkout, ...current])
            setMode('idle')
          }}
        />
      ) : (
        <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">
          <button
            type="button"
            onClick={() => setMode('checkout')}
            disabled={available === 0}
            className="rounded-full border border-border px-3 py-1.5 font-body text-xs uppercase tracking-wider text-muted transition hover:border-accent hover:text-ink disabled:opacity-40"
          >
            Check out
          </button>
          <button
            type="button"
            onClick={() => setMode('edit')}
            className="rounded-full border border-border px-3 py-1.5 font-body text-xs uppercase tracking-wider text-muted transition hover:border-accent hover:text-ink"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={handleDelete}
            className="rounded-full border border-border px-3 py-1.5 font-body text-xs uppercase tracking-wider text-muted transition hover:border-accent hover:text-accent"
          >
            Delete
          </button>
        </div>
      )}
    </li>
  )
}

function CheckOutForm({
  item,
  available,
  members,
  programId,
  onCancel,
  onDone,
}: {
  item: EquipmentItem
  available: number
  members: Member[]
  programId: string
  onCancel: () => void
  onDone: (checkout: Checkout) => void
}) {
  const [memberId, setMemberId] = useState<string | null>(null)
  const [quantity, setQuantity] = useState('1')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit() {
    if (!memberId) return
    setBusy(true)
    setError('')
    const result = await checkOut({
      programId,
      itemId: item.id,
      memberId,
      quantity: Number(quantity) || 1,
      notes,
    })
    setBusy(false)
    if (!result.ok || !result.checkout) {
      setError(result.message)
      return
    }
    onDone(result.checkout)
  }

  return (
    <div className="mt-3 space-y-4 border-t border-border pt-4">
      <div className="flex items-baseline justify-between gap-4">
        <h4 className="font-display text-sm font-semibold uppercase tracking-wide text-ink">
          Check out {item.name}
        </h4>
        <button
          type="button"
          onClick={onCancel}
          className="font-body text-xs uppercase tracking-wider text-muted transition hover:text-ink"
        >
          Cancel
        </button>
      </div>

      <MemberPicker
        label="To"
        members={members}
        selectedIds={memberId ? [memberId] : []}
        onToggle={(id) => setMemberId((current) => (current === id ? null : id))}
      />

      {available > 1 && (
        <label htmlFor={`qty-${item.id}`} className="block">
          <span className="font-body text-xs font-medium uppercase tracking-[0.18em] text-muted">
            How many ({available} available)
          </span>
          <input
            id={`qty-${item.id}`}
            type="number"
            min={1}
            max={available}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className="mt-2 w-full rounded-lg border border-border bg-bg px-4 py-2.5 font-body text-base text-ink transition focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/40"
          />
        </label>
      )}

      <label htmlFor={`notes-${item.id}`} className="block">
        <span className="font-body text-xs font-medium uppercase tracking-[0.18em] text-muted">
          Note
        </span>
        <input
          id={`notes-${item.id}`}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Optional. Size L, small crack on the left."
          maxLength={200}
          className="mt-2 w-full rounded-lg border border-border bg-bg px-4 py-2.5 font-body text-base text-ink placeholder:text-muted/60 transition focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/40"
        />
      </label>

      <ErrorNote>{error}</ErrorNote>

      <Button onClick={handleSubmit} disabled={busy || !memberId}>
        {busy ? 'Checking out…' : 'Check Out'}
      </Button>
    </div>
  )
}

function ItemForm({
  title,
  initial,
  submitLabel,
  onCancel,
  onSubmit,
}: {
  title: string
  initial: ItemInput
  submitLabel: string
  onCancel: () => void
  onSubmit: (values: ItemInput) => Promise<{ ok: boolean; message: string }>
}) {
  const [values, setValues] = useState<ItemInput>(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const patch = (next: Partial<ItemInput>) => setValues((current) => ({ ...current, ...next }))

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    const result = await onSubmit(values)
    setBusy(false)
    if (!result.ok) setError(result.message)
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-6 space-y-5 rounded-xl border border-border bg-surface px-5 py-6"
    >
      <div className="flex items-baseline justify-between gap-4">
        <h3 className="font-display text-base font-semibold uppercase tracking-wide text-ink">
          {title}
        </h3>
        <button
          type="button"
          onClick={onCancel}
          className="font-body text-xs uppercase tracking-wider text-muted transition hover:text-ink"
        >
          Cancel
        </button>
      </div>

      <EquipmentFields values={values} onChange={patch} idPrefix={`${title}-`} />

      <ErrorNote>{error}</ErrorNote>

      <Button type="submit" disabled={busy}>
        {busy ? 'Saving…' : submitLabel}
      </Button>
    </form>
  )
}

// ------------------------------------------------------------- by person ----

/** "Who still has a helmet" -- the same data keyed by person instead of item. */
function ByPerson({
  items,
  open,
  members,
  setCheckouts,
}: {
  items: EquipmentItem[]
  open: Checkout[]
  members: Member[]
  setCheckouts: (updater: (current: Checkout[]) => Checkout[]) => void
}) {
  const [error, setError] = useState('')
  const itemsById = new Map(items.map((i) => [i.id, i]))
  const holders = members.filter((m) => open.some((c) => c.member_id === m.id))

  async function handleCheckIn(checkout: Checkout) {
    setError('')
    const result = await checkIn(checkout.id)
    if (!result.ok || !result.checkout) {
      setError(result.message)
      return
    }
    const updated = result.checkout
    setCheckouts((current) => current.map((c) => (c.id === updated.id ? updated : c)))
  }

  if (holders.length === 0) {
    return (
      <p className="mt-8 rounded-xl border border-border bg-surface px-4 py-6 text-center font-body text-sm text-muted">
        Nobody is holding any equipment right now.
      </p>
    )
  }

  return (
    <div className="mt-8">
      <p className="font-body text-sm text-muted">
        {holders.length} {holders.length === 1 ? 'person has' : 'people have'} equipment out.
      </p>
      {error && <div className="mt-3"><ErrorNote>{error}</ErrorNote></div>}

      <ul className="mt-4 space-y-3">
        {holders.map((m) => {
          const theirs = open.filter((c) => c.member_id === m.id)
          return (
            <li key={m.id} className="rounded-xl border border-border bg-surface px-5 py-4">
              <div className="flex items-baseline justify-between gap-3">
                <p className="font-body text-base font-medium text-ink">{m.display_name}</p>
                <span className="shrink-0 whitespace-nowrap rounded-full border border-border px-2.5 py-0.5 font-body text-[0.7rem] uppercase tracking-wider text-muted">
                  {ROLE_LABEL[m.role] ?? m.role}
                </span>
              </div>

              <ul className="mt-3 space-y-2 border-t border-border pt-3">
                {theirs.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-3">
                    <span className="min-w-0 font-body text-sm text-ink">
                      {itemsById.get(c.equipment_item_id)?.name ?? 'Equipment'}
                      {c.quantity > 1 && <span className="text-muted"> × {c.quantity}</span>}
                      <span className="ml-2 font-mono text-[0.7rem] uppercase tracking-wider text-muted/70">
                        since {formatSince(c.checked_out_at)}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCheckIn(c)}
                      className="shrink-0 rounded-full border border-border px-3 py-1 font-body text-xs uppercase tracking-wider text-muted transition hover:border-accent hover:text-ink"
                    >
                      Check in
                    </button>
                  </li>
                ))}
              </ul>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
