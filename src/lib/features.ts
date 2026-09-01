import { supabase } from './supabaseClient'

/**
 * Capabilities an organization has unlocked.
 *
 * A high school running one football team has none of these; a recreation
 * center paying for online sign-ups has both. What each plan includes lives in
 * the database (plan_features), not here, so switching an organization on is a
 * row rather than a deploy.
 */
export type Feature = 'registration' | 'payments'

/**
 * The features available to this program's organization.
 *
 * Returns an empty list for anyone outside the program, and for any failure --
 * a feature that cannot be confirmed is treated as absent. The interface is
 * only ever the second lock anyway: the database policies behind each feature
 * are the one that matters.
 */
export async function loadProgramFeatures(programId: string): Promise<Feature[]> {
  const { data, error } = await supabase.rpc('program_features', {
    p_program_id: programId,
  })
  if (error) return []
  return (data ?? []) as Feature[]
}
