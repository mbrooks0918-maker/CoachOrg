import { supabase } from './supabaseClient'
import type { Member } from './roster'

export type EventRow = {
  id: string
  program_id: string
  name: string
  starts_at: string
  location: string | null
  opponent: string | null
  notes: string | null
}

export type ListItem = {
  id: string
  event_id: string
  label: string
  assigned_member_id: string | null
  position: number
  done_at: string | null
  done_by: string | null
}

export type Volunteer = {
  id: string
  event_id: string
  member_id: string
  role_label: string
}

export type ListTemplate = { id: string; name: string; kind: ListKind }

/** The two per-event lists. They are separate tables of the same shape. */
export type ListKind = 'todo' | 'equipment'

export const LIST_TABLE: Record<ListKind, string> = {
  todo: 'event_checklist_items',
  equipment: 'event_equipment_items',
}

const ITEM_COLUMNS = 'id, event_id, label, assigned_member_id, position, done_at, done_by'

/** Suggestions offered on an empty list, so a coach is not staring at a blank box. */
export const STARTER_ITEMS: Record<ListKind, string[]> = {
  todo: ['Set up chains', 'Confirm officials', 'Line the field', 'Check in with the AD'],
  equipment: ['Water coolers', 'Game balls', 'First down markers', 'First aid kit'],
}

// ------------------------------------------------------------ formatting ----

/** "Fri, Sep 5 at 7:00 PM" */
export function formatEventTime(iso: string): string {
  const d = new Date(iso)
  return `${d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })} at ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`
}

/** "Aug 30, 4:12 PM" -- the shorter form used on a completed item. */
export function formatStamp(iso: string): string {
  const d = new Date(iso)
  return `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}, ${d.toLocaleTimeString(
    undefined,
    { hour: 'numeric', minute: '2-digit' },
  )}`
}

export function toLocalInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  )
}

/** Next Friday evening, which is the overwhelmingly common case. */
export function defaultKickoff(): string {
  const d = new Date()
  d.setDate(d.getDate() + ((5 - d.getDay() + 7) % 7 || 7))
  d.setHours(19, 0, 0, 0)
  return toLocalInputValue(d)
}

export function isUpcoming(event: EventRow): boolean {
  return new Date(event.starts_at).getTime() >= Date.now()
}

// ----------------------------------------------------------------- events ----

export async function listEvents(programId: string) {
  const { data, error } = await supabase
    .from('events')
    .select('id, program_id, name, starts_at, location, opponent, notes')
    .eq('program_id', programId)
    .order('starts_at', { ascending: true })
  return { events: (data ?? []) as EventRow[], error: error?.message ?? null }
}

export async function getEvent(eventId: string) {
  const { data, error } = await supabase
    .from('events')
    .select('id, program_id, name, starts_at, location, opponent, notes')
    .eq('id', eventId)
    .single()
  return { event: (data as EventRow) ?? null, error: error?.message ?? null }
}

export async function createEvent(input: {
  programId: string
  name: string
  startsAtLocal: string
  location: string
  opponent: string
  notes: string
}): Promise<{ ok: boolean; message: string; event?: EventRow }> {
  const name = input.name.trim()
  if (!name) return { ok: false, message: 'Give the event a name.' }

  const startsAt = new Date(input.startsAtLocal)
  if (Number.isNaN(startsAt.getTime())) return { ok: false, message: 'Pick a date and time.' }

  const { data: userData } = await supabase.auth.getUser()
  const userId = userData.user?.id
  if (!userId) return { ok: false, message: 'You need to be logged in.' }

  const { data, error } = await supabase
    .from('events')
    .insert({
      program_id: input.programId,
      name,
      starts_at: startsAt.toISOString(),
      location: input.location.trim() || null,
      opponent: input.opponent.trim() || null,
      notes: input.notes.trim() || null,
      created_by: userId,
    })
    .select('id, program_id, name, starts_at, location, opponent, notes')
    .single()

  if (error) return { ok: false, message: error.message }
  return { ok: true, message: 'Event created.', event: data as EventRow }
}

