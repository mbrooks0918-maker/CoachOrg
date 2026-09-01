import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MemberPicker } from '../components/MemberPicker'
import { Button, ErrorNote, Field, FormShell } from '../components/ui'
import { linkGuardian, type Member } from '../lib/roster'
import { supabase } from '../lib/supabaseClient'

type Membership = {
  id: string
  program_id: string
  role: string
  display_name: string
}

/**
 * Joining a program with a code.
 *
 * Two steps, and the second only happens for the family code: a parent is a
 * parent *of somebody*, so they pick their children out of the roster before
 * they are done. Everyone else lands straight in the program.
 */
export default function JoinProgram() {
  const navigate = useNavigate()

  const [code, setCode] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [phone, setPhone] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // Set once the code is accepted; its presence is what shows step two.
  const [membership, setMembership] = useState<Membership | null>(null)
  const [players, setPlayers] = useState<Member[]>([])
  const [selected, setSelected] = useState<string[]>([])

  async function handleJoin(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')

    const { data, error } = await supabase.rpc('join_program', {
      code: code.trim().toUpperCase(),
      display_name: displayName.trim(),
      phone_number: phone.trim() || null,
    })

    if (error || !data) {
      setBusy(false)
      // join_program is deliberately vague about which codes exist.
      setError(
        error?.message.includes('invalid code')
          ? "That code was not recognised. Check it and try again."
          : (error?.message ?? 'Could not join with that code.'),
      )
      return
    }

    const member = data as Membership

    if (member.role !== 'parent') {
      navigate(`/program/${member.program_id}/roster`, { replace: true })
      return
    }

    // Family code: fetch the players so they can say who they belong to.
    const { data: roster } = await supabase
      .from('program_roster')
      .select('id, person_id, user_id, display_name, role, phone_number, joined_at')
      .eq('program_id', member.program_id)
      .eq('role', 'player')
      .order('display_name')

    setPlayers(roster ?? [])
    setMembership(member)
    setBusy(false)
  }

  async function handleLinkPlayers() {
    if (!membership) return
    setBusy(true)
    setError('')

    const results = await Promise.all(
      selected.map((playerId) => linkGuardian(membership.program_id, playerId, membership.id)),
    )
    const failed = results.filter((r) => !r.ok)

    setBusy(false)
    if (failed.length > 0) {
      setError(failed[0].message)
      return
    }
    navigate(`/program/${membership.program_id}/roster`, { replace: true })
  }

  function skip() {
    if (membership) navigate(`/program/${membership.program_id}/roster`, { replace: true })
  }

  // ---- Step two: which players is this family member connected to? ----
  if (membership) {
    return (
      <FormShell
        title="Who are you here for?"
        subtitle="Pick the player or players you are the parent or guardian of. Your coach can fix this later if you are not sure."
      >
        <div className="space-y-5">
          <MemberPicker
            label="Players"
            members={players}
            selectedIds={selected}
            onToggle={(id) =>
              setSelected((current) =>
                current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
              )
            }
            placeholder="Search players by name"
            emptyText="No players have joined this team yet."
          />

          <ErrorNote>{error}</ErrorNote>

          <Button onClick={handleLinkPlayers} disabled={busy || selected.length === 0}>
            {busy
              ? 'Saving…'
              : selected.length > 1
                ? `Link ${selected.length} Players`
                : 'Link My Player'}
          </Button>

          <button
            type="button"
            onClick={skip}
            className="w-full font-body text-sm text-muted underline underline-offset-4 transition hover:text-ink"
          >
            Skip for now
          </button>
        </div>
      </FormShell>
    )
  }

  // ---- Step one: the code itself ----
  return (
    <FormShell
      title="Join a team"
      subtitle="Enter the code your coach gave you."
      footer={
        <span>
          Codes look like <span className="font-mono text-accent">ALB-FAM-6VM2</span>.
        </span>
      }
    >
      <form onSubmit={handleJoin} className="space-y-5">
        <Field
          label="Team code"
          name="code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="ALB-FAM-6VM2"
          autoCapitalize="characters"
          autoComplete="off"
          required
        />
        <Field
          label="Your name"
          name="displayName"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Angela Carter"
          required
        />
        <Field
          label="Phone"
          name="phone"
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="Optional"
          hint="So your coach can reach you. Optional."
        />

        <ErrorNote>{error}</ErrorNote>

        <Button type="submit" disabled={busy}>
          {busy ? 'Joining…' : 'Join Team'}
        </Button>
      </form>
    </FormShell>
  )
}
