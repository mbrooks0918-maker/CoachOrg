import { supabase } from './supabaseClient'

export type Reminder = {
  id: string
  title: string
  body: string | null
  send_at: string
  target_role: string | null
  sent: boolean
}

/**
 * Who a reminder goes to.
 *
 * scheduled_tasks.target_role holds a single role, so these are one-to-one
 * with it rather than being groupings. null means everyone in the program.
 */
export const AUDIENCES = [
  { value: null, label: 'Everyone' },
  { value: 'player', label: 'Players' },
  { value: 'parent', label: 'Parents' },
  { value: 'assistant_coach', label: 'Assistants' },
  { value: 'team_manager', label: 'Managers' },
] as const

export function audienceLabel(role: string | null): string {
  return AUDIENCES.find((a) => a.value === role)?.label ?? role ?? 'Everyone'
}

/** Roles allowed to queue a reminder, matching the insert policy. */
const CAN_SCHEDULE = ['head_coach', 'assistant_coach', 'team_manager']

export function canSchedule(role: string | null): boolean {
  return role !== null && CAN_SCHEDULE.includes(role)
}

/**
 * Formats a Date for <input type="datetime-local">, which wants local wall
 * time with no timezone. toISOString would hand it UTC and silently shift the
 * displayed time by the offset.
 */
export function toLocalInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  )
}

/** Sensible default: an hour from now, on the minute. */
export function defaultSendAt(): string {
  const d = new Date(Date.now() + 60 * 60 * 1000)
  d.setSeconds(0, 0)
  return toLocalInputValue(d)
}

/** "Sat, Aug 29 at 6:00 PM" in the reader's own timezone. */
export function formatSendAt(iso: string): string {
  const d = new Date(iso)
  const day = d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  return `${day} at ${time}`
}

/** "in 3 hours" / "in 2 days" — a rough hint, not a countdown. */
export function relativeToNow(iso: string): string {
  const diffMinutes = Math.round((new Date(iso).getTime() - Date.now()) / 60000)
  if (diffMinutes < 1) return 'any moment now'
  if (diffMinutes < 60) return `in ${diffMinutes} min`
  const hours = Math.round(diffMinutes / 60)
  if (hours < 24) return `in ${hours} ${hours === 1 ? 'hour' : 'hours'}`
  const days = Math.round(hours / 24)
  return `in ${days} ${days === 1 ? 'day' : 'days'}`
}

export async function listReminders(programId: string) {
  return supabase
    .from('scheduled_tasks')
    .select('id, title, body, send_at, target_role, sent')
    .eq('program_id', programId)
    .order('send_at', { ascending: true })
}

export async function createReminder(input: {
  programId: string
  title: string
  body: string
  sendAtLocal: string
  targetRole: string | null
}): Promise<{ ok: boolean; message: string; reminder?: Reminder }> {
  const title = input.title.trim()
  if (!title) return { ok: false, message: 'Give the reminder a title.' }

  // The value is local wall time; Date parses it as such and toISOString then
  // converts to the UTC the column expects.
  const sendAt = new Date(input.sendAtLocal)
  if (Number.isNaN(sendAt.getTime())) {
    return { ok: false, message: 'Pick a date and time.' }
  }
  if (sendAt.getTime() <= Date.now()) {
    return { ok: false, message: 'Pick a time in the future.' }
  }

  const { data: userData } = await supabase.auth.getUser()
  const userId = userData.user?.id
  if (!userId) return { ok: false, message: 'You need to be logged in.' }

  const { data, error } = await supabase
    .from('scheduled_tasks')
    .insert({
      program_id: input.programId,
      created_by: userId,
      title,
      body: input.body.trim() || null,
      send_at: sendAt.toISOString(),
      target_role: input.targetRole,
    })
    .select('id, title, body, send_at, target_role, sent')
    .single()

  if (error) return { ok: false, message: error.message }
  return { ok: true, message: 'Reminder scheduled.', reminder: data }
}

/**
 * Removes a still-queued reminder. The delete policy refuses once the task has
 * been sent, so a stale list cannot erase a delivery record.
 */
export async function cancelReminder(id: string): Promise<{ ok: boolean; message: string }> {
  const { error, count } = await supabase
    .from('scheduled_tasks')
    .delete({ count: 'exact' })
    .eq('id', id)

  if (error) return { ok: false, message: error.message }
  if (!count) return { ok: false, message: 'That reminder has already gone out.' }
  return { ok: true, message: 'Reminder cancelled.' }
}