export async function deleteEvent(eventId: string): Promise<{ ok: boolean; message: string }> {
  const { error, count } = await supabase
    .from('events')
    .delete({ count: 'exact' })
    .eq('id', eventId)
  if (error) return { ok: false, message: error.message }
  if (!count) return { ok: false, message: 'Only a coach can delete an event.' }
  return { ok: true, message: 'Event deleted.' }
}

// ------------------------------------------------------------ event detail ----

export async function loadEventDetail(eventId: string, programId: string) {
  const [todo, equipment, volunteers, members] = await Promise.all([
    supabase.from(LIST_TABLE.todo).select(ITEM_COLUMNS).eq('event_id', eventId).order('position'),
    supabase
      .from(LIST_TABLE.equipment)
      .select(ITEM_COLUMNS)
      .eq('event_id', eventId)
      .order('position'),
    supabase
      .from('event_volunteer_assignments')
      .select('id, event_id, member_id, role_label')
      .eq('event_id', eventId)
      .order('role_label'),
    supabase
      .from('program_members')
      .select('id, user_id, display_name, role, phone_number, joined_at')
      .eq('program_id', programId)
      .order('display_name'),
  ])

  return {
    todo: (todo.data ?? []) as ListItem[],
    equipment: (equipment.data ?? []) as ListItem[],
    volunteers: (volunteers.data ?? []) as Volunteer[],
    members: (members.data ?? []) as Member[],
  }
}

export async function addItem(
  kind: ListKind,
  input: {
    eventId: string
    programId: string
    label: string
    assignedMemberId: string | null
    position: number
  },
): Promise<{ ok: boolean; message: string; item?: ListItem }> {
  const label = input.label.trim()
  if (!label) return { ok: false, message: 'Type what needs doing.' }

  const { data, error } = await supabase
    .from(LIST_TABLE[kind])
    .insert({
      event_id: input.eventId,
      program_id: input.programId,
      label,
      assigned_member_id: input.assignedMemberId,
      position: input.position,
    })
    .select(ITEM_COLUMNS)
    .single()

  if (error) return { ok: false, message: error.message }
  return { ok: true, message: 'Added.', item: data as ListItem }
}

/**
 * Ticks or unticks an item.
 *
 * Who did it and when are written together with the flag, so an unticked item
 * carries no stale attribution.
 */
export async function toggleItem(
  kind: ListKind,
  item: ListItem,
  userId: string | null,
): Promise<{ ok: boolean; message: string; item?: ListItem }> {
  const done = item.done_at === null
  const { data, error } = await supabase
    .from(LIST_TABLE[kind])
    .update({
      done_at: done ? new Date().toISOString() : null,
      done_by: done ? userId : null,
    })
    .eq('id', item.id)
    .select(ITEM_COLUMNS)

  if (error) {
    return {
      ok: false,
      message: error.message.includes('42501')
        ? 'Only a coach or the person assigned this can check it off.'
        : error.message,
    }
  }
  if (!data || data.length === 0) {
    return { ok: false, message: 'Only a coach or the person assigned this can check it off.' }
  }
  return { ok: true, message: '', item: data[0] as ListItem }
}

export async function deleteItem(kind: ListKind, id: string) {
  const { error, count } = await supabase
    .from(LIST_TABLE[kind])
    .delete({ count: 'exact' })
    .eq('id', id)
  if (error) return { ok: false, message: error.message }
  if (!count) return { ok: false, message: 'Only a coach can remove an item.' }
  return { ok: true, message: 'Removed.' }
}

// ------------------------------------------------------------- volunteers ----

export async function assignVolunteer(input: {
  eventId: string
  programId: string
  memberId: string
  roleLabel: string
}): Promise<{ ok: boolean; message: string; volunteer?: Volunteer }> {
  const roleLabel = input.roleLabel.trim()
  if (!roleLabel) return { ok: false, message: 'Name the job first.' }

  const { data, error } = await supabase
    .from('event_volunteer_assignments')
    .insert({
      event_id: input.eventId,
      program_id: input.programId,
      member_id: input.memberId,
      role_label: roleLabel,
    })
    .select('id, event_id, member_id, role_label')
    .single()

  if (error) {
    if (error.code === '23505') return { ok: false, message: 'They already have that job.' }
    return { ok: false, message: error.message }
  }
  return { ok: true, message: 'Assigned.', volunteer: data as Volunteer }
}

