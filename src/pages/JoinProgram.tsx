import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, ErrorNote, Field, FormShell } from '../components/ui'
import { supabase } from '../lib/supabaseClient'

type Redemption = {
  kind: 'program' | 'person'
  program_id: string
  role?: string
  child_name?: string
}

/**
 * Joining with a code.
 *
 * One box, two kinds of code. A team code puts you on the roster in whatever
 * role that code carries. A child's code does the same and records that you
 * are responsible for that child.
 *
 * What used to be here was a second step: join on the family code, then tick
 * your children off the roster. Nothing verified the relationship, so any
 * parent could attach themselves to any child and read their birthdate,
 * emergency contact and medical notes. Being handed the child's own code IS
 * the verification now, and the picker is gone rather than guarded -- an
 * affordance that should never succeed should not be on the screen.
 */
export default function JoinProgram() {
  const navigate = useNavigate()

  const [code, setCode] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [phone, setPhone] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function handleJoin(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')

    const { data, error } = await supabase.rpc('redeem_code', {
      code: code.trim().toUpperCase(),
      display_name: displayName.trim(),
      phone_number: phone.trim() || null,
    })

    if (error || !data) {
      setBusy(false)
      // redeem_code is deliberately vague: one answer for a code that never
      // existed, one that was withdrawn, and one already used up.
      setError(
        error?.message.includes('invalid code')
          ? 'That code was not recognised. Check it and try again.'
          : (error?.message.replace(/^(redeem_code|claim_person|join_program): /, '') ??
            'Could not join with that code.'),
      )
      return
    }

    const result = data as Redemption
    navigate(`/program/${result.program_id}/roster`, { replace: true })
  }

  return (
    <FormShell
      title="Join a team"
      subtitle="Enter the code your coach gave you."
      footer={
        <span>
          Team codes look like <span className="font-mono text-accent">ALB-FAM-6VM2</span>. If you
          were given a code for your child, use that one instead — it signs you up and links you to
          them in one go.
        </span>
      }
    >
      <form onSubmit={handleJoin} className="space-y-5">
        <Field
          label="Code"
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
