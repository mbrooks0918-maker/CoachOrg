import { useMemo, useState } from 'react'
import type { Member } from '../lib/roster'

/**
 * Search-and-select list of members.
 *
 * Used single-select by the roster's linking tool and multi-select by the join
 * flow, where a parent may have more than one child on the team.
 */
export function MemberPicker({
  label,
  members,
  selectedIds,
  onToggle,
  placeholder = 'Search by name',
  emptyText = 'Nobody to choose from yet.',
}: {
  label: string
  members: Member[]
  selectedIds: string[]
  onToggle: (id: string) => void
  placeholder?: string
  emptyText?: string
}) {
  const [query, setQuery] = useState('')

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return members
    return members.filter((m) => m.display_name.toLowerCase().includes(q))
  }, [members, query])

  const inputId = `picker-${label.replace(/\W+/g, '-').toLowerCase()}`

  return (
    <div>
      <label htmlFor={inputId} className="block">
        <span className="font-body text-xs font-medium uppercase tracking-[0.18em] text-muted">
          {label}
        </span>
        <input
          id={inputId}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          autoComplete="off"
          className="mt-2 w-full rounded-lg border border-border bg-bg px-4 py-2.5 font-body text-base text-ink placeholder:text-muted/60 transition focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/40"
        />
      </label>

      {members.length === 0 ? (
        <p className="mt-3 font-body text-sm text-muted/70">{emptyText}</p>
      ) : (
        <ul className="mt-3 max-h-52 divide-y divide-border overflow-y-auto rounded-lg border border-border">
          {matches.length === 0 && (
            <li className="px-4 py-3 font-body text-sm text-muted/70">No names match “{query}”.</li>
          )}
          {matches.map((m) => {
            const selected = selectedIds.includes(m.id)
            return (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => onToggle(m.id)}
                  aria-pressed={selected}
                  className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left font-body text-sm transition ${
                    selected
                      ? 'bg-accent/20 font-semibold text-ink'
                      : 'text-muted hover:bg-accent/10 hover:text-ink'
                  }`}
                >
                  <span>{m.display_name}</span>
                  {selected && (
                    <span aria-hidden="true" className="font-mono text-xs text-accent">
                      SELECTED
                    </span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
