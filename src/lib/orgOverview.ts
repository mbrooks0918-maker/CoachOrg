import { supabase } from './supabaseClient'

/**
 * The organization-level snapshot.
 *
 * Every other screen in the app is scoped to one program, which is right for a
 * coach and not enough for the person who runs the park. Loaded in one call so
 * the permission is checked in one place: org_overview() admits only an
 * organization's owner or one of its athletic directors, and refuses a coach
 * however many teams they run.
 */

export type OrgProgram = {
  id: string
  name: string
  sport: string
  players: number
  confirmed: number
  waitlisted: number
  season: {
    name: string
    capacity: number | null
    spots_remaining: number | null
    closes_at: string | null
    open_now: boolean
    public_token: string
  } | null
}

export type OrgEvent = {
  id: string
  program_id: string
  program_name: string
  name: string
  starts_at: string
  location: string | null
  opponent: string | null
}

export type OrgOverview = {
  organization: { id: string; name: string }
  totals: {
    programs: number
    /** A child counts once however many sports they play. */
    children: number
    /** Every sign-up, so a two-sport child counts twice. */
    signups: number
    confirmed: number
    waitlisted: number
    families: number
  }
  programs: OrgProgram[]
  upcoming_events: OrgEvent[]
  equipment: { items: number; total_quantity: number; checked_out: number }
}

export async function loadOrgOverview(
  organizationId: string,
): Promise<{ overview?: OrgOverview; error?: string }> {
  const { data, error } = await supabase.rpc('org_overview', {
    p_organization_id: organizationId,
  })
  if (error) {
    return {
      error: error.message.includes('not permitted')
        ? 'This overview is for the people who run the organization. Your coaches see their own teams instead.'
        : 'Could not load the overview.',
    }
  }
  return { overview: data as OrgOverview }
}

/** Owner or athletic director. Deliberately not "runs a team". */
export async function isOrgLeader(organizationId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('is_org_leader', {
    p_organization_id: organizationId,
  })
  return !error && data === true
}

/** "Sat 26 Sep, 9:00 am" -- enough to plan a weekend around. */
export function eventWhen(iso: string): string {
  const date = new Date(iso)
  return `${date.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })}, ${date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`
}

/** Groups the flat event list into day headings, in order. */
export function byDay(events: OrgEvent[]): { day: string; events: OrgEvent[] }[] {
  const groups: { day: string; events: OrgEvent[] }[] = []
  for (const event of events) {
    const day = new Date(event.starts_at).toLocaleDateString(undefined, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    })
    const last = groups[groups.length - 1]
    if (last && last.day === day) last.events.push(event)
    else groups.push({ day, events: [event] })
  }
  return groups
}
