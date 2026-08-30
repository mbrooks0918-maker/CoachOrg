import { supabase } from './supabaseClient'

/**
 * The one-line summary under each home tile.
 *
 * Every figure here is read through the same policies the section itself uses,
 * so a tile can only ever promise what that person would actually find when
 * they tap it. Nothing is computed for a role that cannot see it -- a player's
 * equipment figure counts their own gear, a coach's counts the cupboard.
 */
export type HomeSummary = {
  displayName: string | null
  memberCount: number
  upcomingTasks: number
  /** Staff: items in the inventory. Everyone else: things they are holding. */
  equipmentCount: number
  nextEvent: { id: string; name: string; starts_at: string } | null
  /** The viewer's volunteer jobs at that next event, if any. */
  myJobs: string[]
}

export async function loadHomeSummary(
  programId: string,
  memberId: string | null,
  staff: boolean,
): Promise<HomeSummary> {
  const nowIso = new Date().toISOString()

  const [meResult, membersResult, tasksResult, equipmentResult, eventResult] = await Promise.all([
    memberId
      ? supabase.from('program_members').select('display_name').eq('id', memberId).maybeSingle()
      : Promise.resolve({ data: null }),

    supabase
      .from('program_members')
      .select('id', { count: 'exact', head: true })
      .eq('program_id', programId),

    supabase
      .from('scheduled_tasks')
      .select('id', { count: 'exact', head: true })
      .eq('program_id', programId)
      .eq('sent', false),

    staff
      ? supabase
          .from('equipment_items')
          .select('id', { count: 'exact', head: true })
          .eq('program_id', programId)
      : memberId
        ? supabase
            .from('equipment_checkouts')
            .select('id', { count: 'exact', head: true })
            .eq('program_id', programId)
            .eq('member_id', memberId)
            .is('returned_at', null)
        : Promise.resolve({ count: 0 }),

    supabase
      .from('events')
      .select('id, name, starts_at')
      .eq('program_id', programId)
      .gte('starts_at', nowIso)
      .order('starts_at', { ascending: true })
      .limit(1),
  ])

  const nextEvent = eventResult.data?.[0] ?? null

  let myJobs: string[] = []
  if (nextEvent && memberId) {
    const { data } = await supabase
      .from('event_volunteer_assignments')
      .select('role_label')
      .eq('event_id', nextEvent.id)
      .eq('member_id', memberId)
    myJobs = (data ?? []).map((row) => row.role_label as string)
  }

  return {
    displayName: (meResult.data as { display_name?: string } | null)?.display_name ?? null,
    memberCount: membersResult.count ?? 0,
    upcomingTasks: tasksResult.count ?? 0,
    equipmentCount: equipmentResult.count ?? 0,
    nextEvent,
    myJobs,
  }
}

/** "Fri, Sep 4" -- short enough to sit on a tile. */
export function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

export function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`
}
