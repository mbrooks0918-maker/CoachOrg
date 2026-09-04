import { supabase } from './supabaseClient'

/**
 * Seasons, the questions they ask, and the sign-ups they collect.
 *
 * Everything here is reachable only for an organization on the registration
 * plan. That is enforced in the database -- the policies behind these tables
 * and the two public functions all check it -- so hiding the screens is a
 * courtesy rather than the lock.
 */

export type Season = {
  id: string
  program_id: string
  name: string
  starts_on: string | null
  ends_on: string | null
  registration_opens_at: string | null
  registration_closes_at: string | null
  capacity: number | null
  min_age: number | null
  max_age: number | null
  age_as_of: string | null
  public_token: string
  fee_cents: number | null
  currency: string
}

export type SeasonQuestion = {
  id: string
  season_id: string
  prompt: string
  kind: 'text' | 'boolean' | 'choice'
  options: string[]
  required: boolean
  position: number
}

export type Registration = {
  id: string
  person_id: string
  status: 'confirmed' | 'waitlisted' | 'withdrawn' | 'pending_payment'
  payment_status: string
  created_at: string
  people: { full_name: string } | null
}

/** What a stranger is allowed to see about a season. */
export type PublicSeason = {
  fee_cents: number | null
  season_id: string
  organization_id: string
  organization_name: string
  program_name: string
  sport: string
  season_name: string
  starts_on: string | null
  ends_on: string | null
  registration_opens_at: string
  registration_closes_at: string
  open_now: boolean
  capacity: number | null
  spots_remaining: number | null
  min_age: number | null
  max_age: number | null
  age_as_of: string | null
  questions: Omit<SeasonQuestion, 'season_id' | 'position'>[]
}

const SEASON_FIELDS =
  'id, program_id, name, starts_on, ends_on, registration_opens_at, registration_closes_at, capacity, min_age, max_age, age_as_of, public_token, fee_cents, currency'

// ------------------------------------------------------------------- staff

export async function loadSeasons(programId: string): Promise<Season[]> {
  const { data } = await supabase
    .from('seasons')
    .select(SEASON_FIELDS)
    .eq('program_id', programId)
    .order('starts_on', { ascending: false, nullsFirst: false })
  return (data ?? []) as Season[]
}

export async function saveSeason(
  programId: string,
  season: Partial<Season> & { name: string },
): Promise<{ ok: boolean; message: string; season?: Season }> {
  const row = {
    name: season.name.trim(),
    starts_on: season.starts_on || null,
    ends_on: season.ends_on || null,
    registration_opens_at: season.registration_opens_at || null,
    registration_closes_at: season.registration_closes_at || null,
    capacity: season.capacity ?? null,
    min_age: season.min_age ?? null,
    max_age: season.max_age ?? null,
    age_as_of: season.age_as_of || null,
    fee_cents: season.fee_cents ?? null,
  }

  const query = season.id
    ? supabase.from('seasons').update(row).eq('id', season.id)
    : supabase.from('seasons').insert({ ...row, program_id: programId })

  const { data, error } = await query.select(SEASON_FIELDS).single()
  if (error) {
    if (error.code === '23505') return { ok: false, message: 'A season already has that name.' }
    return { ok: false, message: error.message }
  }
  return { ok: true, message: 'Saved.', season: data as Season }
}

export async function loadQuestions(seasonId: string): Promise<SeasonQuestion[]> {
  const { data } = await supabase
    .from('season_questions')
    .select('id, season_id, prompt, kind, options, required, position')
    .eq('season_id', seasonId)
    .order('position')
  return (data ?? []) as SeasonQuestion[]
}

export async function addQuestion(
  seasonId: string,
  question: { prompt: string; kind: SeasonQuestion['kind']; options: string[]; required: boolean },
  position: number,
): Promise<{ ok: boolean; message: string }> {
  const { error } = await supabase.from('season_questions').insert({
    season_id: seasonId,
    prompt: question.prompt.trim(),
    kind: question.kind,
    options: question.kind === 'choice' ? question.options : [],
    required: question.required,
    position,
  })
  if (error) return { ok: false, message: error.message.replace(/^season_questions: /, '') }
  return { ok: true, message: 'Added.' }
}

export async function deleteQuestion(id: string): Promise<{ ok: boolean; message: string }> {
  const { error, count } = await supabase
    .from('season_questions')
    .delete({ count: 'exact' })
    .eq('id', id)
  if (error) return { ok: false, message: error.message }
  if (!count) return { ok: false, message: 'You do not have permission to remove that question.' }
  return { ok: true, message: 'Removed.' }
}

