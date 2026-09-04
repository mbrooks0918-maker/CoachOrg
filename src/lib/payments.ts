import { supabase } from './supabaseClient'

/**
 * Payments, as far as the browser is concerned.
 *
 * Which is deliberately not far. The client never sees a card, never holds a
 * Stripe key, and never decides that money arrived -- it asks an edge function
 * for a URL and navigates to it. Everything that matters happens server-side
 * and is confirmed by the webhook.
 */

export type PaymentStatus = 'not_connected' | 'pending' | 'charges_only' | 'ready'

export type ConnectStatus = {
  status: PaymentStatus
  account_id: string | null
  charges_enabled?: boolean
  payouts_enabled?: boolean
  details_submitted?: boolean
  livemode?: boolean
  requirements?: { currently_due?: string[]; disabled_reason?: string | null } | null
}

async function callConnect(
  action: 'create_link' | 'refresh_status',
  organizationId: string,
): Promise<{ ok: boolean; message: string; data?: Record<string, unknown> }> {
  const { data, error } = await supabase.functions.invoke('stripe-connect', {
    body: { action, organization_id: organizationId },
  })

  if (error) {
    // Edge functions return their detail in the body even on a non-2xx, and
    // Stripe's own message is the one worth showing.
    const detail = (data as { error?: string } | null)?.error
    return { ok: false, message: detail ?? error.message }
  }
  if ((data as { error?: string })?.error) {
    return { ok: false, message: (data as { error: string }).error }
  }
  return { ok: true, message: 'ok', data: data as Record<string, unknown> }
}

/** Reads the account's real state from Stripe and writes it down. */
export async function refreshPaymentStatus(
  organizationId: string,
): Promise<{ ok: boolean; message: string; status?: ConnectStatus }> {
  const result = await callConnect('refresh_status', organizationId)
  if (!result.ok) return { ok: false, message: result.message }
  return { ok: true, message: 'ok', status: result.data as unknown as ConnectStatus }
}

/** Creates the account if needed and returns Stripe's hosted onboarding URL. */
export async function startConnectOnboarding(
  organizationId: string,
): Promise<{ ok: boolean; message: string; url?: string }> {
  const result = await callConnect('create_link', organizationId)
  if (!result.ok) return { ok: false, message: result.message }
  return { ok: true, message: 'ok', url: result.data?.url as string }
}

/**
 * Turns a registration that owes money into a Stripe Checkout URL.
 *
 * Returns the URL rather than navigating, so the caller decides when the page
 * goes away -- a redirect fired from inside a helper is a redirect nobody can
 * put a loading state in front of.
 */
export async function startCheckout(
  registrationId: string,
): Promise<{ ok: boolean; message: string; url?: string }> {
  const { data, error } = await supabase.functions.invoke('stripe-checkout', {
    body: { registration_id: registrationId },
  })

  if (error) {
    const detail = (data as { error?: string } | null)?.error
    return { ok: false, message: detail ?? error.message }
  }
  if ((data as { error?: string })?.error) {
    return { ok: false, message: (data as { error: string }).error }
  }
  return { ok: true, message: 'ok', url: (data as { url: string }).url }
}

/** "$75.00" */
export function money(cents: number, currency = 'usd'): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(cents / 100)
}

export const STATUS_LABEL: Record<PaymentStatus, string> = {
  not_connected: 'Not connected',
  pending: 'Setup unfinished',
  charges_only: 'Taking payments, payouts on hold',
  ready: 'Connected and ready',
}
