import { supabase } from './supabaseClient'

/**
 * The coaching resource library.
 *
 * Organization-scoped, not program-scoped: concussion guidance applies to
 * whoever is on the field, and the coach running soccer in the autumn is often
 * the one running basketball in the winter. So everything here takes an
 * organization id, never a program id.
 *
 * Staff curate it; the policies on both tables decide who that is, and this
 * file never asks. A failed write comes back as a sentence rather than a
 * Postgres error, because the person reading it is a coach.
 */

export type Resource = {
  id: string
  category_id: string
  title: string
  description: string | null
  url: string
  youtube_id: string | null
  tag: string | null
  position: number
}

export type ResourceCategory = {
  id: string
  title: string
  blurb: string | null
  position: number
  items: Resource[]
}

/** Everything in one organization's library, grouped and ordered. */
export async function loadResources(
  organizationId: string,
): Promise<{ categories: ResourceCategory[]; error: string }> {
  const [categoryResult, resourceResult] = await Promise.all([
    supabase
      .from('resource_categories')
      .select('id, title, blurb, position')
      .eq('organization_id', organizationId)
      .order('position')
      .order('title'),
    supabase
      .from('resources')
      .select('id, category_id, title, description, url, youtube_id, tag, position')
      .eq('organization_id', organizationId)
      .order('position')
      .order('title'),
  ])

  if (categoryResult.error || resourceResult.error) {
    return { categories: [], error: 'Could not load the library. Try again in a moment.' }
  }

  const items = (resourceResult.data ?? []) as Resource[]

  const categories = (categoryResult.data ?? []).map((category) => ({
    ...(category as Omit<ResourceCategory, 'items'>),
    items: items.filter((item) => item.category_id === category.id),
  }))

  return { categories, error: '' }
}

/** How many links the library holds. Used by the home tile. */
export async function countResources(organizationId: string): Promise<number> {
  const { count } = await supabase
    .from('resources')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', organizationId)
  return count ?? 0
}

export type NewResource = {
  categoryId: string | null
  newCategory: string
  title: string
  description: string
  url: string
  youtubeId: string
  tag: string
}

export async function addResource(
  organizationId: string,
  draft: NewResource,
): Promise<{ ok: boolean; message: string }> {
  const { error } = await supabase.rpc('add_resource', {
    p_organization_id: organizationId,
    p_category_id: draft.categoryId,
    p_new_category: draft.newCategory,
    p_title: draft.title,
    p_description: draft.description,
    p_url: draft.url,
    p_youtube_id: draft.youtubeId,
    p_tag: draft.tag,
  })

  if (error) return { ok: false, message: describeWriteError(error, 'Could not add that resource.') }
  return { ok: true, message: '' }
}

export async function deleteResource(id: string): Promise<{ ok: boolean; message: string }> {
  // .select() matters. A delete the policy filters out is not an error -- it
  // matches no rows and reports success -- so without asking for the deleted
  // row back, somebody without permission would be told the link was gone
  // while it sat there waiting for the next refresh.
  const { data, error } = await supabase.from('resources').delete().eq('id', id).select('id')
  if (error) return { ok: false, message: describeWriteError(error, 'Could not delete that resource.') }
  if (!data || data.length === 0) return { ok: false, message: NOT_ALLOWED }
  return { ok: true, message: '' }
}

export async function renameCategory(
  id: string,
  title: string,
): Promise<{ ok: boolean; message: string }> {
  const { data, error } = await supabase
    .from('resource_categories')
    .update({ title: title.trim() })
    .eq('id', id)
    .select('id')
  if (error) return { ok: false, message: describeWriteError(error, 'Could not rename that section.') }
  if (!data || data.length === 0) return { ok: false, message: NOT_ALLOWED }
  return { ok: true, message: '' }
}

export async function deleteCategory(id: string): Promise<{ ok: boolean; message: string }> {
  const { data, error } = await supabase
    .from('resource_categories')
    .delete()
    .eq('id', id)
    .select('id')
  if (error) return { ok: false, message: describeWriteError(error, 'Could not delete that section.') }
  if (!data || data.length === 0) return { ok: false, message: NOT_ALLOWED }
  return { ok: true, message: '' }
}

/**
 * A Postgres error, said out loud.
 *
 * Only the three codes this screen can actually provoke are named. Anything
 * else falls through to the caller's sentence rather than being guessed at.
 */
const NOT_ALLOWED = 'You do not have permission to change the library.'

function describeWriteError(error: { code?: string; message?: string }, fallback: string): string {
  switch (error.code) {
    case '23505':
      return 'There is already a section with that name.'
    case '23503':
      // The category still holds resources. The interface hides the control in
      // that case, so reaching this means the list was stale -- somebody else
      // added to the section while it was on screen.
      return 'That section still has resources in it. Reload, then delete them first.'
    case '42501':
      return NOT_ALLOWED
    default:
      return error.message ? `${fallback} ${error.message}` : fallback
  }
}

// ---------------------------------------------------------------- validation

/**
 * What a coach typed, turned into something the database will accept.
 *
 * Pasting a YouTube link into the YouTube field is the obvious thing to do, so
 * it is handled rather than rejected: watch links, youtu.be links, /embed/ and
 * /shorts/ links all give up their id here. A bare id passes through.
 */
export function extractYouTubeId(input: string): string | null {
  const value = input.trim()
  if (!value) return null
  if (/^[A-Za-z0-9_-]{11}$/.test(value)) return value

  const patterns = [
    /[?&]v=([A-Za-z0-9_-]{11})/,
    /youtu\.be\/([A-Za-z0-9_-]{11})/,
    /\/embed\/([A-Za-z0-9_-]{11})/,
    /\/shorts\/([A-Za-z0-9_-]{11})/,
    /\/live\/([A-Za-z0-9_-]{11})/,
  ]
  for (const pattern of patterns) {
    const match = value.match(pattern)
    if (match) return match[1]
  }
  return null
}

/**
 * A URL a coach can paste without thinking about it.
 *
 * "breakthroughbasketball.com" is what people type, and refusing it over a
 * missing scheme would be pedantry -- https:// is added and the result is
 * parsed properly. Only something that still will not parse, or has no dot in
 * its host, is turned away.
 */
export function normaliseUrl(input: string): string | null {
  const value = input.trim()
  if (!value) return null

  const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value}`
  try {
    const url = new URL(withScheme)
    if (!url.hostname.includes('.')) return null
    if (/\s/.test(url.href)) return null
    return url.href
  } catch {
    return null
  }
}
