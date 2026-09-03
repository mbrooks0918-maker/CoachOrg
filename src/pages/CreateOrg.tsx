import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../auth/AuthProvider'
import { buildCode, CODE_TYPES, orgPrefix } from '../lib/codes'
import { resolveLandingProgramId } from '../lib/program'
import { Button, ErrorNote, Field, FormShell } from '../components/ui'

const MAX_CODE_ATTEMPTS = 5

export default function CreateOrg() {
  const navigate = useNavigate()
  const { session } = useAuth()
  const [orgName, setOrgName] = useState('')
  const [programName, setProgramName] = useState('')
  const [sport, setSport] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [checking, setChecking] = useState(true)

  // Someone who already has a program should never see this form -- filling it
  // in again would create a second organization and program alongside the
  // first, with a fresh set of join codes.
  useEffect(() => {
    const userId = session?.user.id
    if (!userId) {
      setChecking(false)
      return
    }
    let active = true
    resolveLandingProgramId(userId).then((programId) => {
      if (!active) return
      if (programId) navigate(`/program/${programId}`, { replace: true })
      else setChecking(false)
    })
    return () => {
      active = false
    }
  }, [session, navigate])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')

    const userId = session?.user.id
    if (!userId) {
      setError('Your session expired. Log in again.')
      return
    }

    setBusy(true)

    // Step 1 -- organization.
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .insert({ name: orgName.trim(), created_by: userId })
      .select()
      .single()

    if (orgError || !org) {
      setBusy(false)
      setError(orgError?.message ?? 'Could not create the organization.')
      return
    }

    // Step 2 -- program.
    const { data: program, error: programError } = await supabase
      .from('programs')
      .insert({
        organization_id: org.id,
        name: programName.trim(),
        sport: sport.trim(),
        head_coach_id: userId,
      })
      .select()
      .single()

    if (programError || !program) {
      // These four inserts are separate round trips, so a failure here leaves
      // the organization behind. Clean it up rather than accumulating orphans
      // -- the creator's DELETE policy permits this.
      await supabase.from('organizations').delete().eq('id', org.id)
      setBusy(false)
      setError(programError?.message ?? 'Could not create the program.')
      return
    }

    // Step 3 -- the head coach as a person of this organization, then their
    // membership row pointing at it. A roster row no longer carries a name of
    // its own; it names the person who holds the spot.
    const { data: person, error: personError } = await supabase
      .from('people')
      .insert({
        organization_id: org.id,
        full_name: session.user.email?.split('@')[0] ?? 'Head Coach',
        user_id: userId,
      })
      .select('id')
      .single()

    if (personError || !person) {
      await supabase.from('organizations').delete().eq('id', org.id)
      setBusy(false)
      setError(personError?.message ?? 'Could not create your profile.')
      return
    }

    const { error: memberError } = await supabase.from('program_members').insert({
      program_id: program.id,
      person_id: person.id,
      role: 'head_coach',
    })

    if (memberError) {
      await supabase.from('organizations').delete().eq('id', org.id)
      setBusy(false)
      setError(memberError.message)
      return
    }

    // Step 4 -- one join code per audience. `code` is globally unique, so a
    // collision is possible however unlikely; regenerate the whole batch and
    // retry rather than failing the signup.
    const prefix = orgPrefix(orgName)
    let codesError: string | null = null

    for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
      const rows = CODE_TYPES.map((t) => ({
        program_id: program.id,
        code: buildCode(prefix, t.segment),
        code_type: t.type,
      }))

      const { error: insertError } = await supabase.from('program_codes').insert(rows)
      if (!insertError) {
        codesError = null
        break
      }
      // 23505 = unique_violation. Anything else is not worth retrying.
      codesError = insertError.message
      if (insertError.code !== '23505') break
    }

    if (codesError) {
      await supabase.from('organizations').delete().eq('id', org.id)
      setBusy(false)
      setError(codesError)
      return
    }

    setBusy(false)
    navigate(`/program/${program.id}`, { replace: true })
  }

  if (checking) {
    return (
      <main className="flex min-h-svh items-center justify-center px-6">
        <p className="font-body text-muted">Loading…</p>
      </main>
    )
  }

  return (
    <FormShell
      title="Set up your program"
      subtitle="One organization, one program. You can add more later."
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <Field
          label="Organization name"
          name="organization"
          required
          value={orgName}
          onChange={(e) => setOrgName(e.target.value)}
          placeholder="Albertville High School"
        />
        <Field
          label="Program name"
          name="program"
          required
          value={programName}
          onChange={(e) => setProgramName(e.target.value)}
          placeholder="Albertville Football"
        />
        <Field
          label="Sport"
          name="sport"
          required
          value={sport}
          onChange={(e) => setSport(e.target.value)}
          placeholder="Football"
        />

        <ErrorNote>{error}</ErrorNote>

        <Button type="submit" disabled={busy}>
          {busy ? 'Creating…' : 'Create'}
        </Button>
      </form>
    </FormShell>
  )
}
