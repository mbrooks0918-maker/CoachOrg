import { supabase } from './supabaseClient'

export type Member = {
  id: string
  user_id: string
  display_name: string
  role: string
  phone_number: string | null
  joined_at: string
}

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
  const [membersResult, linksResult] = await Promise.all([
    supabase
      .from('program_members')
      .select('id, user_id, display_name, role, phone_number, joined_at')
      .eq('program_id', programId)
      .order('display_name'),
    supabase
      .from('player_guardians')
      .select('id, player_member_id, guardian_member_id')
      .eq('program_id', programId),
  ])

  return {
    members: membersResult.data ?? [],
    links: linksResult.data ?? [],
    error: membersResult.error?.message ?? null,
  }
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
  const { data, error } = await supabase
    .from('player_guardians')
    .insert({
      program_id: programId,
      player_member_id: playerMemberId,
      guardian_member_id: guardianMemberId,
    })
    .select('id, player_member_id, guardian_member_id')
    .single()

  if (error) {
    // The unique constraint is the expected collision, not a real failure.
    if (error.code === '23505') return { ok: false, message: 'They are already linked.' }
    return { ok: false, message: error.message.replace(/^player_guardians: /, '') }
  }
  return { ok: true, message: 'Linked.', link: data }
}

export async function unlinkGuardian(linkId: string): Promise<{ ok: boolean; message: string }> {
  const { error, count } = await supabase
    .from('player_guardians')
    .delete({ count: 'exact' })
    .eq('id', linkId)

  if (error) return { ok: false, message: error.message }
  if (!count) return { ok: false, message: 'You do not have permission to remove that link.' }
  return { ok: true, message: 'Unlinked.' }
}
