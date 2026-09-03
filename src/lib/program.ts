import { readLastProgram } from './lastProgram'
import { supabase } from './supabaseClient'

export type MyProgram = { id: string; name: string }

/**
 * Every program this person can open, however they are attached to it.
 *
 * Head coaching is read from programs.head_coach_id rather than from a
 * membership row, because the two are independent: head_coach_id is the
 * authority and the membership row is a convenience the create-org flow adds.
 * A coach whose membership row was removed should still reach their program.
 *
 * Sorted the way a person would sort them, which is not the way a string sort
 * does: "Fall Soccer 8U" comes before "Fall Soccer 10U" because eight is less
 * than ten, and numeric collation is what gets that right.
 */
export async function listMyPrograms(userId: string): Promise<MyProgram[]> {
  const [coached, member] = await Promise.all([
    supabase.from('programs').select('id, name').eq('head_coach_id', userId),
    supabase.from('program_members').select('programs(id, name)').eq('user_id', userId),
  ])

  const byId = new Map<string, MyProgram>()
  for (const row of coached.data ?? []) {
    byId.set(row.id as string, { id: row.id as string, name: row.name as string })
  }
  for (const row of member.data ?? []) {
    const program = row.programs as unknown as MyProgram | null
    if (program?.id) byId.set(program.id, { id: program.id, name: program.name })
  }

  return [...byId.values()].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }),
  )
}

/**
 * Where a signed-in person should land: their program home, every time.
 *
 * Not the organization overview even for the owner of a park -- running four
 * teams does not mean the first thing you want is a summary of all four, and
 * the overview is one tap away from here anyway. Not a blank program, and not
 * the login screen.
 *
 * With one program there is no decision to make. With several, the last one
 * they had open wins, because whatever somebody was doing yesterday is
 * overwhelmingly what they are doing today. Where there is no record of that
 * -- a new account, a new device, cleared storage -- it falls back to the
 * first program by name. Alphabetical rather than oldest-first because it is
 * the only ordering a person can predict without seeing timestamps they have
 * never been shown.
 *
 * Returns null only when the person belongs to nothing, which is the one case
 * that should reach /create-org.
 */
export async function resolveLandingProgramId(userId: string): Promise<string | null> {
  const programs = await listMyPrograms(userId)
  if (programs.length === 0) return null
  if (programs.length === 1) return programs[0].id

  // Validated against the current list rather than trusted: a stored id can
  // point at a program they have since left, or one that no longer exists.
  const last = readLastProgram(userId)
  if (last && programs.some((p) => p.id === last)) return last

  return programs[0].id
}
