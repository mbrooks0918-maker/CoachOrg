/**
 * stripe-checkout
 *
 * Turns a registration that owes money into a Stripe Checkout session on the
 * organization's OWN connected account.
 *
 * Hosted Checkout rather than Elements, for three reasons: card details never
 * touch this codebase or the browser bundle, Stripe carries the PCI burden and
 * the 3-D Secure flow, and there is no publishable key to ship or rotate --
 * the client only ever receives a URL to navigate to.
 *
 * DIRECT CHARGES, in the code and not just the plan: the session is created
 * with { stripeAccount }, which is the Stripe-Account header. The charge is
 * created ON the connected account, so the rec centre is the merchant of
 * record, the funds are theirs from the moment they settle, and refunds and
 * disputes are theirs to handle. There is deliberately no transfer_data and no
 * on_behalf_of -- either of those would make it a destination charge, route
 * the money through the platform, and make us the merchant of record instead.
 *
 * No application_fee_amount either: the platform cut is zero for now. The
 * schema carries the concept so a percentage can arrive later without a
 * migration; the code takes nothing today.
 */

import Stripe from 'npm:stripe@17.7.0'
import { createClient } from 'jsr:@supabase/supabase-js@2'

const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const APP_URL = Deno.env.get('APP_URL') ?? 'https://coach-org.vercel.app'
const ALLOW_LIVE = Deno.env.get('STRIPE_ALLOW_LIVE') === 'true'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  })
}

Deno.serve(async (req) => {
  try {

  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  if (!STRIPE_SECRET_KEY) {
    return json({ error: 'STRIPE_SECRET_KEY is not set on this function' }, 500)
  }
  const live = STRIPE_SECRET_KEY.startsWith('sk_live_')
  if (live && !ALLOW_LIVE) {
    return json(
      { error: 'refusing to run with a live Stripe key until STRIPE_ALLOW_LIVE is set' },
      403,
    )
  }

  const stripe = new Stripe(STRIPE_SECRET_KEY, {
    httpClient: Stripe.createFetchHttpClient(),
  })

  let payload: { registration_id?: string }
  try {
    payload = await req.json()
  } catch {
    return json({ error: 'expected a JSON body' }, 400)
  }
  const registrationId = payload.registration_id
  if (!registrationId) return json({ error: 'registration_id is required' }, 400)

  const authHeader = req.headers.get('Authorization') ?? ''
  const caller = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: userData } = await caller.auth.getUser()
  if (!userData.user) return json({ error: 'authentication required' }, 401)

  // Read it as the caller first. registrations_select already says who may see
  // a registration -- a family or the staff over that child -- so if this
  // comes back empty they have no business paying for it.
  const { data: visible } = await caller
    .from('registrations')
    .select('id')
    .eq('id', registrationId)
    .maybeSingle()
  if (!visible) return json({ error: 'no such registration' }, 404)

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  const { data: reg } = await admin
    .from('registrations')
    .select(
      'id, organization_id, program_id, season_id, person_id, status, payment_status, amount_cents',
    )
    .eq('id', registrationId)
    .single()
  if (!reg) return json({ error: 'no such registration' }, 404)

  if (reg.payment_status === 'paid') {
    return json({ error: 'that registration is already paid for', already_paid: true }, 409)
  }
  if (reg.status !== 'pending_payment') {
    return json({ error: `a ${reg.status} registration has nothing to pay` }, 409)
  }

  const [{ data: season }, { data: program }, { data: person }, { data: account }] =
    await Promise.all([
      admin.from('seasons').select('name, fee_cents, currency').eq('id', reg.season_id).single(),
      admin.from('programs').select('name').eq('id', reg.program_id).single(),
      admin.from('people').select('full_name').eq('id', reg.person_id).single(),
      admin
        .from('org_payment_accounts')
        .select('external_id, charges_enabled')
        .eq('organization_id', reg.organization_id)
        .maybeSingle(),
    ])

  if (!account?.external_id || !account.charges_enabled) {
    return json({ error: 'this organization cannot take payments yet' }, 409)
  }

  const amount = reg.amount_cents ?? season?.fee_cents ?? 0
  if (amount <= 0) return json({ error: 'that season has no fee' }, 409)

  const session = await stripe.checkout.sessions.create(
    {
      mode: 'payment',
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: season?.currency ?? 'usd',
            unit_amount: amount,
            product_data: {
              name: `${program?.name ?? 'Registration'} — ${season?.name ?? ''}`.trim(),
              description: person?.full_name ?? undefined,
            },
          },
        },
      ],
      // On both the session and the payment intent: the webhook reads whichever
      // event it is handed, and an event that cannot be traced back to a
      // registration is money nobody can match to a child.
      metadata: { registration_id: reg.id },
      payment_intent_data: { metadata: { registration_id: reg.id } },
      success_url: `${APP_URL}/program/${reg.program_id}?payment=success`,
      cancel_url: `${APP_URL}/program/${reg.program_id}?payment=cancelled`,
    },
    // THIS is the direct charge. The session, the payment intent and the money
    // all live on the connected account.
    { stripeAccount: account.external_id },
  )

  // Recorded now so a session can be traced even if the family never returns.
  await admin
    .from('registrations')
    .update({ processor: 'stripe', payment_ref: session.id })
    .eq('id', reg.id)

  return json({ url: session.url, session_id: session.id, livemode: live })

  } catch (err) {
    // Stripe's errors are the useful ones -- "Connect is not enabled",
    // "capability unavailable in your country" -- and a bare 500 hides them.
    const e = err as { message?: string; type?: string; code?: string }
    return json(
      { error: e.message ?? String(err), stripe_type: e.type, stripe_code: e.code },
      500,
    )
  }
})