export async function loadRegistrations(seasonId: string): Promise<Registration[]> {
  const { data } = await supabase
    .from('registrations')
    .select('id, person_id, status, payment_status, created_at, people(full_name)')
    .eq('season_id', seasonId)
    .order('created_at')
  return (data ?? []) as unknown as Registration[]
}

export async function confirmRegistration(id: string): Promise<{ ok: boolean; message: string }> {
  const { error } = await supabase.rpc('confirm_registration', { p_registration_id: id })
  if (error) return { ok: false, message: error.message.replace(/^confirm_registration: /, '') }
  return { ok: true, message: 'Confirmed.' }
}

export async function withdrawRegistration(id: string): Promise<{ ok: boolean; message: string }> {
  const { error } = await supabase.rpc('withdraw_registration', { p_registration_id: id })
  if (error) return { ok: false, message: error.message.replace(/^withdraw_registration: /, '') }
  return { ok: true, message: 'Withdrawn.' }
}

// ------------------------------------------------------------------ public

export async function loadPublicSeason(
  token: string,
): Promise<{ season?: PublicSeason; error?: string }> {
  const { data, error } = await supabase.rpc('public_season_info', { p_token: token })
  if (error) return { error: 'That registration link is not valid.' }
  return { season: data as PublicSeason }
}

/** Children the signed-in adult is already responsible for, in this organization. */
export async function loadMyChildren(
  organizationId: string,
): Promise<{ id: string; full_name: string }[]> {
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return []
  const { data } = await supabase
    .from('guardians')
    .select('person_id, people(id, full_name, organization_id)')
    .eq('guardian_user_id', auth.user.id)
  return (data ?? [])
    .map((row) => row.people as unknown as { id: string; full_name: string; organization_id: string })
    .filter((p) => p && p.organization_id === organizationId)
    .map((p) => ({ id: p.id, full_name: p.full_name }))
}

export type SubmitInput = {
  token: string
  parentName: string
  parentPhone: string
  personId: string | null
  childName: string
  birthdate: string
  emergencyName: string
  emergencyPhone: string
  medicalNotes: string
  answers: Record<string, string>
}

export type SubmitResult = {
  registration_id: string
  status: 'confirmed' | 'waitlisted' | 'pending_payment'
  requires_payment?: boolean
  amount_cents?: number | null
  currency?: string
  waitlist_rank: number | null
  child_name: string
  season_name: string
  program_name: string
  program_id: string
}

export async function submitRegistration(
  input: SubmitInput,
): Promise<{ ok: boolean; message: string; result?: SubmitResult }> {
  const { data, error } = await supabase.rpc('submit_registration', {
    p_token: input.token,
    p_parent_name: input.parentName.trim() || null,
    p_parent_phone: input.parentPhone.trim() || null,
    p_person_id: input.personId,
    p_child_name: input.childName.trim() || null,
    p_birthdate: input.birthdate || null,
    p_emergency_contact_name: input.emergencyName.trim() || null,
    p_emergency_contact_phone: input.emergencyPhone.trim() || null,
    p_medical_notes: input.medicalNotes.trim() || null,
    p_answers: input.answers,
  })

  if (error) {
    return {
      ok: false,
      message: error.message.replace(/^submit_registration: /, ''),
    }
  }
  return { ok: true, message: 'Registered.', result: data as SubmitResult }
}

/**
 * "Sat, 5 Sep 2026".
 *
 * Takes both the date columns (starts_on, age_as_of) and the timestamps
 * (registration_opens_at). A date has no timezone, so handing "2026-09-15"
 * straight to Date() makes it midnight UTC and renders it as the 14th
 * anywhere west of Greenwich -- a season shown starting the day before the
 * one its organizer typed. Pinning it to local midnight keeps the date the
 * date. Timestamps are real instants and are converted as normal.
 */
export function longDate(value: string | null): string {
  if (!value) return '—'
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value)
  return new Date(dateOnly ? `${value}T00:00:00` : value).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

/** The age bracket in words, or null when the season takes anybody. */
export function bracketLabel(season: {
  min_age: number | null
  max_age: number | null
  age_as_of: string | null
}): string | null {
  if (season.min_age === null && season.max_age === null) return null
  const range =
    season.min_age !== null && season.max_age !== null
      ? `Ages ${season.min_age}–${season.max_age}`
      : season.min_age !== null
        ? `Ages ${season.min_age} and up`
        : `Ages ${season.max_age} and under`
  return season.age_as_of ? `${range}, as of ${longDate(season.age_as_of)}` : range
}