export async function removeVolunteer(id: string) {
  const { error, count } = await supabase
    .from('event_volunteer_assignments')
    .delete({ count: 'exact' })
    .eq('id', id)
  if (error) return { ok: false, message: error.message }
  if (!count) return { ok: false, message: 'Only a coach can remove an assignment.' }
  return { ok: true, message: 'Removed.' }
}

/** Every assignment for this viewer across the program, for the event list badges. */
export async function myAssignments(programId: string, memberId: string | null) {
  if (!memberId) return []
  const { data } = await supabase
    .from('event_volunteer_assignments')
    .select('id, event_id, member_id, role_label')
    .eq('program_id', programId)
    .eq('member_id', memberId)
  return (data ?? []) as Volunteer[]
}

// -------------------------------------------------------------- templates ----

/** Templates are staff-only; a rejected read is an empty list, not an error. */
export async function listTemplates(programId: string, kind: ListKind) {
  const { data } = await supabase
    .from('event_list_templates')
    .select('id, name, kind')
    .eq('program_id', programId)
    .eq('kind', kind)
    .order('name')
  return (data ?? []) as ListTemplate[]
}

/**
 * Saves the labels of an event's list as a reusable template.
 *
 * Only the labels travel. Assignments and tick state belong to the event that
 * produced them, and carrying them into next week would be wrong.
 */
export async function saveTemplate(input: {
  programId: string
  kind: ListKind
  name: string
  items: ListItem[]
}): Promise<{ ok: boolean; message: string }> {
  const name = input.name.trim()
  if (!name) return { ok: false, message: 'Give the template a name.' }
  if (input.items.length === 0) return { ok: false, message: 'There is nothing on this list yet.' }

  const { data: userData } = await supabase.auth.getUser()
  const userId = userData.user?.id
  if (!userId) return { ok: false, message: 'You need to be logged in.' }

  const { data: template, error } = await supabase
    .from('event_list_templates')
    .insert({ program_id: input.programId, name, kind: input.kind, created_by: userId })
    .select('id')
    .single()

  if (error) {
    if (error.code === '23505') return { ok: false, message: 'A template already has that name.' }
    return { ok: false, message: error.message }
  }

  const { error: itemsError } = await supabase.from('event_list_template_items').insert(
    input.items.map((item, index) => ({
      template_id: template.id,
      program_id: input.programId,
      label: item.label,
      position: index,
    })),
  )
  if (itemsError) return { ok: false, message: itemsError.message }

  return { ok: true, message: `Saved “${name}”.` }
}

/** Appends a template's items to an event's list, after whatever is there. */
export async function applyTemplate(input: {
  kind: ListKind
  templateId: string
  eventId: string
  programId: string
  startPosition: number
}): Promise<{ ok: boolean; message: string; items: ListItem[] }> {
  const { data: templateItems } = await supabase
    .from('event_list_template_items')
    .select('label, position')
    .eq('template_id', input.templateId)
    .order('position')

  if (!templateItems || templateItems.length === 0) {
    return { ok: false, message: 'That template is empty.', items: [] }
  }

  const { data, error } = await supabase
    .from(LIST_TABLE[input.kind])
    .insert(
      templateItems.map((row, index) => ({
        event_id: input.eventId,
        program_id: input.programId,
        label: row.label,
        position: input.startPosition + index,
      })),
    )
    .select(ITEM_COLUMNS)

  if (error) return { ok: false, message: error.message, items: [] }
  return {
    ok: true,
    message: `Added ${templateItems.length} item${templateItems.length === 1 ? '' : 's'}.`,
    items: (data ?? []) as ListItem[],
  }
}

export async function deleteTemplate(id: string) {
  const { error } = await supabase.from('event_list_templates').delete().eq('id', id)
  return { ok: !error, message: error?.message ?? 'Template deleted.' }
}
