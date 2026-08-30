import { supabase } from './supabaseClient'
import type { Member } from './roster'

export type EquipmentItem = {
  id: string
  program_id: string
  name: string
  category: string
  total_quantity: number
  condition: string | null
  purchase_date: string | null
}

export type Checkout = {
  id: string
  equipment_item_id: string
  member_id: string
  quantity: number
  checked_out_at: string
  returned_at: string | null
  notes: string | null
}

const ITEM_COLUMNS = 'id, program_id, name, category, total_quantity, condition, purchase_date'
const CHECKOUT_COLUMNS =
  'id, equipment_item_id, member_id, quantity, checked_out_at, returned_at, notes'

/** Offered as quick picks; the field itself is free text. */
export const CATEGORIES = [
  'Helmets',
  'Shoulder pads',
  'Jerseys',
  'Balls',
  'Training',
  'Medical',
  'Other',
]

/**
 * Formats a date column without letting the timezone move it.
 *
 * purchase_date is a plain date. new Date('2026-08-30') parses as UTC
 * midnight, which renders as the 29th anywhere west of Greenwich, so the parts
 * are read straight off the string instead.
 */
export function formatDateOnly(value: string): string {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function formatSince(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

/**
 * Everything the equipment screen needs.
 *
 * The same queries serve staff and the roster: RLS narrows items to the ones a
 * player is actually holding and checkouts to their own, so a player's copy of
 * this result is already their personal list.
 */
export async function loadEquipment(programId: string) {
  const [itemsResult, checkoutsResult, membersResult] = await Promise.all([
    supabase.from('equipment_items').select(ITEM_COLUMNS).eq('program_id', programId).order('name'),
    supabase
      .from('equipment_checkouts')
      .select(CHECKOUT_COLUMNS)
      .eq('program_id', programId)
      .order('checked_out_at', { ascending: false }),
    supabase
      .from('program_members')
      .select('id, user_id, display_name, role, phone_number, joined_at')
      .eq('program_id', programId)
      .order('display_name'),
  ])

  return {
    items: (itemsResult.data ?? []) as EquipmentItem[],
    checkouts: (checkoutsResult.data ?? []) as Checkout[],
    members: (membersResult.data ?? []) as Member[],
    error: itemsResult.error?.message ?? null,
  }
}

/** Outstanding means returned_at is null. Nothing else counts as "out". */
export function outstanding(checkouts: Checkout[]): Checkout[] {
  return checkouts.filter((c) => c.returned_at === null)
}

export function availableCount(item: EquipmentItem, checkouts: Checkout[]): number {
  const out = outstanding(checkouts)
    .filter((c) => c.equipment_item_id === item.id)
    .reduce((sum, c) => sum + c.quantity, 0)
  return item.total_quantity - out
}

export type ItemInput = {
  name: string
  category: string
  totalQuantity: string
  condition: string
  purchaseDate: string
}

export const EMPTY_ITEM: ItemInput = {
  name: '',
  category: '',
  totalQuantity: '1',
  condition: '',
  purchaseDate: '',
}

function validate(input: ItemInput): { ok: false; message: string } | { ok: true; quantity: number } {
  if (!input.name.trim()) return { ok: false, message: 'Give the item a name.' }
  if (!input.category.trim()) return { ok: false, message: 'Pick or type a category.' }
  const quantity = Number(input.totalQuantity)
  if (!Number.isInteger(quantity) || quantity < 1) {
    return { ok: false, message: 'How many do you have? Use a whole number of 1 or more.' }
  }
  return { ok: true, quantity }
}

export async function createItem(
  programId: string,
  input: ItemInput,
): Promise<{ ok: boolean; message: string; item?: EquipmentItem }> {
  const checked = validate(input)
  if (!checked.ok) return checked

  const { data: userData } = await supabase.auth.getUser()
  const userId = userData.user?.id
  if (!userId) return { ok: false, message: 'You need to be logged in.' }

  const { data, error } = await supabase
    .from('equipment_items')
    .insert({
      program_id: programId,
      name: input.name.trim(),
      category: input.category.trim(),
      total_quantity: checked.quantity,
      condition: input.condition.trim() || null,
      purchase_date: input.purchaseDate || null,
      created_by: userId,
    })
    .select(ITEM_COLUMNS)
    .single()

  if (error) return { ok: false, message: error.message }
  return { ok: true, message: 'Added.', item: data as EquipmentItem }
}

export async function updateItem(
  itemId: string,
  input: ItemInput,
): Promise<{ ok: boolean; message: string; item?: EquipmentItem }> {
  const checked = validate(input)
  if (!checked.ok) return checked

  const { data, error } = await supabase
    .from('equipment_items')
    .update({
      name: input.name.trim(),
      category: input.category.trim(),
      total_quantity: checked.quantity,
      condition: input.condition.trim() || null,
      purchase_date: input.purchaseDate || null,
    })
    .eq('id', itemId)
    .select(ITEM_COLUMNS)

  if (error) return { ok: false, message: error.message }
  if (!data || data.length === 0) return { ok: false, message: 'Only a coach can edit equipment.' }
  return { ok: true, message: 'Saved.', item: data[0] as EquipmentItem }
}

export async function deleteItem(itemId: string) {
  const { error, count } = await supabase
    .from('equipment_items')
    .delete({ count: 'exact' })
    .eq('id', itemId)
  if (error) return { ok: false, message: error.message }
  if (!count) return { ok: false, message: 'Only a coach can remove equipment.' }
  return { ok: true, message: 'Removed.' }
}

export async function checkOut(input: {
  programId: string
  itemId: string
  memberId: string
  quantity: number
  notes: string
}): Promise<{ ok: boolean; message: string; checkout?: Checkout }> {
  const { data: userData } = await supabase.auth.getUser()
  const userId = userData.user?.id
  if (!userId) return { ok: false, message: 'You need to be logged in.' }

  const { data, error } = await supabase
    .from('equipment_checkouts')
    .insert({
      program_id: input.programId,
      equipment_item_id: input.itemId,
      member_id: input.memberId,
      quantity: input.quantity,
      checked_out_by: userId,
      notes: input.notes.trim() || null,
    })
    .select(CHECKOUT_COLUMNS)
    .single()

  if (error) {
    // The supply trigger speaks in plain language already; pass it through.
    return { ok: false, message: error.message.replace(/^equipment: /, '') }
  }
  return { ok: true, message: 'Checked out.', checkout: data as Checkout }
}

/** Returning stamps the row rather than deleting it, so history survives. */
export async function checkIn(
  checkoutId: string,
): Promise<{ ok: boolean; message: string; checkout?: Checkout }> {
  const { data: userData } = await supabase.auth.getUser()
  const userId = userData.user?.id

  const { data, error } = await supabase
    .from('equipment_checkouts')
    .update({ returned_at: new Date().toISOString(), returned_by: userId })
    .eq('id', checkoutId)
    .select(CHECKOUT_COLUMNS)

  if (error) return { ok: false, message: error.message }
  if (!data || data.length === 0) {
    return { ok: false, message: 'Only a coach can check equipment back in.' }
  }
  return { ok: true, message: 'Checked in.', checkout: data[0] as Checkout }
}
