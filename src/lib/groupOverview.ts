import { supabase } from './supabaseClient'
import type { OrgEvent, OrgProgram } from './orgOverview'

/**
 * The group-level snapshot: one sport, every division of it.
 *
 * The same shape as the organization overview one level down, and reusing its
 * program and event types on purpose -- group_overview() returns the same
 * objects because a division summarised for a director and a division
 * summarised for a Program Admin is the same division.
 *
 * Loaded in one call so the permission lives in one place: group_overview()
 * admits only an admin of that group, and refuses a coach and a director
 * alike. A director has their own, wider view.
 */
export type GroupOverview = {
  group: { id: string; name: string; organization_id: string }
  totals: {
    programs: number
    /** A child counts once however many divisions they appear in. */
    children: number
    signups: number
    confirmed: number
    waitlisted: number
    /** Roster places across the group. */
    players: number
  }
  programs: OrgProgram[]
  upcoming_events: OrgEvent[]
  equipment: { items: number; total_quantity: number; checked_out: number }
}

export async function loadGroupOverview(
  groupId: string,
): Promise<{ overview?: GroupOverview; error?: string }> {
  const { data, error } = await supabase.rpc('group_overview', {
    p_program_group_id: groupId,
  })
  if (error) {
    return {
      error: error.message.includes('not permitted')
        ? 'This overview is for the person who runs this sport. Your coaches see their own divisions instead.'
        : 'Could not load the overview.',
    }
  }
  return { overview: data as GroupOverview }
}
