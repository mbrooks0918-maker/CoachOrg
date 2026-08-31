import { useCallback, useEffect, useState } from 'react'
import { useProgram } from '../lib/programContext'
import { PlayerDocuments } from '../components/PlayerDocuments'
import {
  REQUIRED_DOC_TYPES,
  byPlayer,
  listPlayerDocuments,
  missingTypes,
  type PlayerDocument,
} from '../lib/playerDocuments'
import { MemberPicker } from '../components/MemberPicker'
import { Button, CodeTile, ErrorNote } from '../components/ui'
import { CODE_TYPES } from '../lib/codes'
import { supabase } from '../lib/supabaseClient'
import {
  ROLE_GROUPS,
  ROLE_LABEL,
  formatJoined,
  indexLinks,
  isStaff,
  linkGuardian,
  loadRoster,
  unlinkGuardian,
  type GuardianLink,
  type Member,
} from '../lib/roster'

type Code = { id: string; code: string; code_type: string }

export default function RosterPage() {
  const { program, role, memberId } = useProgram()
  const staff = isStaff(role)

  const [members, setMembers] = useState<Member[]>([])
  const [links, setLinks] = useState<GuardianLink[]>([])
  const [codes, setCodes] = useState<Code[]>([])
  const [playerDocs, setPlayerDocs] = useState<PlayerDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    const { members, links, error } = await loadRoster(program.id)
    setMembers(members)
    setLinks(links)
    if (error) setError(error)
  }, [program.id])

  useEffect(() => {
    let active = true
    ;(async () => {
      // Codes are head-coach/AD only; a rejected read yields an empty list
      // rather than an error, so the section simply does not render.
      const [, codesResult, docsResult] = await Promise.all([
        refresh(),
        supabase.from('program_codes').select('id, code, code_type').eq('program_id', program.id),
        listPlayerDocuments(program.id),
      ])
      if (!active) return
      if (codesResult.data) setCodes(codesResult.data)
      setPlayerDocs(docsResult.documents)
      setLoading(false)
    })()
    return () => {
      active = false
    }
  }, [program.id, refresh])

  if (loading) return <p className="font-body text-muted">Loading…</p>

  const { guardiansOf, playersOf } = indexLinks(members, links)
  const players = members.filter((m) => m.role === 'player')
  const guardians = members.filter((m) => m.role === 'parent')

  const docsByPlayer = byPlayer(playerDocs)
  // Staff-only headline: how many players are fully papered up.
  const fullyDocumented = players.filter(
    (p) => missingTypes(docsByPlayer.get(p.id) ?? []).length === 0,
  ).length

  const groups = ROLE_GROUPS.map((g) => ({
    title: g.title,
    people: members.filter((m) => (g.roles as readonly string[]).includes(m.role)),
  }))
  const known = new Set(ROLE_GROUPS.flatMap((g) => g.roles as readonly string[]))
  const ungrouped = members.filter((m) => !known.has(m.role))

  const orderedCodes = CODE_TYPES.map((t) => ({
    ...t,
    row: codes.find((c) => c.code_type === t.type),
  }))

  return (
    <div>
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="font-display text-2xl font-bold uppercase tracking-tight text-ink">
          Roster
        </h2>
        <span className="font-body text-sm text-muted">
          {members.length} {members.length === 1 ? 'member' : 'members'}
        </span>
      </div>

      <ErrorNote>{error}</ErrorNote>

      {staff && (
        <LinkTool
          programId={program.id}
          players={players}
          guardians={guardians}
          onLinked={refresh}
        />
      )}

      {members.length === 0 ? (
        <p className="mt-6 rounded-lg border border-border bg-surface px-4 py-6 text-center font-body text-sm text-muted">
          Nobody has joined yet. Share a code below to get started.
        </p>
      ) : (
        <div className="mt-8 space-y-8">
          {groups.map((group) => (
            <RosterGroup
              key={group.title}
              title={group.title}
              people={group.people}
              guardiansOf={guardiansOf}
              playersOf={playersOf}
              links={links}
              canUnlink={staff}
              onChanged={refresh}
              programId={program.id}
              docsByPlayer={docsByPlayer}
              setPlayerDocs={setPlayerDocs}
              staff={staff}
              memberId={memberId}
              note={
                group.title === 'Players' && staff && group.people.length > 0
                  ? `${fullyDocumented} of ${group.people.length} have all ${REQUIRED_DOC_TYPES.length} documents on file`
                  : undefined
              }
            />
          ))}
          {ungrouped.length > 0 && (
            <RosterGroup
              title="Other"
              people={ungrouped}
              guardiansOf={guardiansOf}
              playersOf={playersOf}
              links={links}
              canUnlink={staff}
              onChanged={refresh}
              programId={program.id}
              docsByPlayer={docsByPlayer}
              setPlayerDocs={setPlayerDocs}
              staff={staff}
              memberId={memberId}
            />
          )}
        </div>
      )}

      {codes.length > 0 && (
        <section className="mt-14">
          <h2 className="font-display text-xl font-semibold uppercase tracking-wide text-ink">
            Join codes
          </h2>
          <p className="mt-2 font-body text-sm text-muted">
            Share the right code with each group. Anyone with a code can join.
          </p>
          <div className="mt-6 grid gap-5 sm:grid-cols-3">
            {orderedCodes.map((t) => (
              <CodeTile key={t.type} label={t.label} blurb={t.blurb} code={t.row?.code ?? '—'} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

// ------------------------------------------------------------ link tool ----

/**
 * Staff-side tool for wiring a family member to a player by hand. The seeded
 * test roster has no associations and they are not guessable from names, so
 * they have to be made deliberately.
 */
function LinkTool({
  programId,
  players,
  guardians,
  onLinked,
}: {
  programId: string
  players: Member[]
  guardians: Member[]
  onLinked: () => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [playerId, setPlayerId] = useState<string | null>(null)
  const [guardianId, setGuardianId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  async function handleLink() {
    if (!playerId || !guardianId) {
      setError('Pick one player and one family member.')
      return
    }
    setBusy(true)
    setError('')
    setNotice('')
    const result = await linkGuardian(programId, playerId, guardianId)
    if (result.ok) await onLinked()
    setBusy(false)
    if (result.ok) {
      const player = players.find((p) => p.id === playerId)
      const guardian = guardians.find((g) => g.id === guardianId)
      setNotice(`${guardian?.display_name} is now linked to ${player?.display_name}.`)
      setPlayerId(null)
      setGuardianId(null)
    } else {
      setError(result.message)
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-6 w-full rounded-xl border border-dashed border-border px-5 py-4 font-body text-sm text-muted transition hover:border-accent hover:text-ink"
      >
        + Link a family member to a player
      </button>
    )
  }

  return (
    <div className="mt-6 rounded-xl border border-border bg-surface px-5 py-6">
      <div className="flex items-baseline justify-between gap-4">
        <h3 className="font-display text-base font-semibold uppercase tracking-wide text-ink">
          Link family to player
        </h3>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="font-body text-xs uppercase tracking-wider text-muted transition hover:text-ink"
        >
          Close
        </button>
      </div>

      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        <MemberPicker
          label="Player"
          members={players}
          selectedIds={playerId ? [playerId] : []}
          onToggle={(id) => setPlayerId((current) => (current === id ? null : id))}
          emptyText="No players on the roster yet."
        />
        <MemberPicker
          label="Family member"
          members={guardians}
          selectedIds={guardianId ? [guardianId] : []}
          onToggle={(id) => setGuardianId((current) => (current === id ? null : id))}
          emptyText="Nobody has joined with the family code yet."
        />
      </div>

      {error && <div className="mt-4"><ErrorNote>{error}</ErrorNote></div>}
      {notice && !error && <p className="mt-4 font-body text-sm text-muted">{notice}</p>}

      <div className="mt-5">
        <Button onClick={handleLink} disabled={busy || !playerId || !guardianId}>
          {busy ? 'Linking…' : 'Link Them'}
        </Button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- roster ----

function RosterGroup({
  title,
  people,
  guardiansOf,
  playersOf,
  links,
  canUnlink,
  onChanged,
  programId,
  docsByPlayer,
  setPlayerDocs,
  staff,
  memberId,
  note,
}: {
  title: string
  people: Member[]
  guardiansOf: Map<string, Member[]>
  playersOf: Map<string, Member[]>
  links: GuardianLink[]
  canUnlink: boolean
  onChanged: () => Promise<void>
  programId: string
  docsByPlayer: Map<string, PlayerDocument[]>
  setPlayerDocs: React.Dispatch<React.SetStateAction<PlayerDocument[]>>
  staff: boolean
  memberId: string | null
  note?: string
}) {
  return (
    <div>
      <h3 className="font-body text-xs font-medium uppercase tracking-[0.22em] text-muted">
        {title}
        <span className="ml-2 text-muted/60">{people.length}</span>
      </h3>
      {note && <p className="mt-1.5 font-body text-xs text-muted/80">{note}</p>}

      {people.length === 0 ? (
        <p className="mt-3 font-body text-sm text-muted/70">None yet.</p>
      ) : (
        <ul className="mt-3 divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
          {people.map((m) => {
            const related = m.role === 'player' ? guardiansOf.get(m.id) : playersOf.get(m.id)
            const relationLabel = m.role === 'player' ? 'Family' : 'Player'
            const showRelations = m.role === 'player' || m.role === 'parent'

            return (
              <li key={m.id} className="px-4 py-3.5">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
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
                </div>

                <p className="mt-1 font-mono text-[0.7rem] uppercase tracking-wider text-muted/70">
                  {formatJoined(m.joined_at)}
                </p>

                {m.role === 'player' &&
                  (staff ||
                    links.some(
                      (l) => l.player_member_id === m.id && l.guardian_member_id === memberId,
                    ) ||
                    docsByPlayer.has(m.id)) && (
                    <PlayerDocuments
                      programId={programId}
                      playerMemberId={m.id}
                      playerName={m.display_name}
                      documents={docsByPlayer.get(m.id) ?? []}
                      canManage={
                        staff ||
                        links.some(
                          (l) => l.player_member_id === m.id && l.guardian_member_id === memberId,
                        )
                      }
                      onChanged={setPlayerDocs}
                    />
                  )}

                {showRelations && (
                  <Relations
                    label={relationLabel}
                    people={related ?? []}
                    member={m}
                    links={links}
                    canUnlink={canUnlink}
                    showEmpty={canUnlink}
                    onChanged={onChanged}
                  />
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

/** The linked-family / linked-player line under a roster entry. */
function Relations({
  label,
  people,
  member,
  links,
  canUnlink,
  showEmpty,
  onChanged,
}: {
  label: string
  people: Member[]
  member: Member
  links: GuardianLink[]
  canUnlink: boolean
  /** Only staff see every link, so only staff are told a member has none. */
  showEmpty: boolean
  onChanged: () => Promise<void>
}) {
  const [busyId, setBusyId] = useState<string | null>(null)

  if (people.length === 0) {
    // To a parent or player, an empty list means "none you may see", which is
    // not the same claim -- so say nothing rather than something untrue.
    if (!showEmpty) return null
    return (
      <p className="mt-2 font-body text-xs text-muted/60">
        {label === 'Family' ? 'No family linked yet.' : 'Not linked to a player yet.'}
      </p>
    )
  }

  async function handleUnlink(other: Member) {
    const link = links.find((l) =>
      member.role === 'player'
        ? l.player_member_id === member.id && l.guardian_member_id === other.id
        : l.guardian_member_id === member.id && l.player_member_id === other.id,
    )
    if (!link) return
    setBusyId(other.id)
    await unlinkGuardian(link.id)
    await onChanged()
    setBusyId(null)
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <span className="font-body text-xs uppercase tracking-wider text-muted/70">{label}:</span>
      {people.map((other) => (
        <span
          key={other.id}
          className="inline-flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent/10 px-2.5 py-0.5 font-body text-xs text-ink"
        >
          {other.display_name}
          {canUnlink && (
            <button
              type="button"
              onClick={() => handleUnlink(other)}
              disabled={busyId === other.id}
              aria-label={`Unlink ${other.display_name} from ${member.display_name}`}
              className="text-muted transition hover:text-accent disabled:opacity-50"
            >
              ×
            </button>
          )}
        </span>
      ))}
    </div>
  )
}
