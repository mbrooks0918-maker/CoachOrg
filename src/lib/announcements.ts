import { supabase } from './supabaseClient'

/**
 * Announcements: staff talking to a whole program.
 *
 * Who can see what is decided entirely by the database. The select policy is
 * the same is_program_member() predicate reminders and events use, so a family
 * sees a program's posts exactly when their child is on that program's roster
 * -- there is no client-side filtering here holding that line, and there
 * should never be.
 */

export type Announcement = {
  id: string
  program_id: string
  author_id: string | null
  title: string
  body: string
  pinned: boolean
  created_at: string
  edited_at: string | null
}

const FIELDS = 'id, program_id, author_id, title, body, pinned, created_at, edited_at'

/** Pinned first, then newest. The same order the feed renders in. */
export async function loadAnnouncements(programId: string): Promise<{
  announcements: Announcement[]
  readIds: Set<string>
}> {
  const { data } = await supabase
    .from('announcements')
    .select(FIELDS)
    .eq('program_id', programId)
    .order('pinned', { ascending: false })
    .order('created_at', { ascending: false })

  const announcements = (data ?? []) as Announcement[]
  if (announcements.length === 0) return { announcements, readIds: new Set() }

  // Only ever returns the caller's own receipts -- the policy sees to that.
  const { data: reads } = await supabase
    .from('announcement_reads')
    .select('announcement_id')
    .in(
      'announcement_id',
      announcements.map((a) => a.id),
    )

  return {
    announcements,
    readIds: new Set((reads ?? []).map((r) => r.announcement_id as string)),
  }
}

export async function unreadCount(programId: string): Promise<number> {
  const { data, error } = await supabase.rpc('unread_announcement_count', {
    p_program_id: programId,
  })
  return error ? 0 : ((data as number) ?? 0)
}

export async function postAnnouncement(
  programId: string,
  input: { title: string; body: string; pinned: boolean },
): Promise<{ ok: boolean; message: string }> {
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return { ok: false, message: 'You are not signed in.' }

  const { error } = await supabase.from('announcements').insert({
    program_id: programId,
    author_id: auth.user.id,
    title: input.title.trim(),
    body: input.body.trim(),
    pinned: input.pinned,
  })

  if (error) return { ok: false, message: error.message }
  // The push is queued by a trigger, not from here: an announcement must not
  // be able to exist without one.
  return { ok: true, message: 'Posted. Everyone on the roster will be notified.' }
}

export async function editAnnouncement(
  id: string,
  input: { title: string; body: string },
): Promise<{ ok: boolean; message: string }> {
  const { error, count } = await supabase
    .from('announcements')
    .update({ title: input.title.trim(), body: input.body.trim() }, { count: 'exact' })
    .eq('id', id)
  if (error) return { ok: false, message: error.message }
  if (!count) return { ok: false, message: 'That is not yours to edit.' }
  return { ok: true, message: 'Saved.' }
}

/** Pinning is not editing, so this never stamps "edited". */
export async function setPinned(
  id: string,
  pinned: boolean,
): Promise<{ ok: boolean; message: string }> {
  const { error, count } = await supabase
    .from('announcements')
    .update({ pinned }, { count: 'exact' })
    .eq('id', id)
  if (error) return { ok: false, message: error.message }
  if (!count) return { ok: false, message: 'That is not yours to pin.' }
  return { ok: true, message: pinned ? 'Pinned.' : 'Unpinned.' }
}

export async function deleteAnnouncement(id: string): Promise<{ ok: boolean; message: string }> {
  const { error, count } = await supabase
    .from('announcements')
    .delete({ count: 'exact' })
    .eq('id', id)
  if (error) return { ok: false, message: error.message }
  if (!count) return { ok: false, message: 'That is not yours to delete.' }
  return { ok: true, message: 'Deleted.' }
}

/**
 * File read receipts for everything the reader just had in front of them.
 *
 * ignoreDuplicates because two tabs open on the same feed is a normal thing to
 * do and is not an error worth showing anybody.
 */
export async function markRead(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return
  await supabase
    .from('announcement_reads')
    .upsert(
      ids.map((announcement_id) => ({ announcement_id, user_id: auth.user!.id })),
      { onConflict: 'announcement_id,user_id', ignoreDuplicates: true },
    )
}

/** "just now", "20 minutes ago", "Tue 2 Sep" once it stops being today. */
export function whenPosted(iso: string): string {
  const then = new Date(iso)
  const minutes = Math.round((Date.now() - then.getTime()) / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  return then.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
}
