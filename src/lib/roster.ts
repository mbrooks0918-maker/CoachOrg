import { supabase } from './supabaseClient'

export type Member = {
  id: string
  /** The person this roster spot points at. Stable across teams and seasons. */
  person_id: string
  /** Null for somebody on the roster who has no account -- a young player. */
  user_id: string | null
  display_name: string
  role: string
  phone_number: string | null
  joined_at: string
}

/**
 * A guardian link as this screen thinks of it: one roster row responsible for
 * another. The link itself is stored at the organization instead, between a
 * person and an account, so that it survives into next season -- these are the
 * organization-level rows resolved back onto the team currently on screen.
 */
export type GuardianLink = {
  id: string
  player_member_id: string
  guardian_member_id: string
}

export const ROLE_LABEL: Record<string, string> = {
  head_coach: 'Head Coach',
  assistant_coach: 'Assistant Coach',
  team_manager: 'Team Manager',
  parent: 'Family',
  player: 'Player',
}

/** Display order of the roster. */
export const ROLE_GROUPS = [
  { title: 'Players', roles: ['player'] },
  { title: 'Parents & Family', roles: ['parent'] },
  { title: 'Staff', roles: ['head_coach', 'assistant_coach', 'team_manager'] },
] as const

export const STAFF_ROLES = ['head_coach', 'assistant_coach', 'team_manager']

export function isStaff(role: string | null): boolean {
  return role !== null && STAFF_ROLES.includes(role)
}

/** "Joined Aug 29, 2026" */
export function formatJoined(iso: string): string {
  return `Joined ${new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })}`
}

/**
 * Members and guardian links for one program.
 *
 * The link query is not restricted here -- RLS already narrows it to what the
 * caller may see, which is every link for staff and only their own family for
 * a parent or player. An empty list is a legitimate answer, not an error.
 */
export async function loadRoster(programId: string): Promise<{
  members: Member[]
  links: GuardianLink[]
  error: string | null
}> {
  const membersResult = await supabase
    .from('program_roster')
    .select('id, person_id, user_id, display_name, role, phone_number, joined_at')
    .eq('program_id', programId)
    .order('display_name')

  const members: Member[] = membersResult.data ?? []
  if (members.length === 0) {
    return { members, links: [], error: membersResult.error?.message ?? null }
  }

  const { data: rows } = await supabase
    .from('guardians')
    .select('id, person_id, guardian_user_id')
    .in('person_id', members.map((m) => m.person_id))

  // Resolve the organization-level link back onto this team. A guardian who is
  // not on this roster -- a parent whose only child plays a different sport --
  // has no row to point at here, and the link is left out rather than rendered
  // half blank.
  const memberByPerson = new Map(members.map((m) => [m.person_id, m]))
  const memberByUser = new Map(
    members.filter((m) => m.user_id).map((m) => [m.user_id as string, m]),
  )

  const links: GuardianLink[] = []
  for (const row of rows ?? []) {
    const player = memberByPerson.get(row.person_id as string)
    const guardian = memberByUser.get(row.guardian_user_id as string)
    if (player && guardian) {
      links.push({ id: row.id as string, player_member_id: player.id, guardian_member_id: guardian.id })
    }
  }

  return { members, links, error: membersResult.error?.message ?? null }
}

/** guardians for a player, and players for a guardian, both keyed by member id. */
export function indexLinks(members: Member[], links: GuardianLink[]) {
  const byId = new Map(members.map((m) => [m.id, m]))
  const guardiansOf = new Map<string, Member[]>()
  const playersOf = new Map<string, Member[]>()

  for (const link of links) {
    const player = byId.get(link.player_member_id)
    const guardian = byId.get(link.guardian_member_id)
    // A link can reference someone the viewer is not allowed to see; skip it
    // rather than rendering a blank row.
    if (player && guardian) {
      guardiansOf.set(player.id, [...(guardiansOf.get(player.id) ?? []), guardian])
      playersOf.set(guardian.id, [...(playersOf.get(guardian.id) ?? []), player])
    }
  }
  return { guardiansOf, playersOf }
}

export async function linkGuardian(
  programId: string,
  playerMemberId: string,
  guardianMemberId: string,
): Promise<{ ok: boolean; message: string; link?: GuardianLink }> {
  // The screen speaks in roster rows; the link is stored between a person and
  // an account, so both ends are resolved before writing.
  const [programResult, rowsResult] = await Promise.all([
    supabase.from('programs').select('organization_id').eq('id', programId).single(),
    supabase
      .from('program_roster')
      .select('id, person_id, user_id')
      .in('id', [playerMemberId, guardianMemberId]),
  ])

  const organizationId = programResult.data?.organization_id
  const player = rowsResult.data?.find((r) => r.id === playerMemberId)
  const guardian = rowsResult.data?.find((r) => r.id === guardianMemberId)

  if (!organizationId || !player || !guardian) {
    return { ok: false, message: 'Could not find those two on this roster.' }
  }
  if (!guardian.user_id) {
    return { ok: false, message: 'That family member has not set up an account yet.' }
  }

  const { data, error } = await supabase
    .from('guardians')
    .insert({
      organization_id: organizationId,
      person_id: player.person_id,
      guardian_user_id: guardian.user_id,
    })
    .select('id')
    .single()

  if (error) {
    // The unique constraint is the expected collision, not a real failure.
    if (error.code === '23505') return { ok: false, message: 'They are already linked.' }
    return { ok: false, message: error.message.replace(/^guardians: /, '') }
  }
  return {
    ok: true,
    message: 'Linked.',
    link: { id: data.id, player_member_id: playerMemberId, guardian_member_id: guardianMemberId },
  }
}

export async function unlinkGuardian(linkId: string): Promise<{ ok: boolean; message: string }> {
  const { error, count } = await supabase
    .from('guardians')
    .delete({ count: 'exact' })
    .eq('id', linkId)

  if (error) return { ok: false, message: error.message }
  if (!count) return { ok: false, message: 'You do not have permission to remove that link.' }
  return { ok: true, message: 'Unlinked.' }
}
