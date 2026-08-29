import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { CODE_TYPES } from '../lib/codes'
import { CodeTile } from '../components/ui'

type Program = { id: string; name: string; sport: string }
type Code = { id: string; code: string; code_type: string }
type Member = {
  id: string
  display_name: string
  role: string
  phone_number: string | null
}

/** Display order of the roster. Assistants and managers share a section. */
const ROLE_GROUPS = [
  { title: 'Head Coach', roles: ['head_coach'] },
  { title: 'Assistant Coaches & Managers', roles: ['assistant_coach', 'team_manager'] },
  { title: 'Players', roles: ['player'] },
  { title: 'Parents', roles: ['parent'] },
] as const

const ROLE_LABEL: Record<string, string> = {
  head_coach: 'Head Coach',
  assistant_coach: 'Assistant Coach',
  team_manager: 'Team Manager',
  parent: 'Parent',
  player: 'Player',
}

export default function ProgramDashboard() {
  const { programId } = useParams<{ programId: string }>()
  const [program, setProgram] = useState<Program | null>(null)
  const [codes, setCodes] = useState<Code[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!programId) return
    let active = true

    ;(async () => {
      const [programResult, codesResult, membersResult] = await Promise.all([
        supabase.from('programs').select('id, name, sport').eq('id', programId).single(),
        supabase.from('program_codes').select('id, code, code_type').eq('program_id', programId),
        supabase
          .from('program_members')
          .select('id, display_name, role, phone_number')
          .eq('program_id', programId)
          .order('display_name'),
      ])

      if (!active) return

      if (programResult.error) setError(programResult.error.message)
      else setProgram(programResult.data)

      // Codes are head-coach/AD only. Everyone else gets an empty list rather
      // than an error, so an assistant or parent simply sees no code section.
      if (codesResult.data) setCodes(codesResult.data)
      if (membersResult.data) setMembers(membersResult.data)

      setLoading(false)
    })()

    return () => {
      active = false
    }
  }, [programId])

  if (loading) {
    return (
      <main className="flex min-h-svh items-center justify-center px-6">
        <p className="font-body text-muted">Loading…</p>
      </main>
    )
  }

  if (error || !program) {
    return (
      <main className="flex min-h-svh items-center justify-center px-6">
        <p
          role="alert"
          className="max-w-md rounded-lg border border-accent/40 bg-accent/10 px-4 py-3 font-body text-sm text-ink"
        >
          {error || 'Program not found.'}
        </p>
      </main>
    )
  }

  const orderedCodes = CODE_TYPES.map((t) => ({
    ...t,
    row: codes.find((c) => c.code_type === t.type),
  }))

  const groups = ROLE_GROUPS.map((g) => ({
    title: g.title,
    people: members.filter((m) => (g.roles as readonly string[]).includes(m.role)),
  }))

  // Anything with an unexpected role still shows up rather than vanishing.
  const known = new Set(ROLE_GROUPS.flatMap((g) => g.roles as readonly string[]))
  const ungrouped = members.filter((m) => !known.has(m.role))

  return (
    <main className="min-h-svh px-6 py-16 sm:py-20">
      <div className="mx-auto max-w-3xl">
        <p className="font-body text-xs font-medium uppercase tracking-[0.3em] text-muted">
          {program.sport}
        </p>
        <h1 className="mt-3 font-display text-4xl font-bold uppercase tracking-tight text-ink sm:text-5xl">
          {program.name}
        </h1>

        {/* ---------------- Join codes (head coach / AD only) ---------------- */}
        {codes.length > 0 && (
          <section className="mt-12">
            <h2 className="font-display text-xl font-semibold uppercase tracking-wide text-ink">
              Join codes
            </h2>
            <p className="mt-2 font-body text-sm text-muted">
              Share the right code with each group. Anyone with a code can join.
            </p>

            <div className="mt-6 grid gap-5 sm:grid-cols-3">
              {orderedCodes.map((t) => (
                <CodeTile
                  key={t.type}
                  label={t.label}
                  blurb={t.blurb}
                  code={t.row?.code ?? '—'}
                />
              ))}
            </div>
          </section>
        )}

        {/* ---------------------------- Roster ---------------------------- */}
        <section className="mt-14">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="font-display text-xl font-semibold uppercase tracking-wide text-ink">
              Roster
            </h2>
            <span className="font-body text-sm text-muted">
              {members.length} {members.length === 1 ? 'member' : 'members'}
            </span>
          </div>

          {members.length === 0 ? (
            <p className="mt-6 rounded-lg border border-border bg-surface px-4 py-6 text-center font-body text-sm text-muted">
              Nobody has joined yet. Share a code above to get started.
            </p>
          ) : (
            <div className="mt-6 space-y-8">
              {groups.map((group) => (
                <RosterGroup
                  key={group.title}
                  title={group.title}
                  people={group.people}
                />
              ))}
              {ungrouped.length > 0 && (
                <RosterGroup title="Other" people={ungrouped} />
              )}
            </div>
          )}
        </section>
      </div>
    </main>
  )
}

function RosterGroup({ title, people }: { title: string; people: Member[] }) {
  return (
    <div>
      <h3 className="font-body text-xs font-medium uppercase tracking-[0.22em] text-muted">
        {title}
        <span className="ml-2 text-muted/60">{people.length}</span>
      </h3>

      {people.length === 0 ? (
        <p className="mt-3 font-body text-sm text-muted/70">None yet.</p>
      ) : (
        <ul className="mt-3 divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
          {people.map((m) => (
            <li
              key={m.id}
              className="flex flex-col gap-1 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
            >
              <span className="font-body text-base font-medium text-ink">
                {m.display_name}
              </span>

              <span className="flex items-center gap-3 font-body text-sm text-muted">
                {m.phone_number && (
                  <a
                    href={`tel:${m.phone_number.replace(/[^\d+]/g, '')}`}
                    className="font-mono text-xs tracking-wide underline underline-offset-4 transition hover:text-ink"
                  >
                    {m.phone_number}
                  </a>
                )}
                <span className="whitespace-nowrap rounded-full border border-border px-2.5 py-0.5 text-[0.7rem] uppercase tracking-wider">
                  {ROLE_LABEL[m.role] ?? m.role}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
