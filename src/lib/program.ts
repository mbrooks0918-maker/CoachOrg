import { supabase } from './supabaseClient'

/**
 * The program to drop a returning user into after they log in.
 *
 * A head coach is found via programs.head_coach_id rather than a membership
 * row, because the two are independent: head_coach_id is the authority, and a
 * matching program_members row is a convenience the create-org flow adds. A
 * coach whose membership row was removed should still land on their program.
 *
 * Everyone else is found through their membership. Returns null when the user
 * belongs to nothing yet, which is the only case that should reach /create-org.
 */
export async function findPrimaryProgramId(userId: string): Promise<string | null> {
  const { data: coached } = await supabase
    .from('programs')
    .select('id')
    .eq('head_coach_id', userId)
    .order('created_at')
    .limit(1)

  if (coached && coached.length > 0) return coached[0].id as string

  const { data: member } = await supabase
    .from('program_members')
    .select('program_id')
    .eq('user_id', userId)
    .order('joined_at')
    .limit(1)

  if (member && member.length > 0) return member[0].program_id as string

  return null
}
