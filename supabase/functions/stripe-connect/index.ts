/**
 * stripe-connect
 *
 * Onboards an organization onto its own Stripe account and keeps the status of
 * that account honest.
 *
 * Two actions:
 *   create_link     -- create the Express account if it does not exist yet and
 *                      return a fresh Stripe-hosted onboarding link
 *   refresh_status  -- ask Stripe what the account can actually do and write
 *                      that down
 *
 * The charge model is direct charges: the connected account is the merchant of
 * record, the money is theirs, and refunds and chargebacks are theirs too. The
 * platform never holds the funds. Nothing here creates a transfer or a
 * destination, which is what would make it otherwise.
 *
 * Live mode is refused outright unless somebody deliberately sets
 * STRIPE_ALLOW_LIVE. A test key cannot take real money, but a live key pasted
 * into the wrong box can, and that mistake is one nobody gets to undo.
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

  let payload: { action?: string; organization_id?: string }
  try {
    payload = await req.json()
  } catch {
    return json({ error: 'expected a JSON body' }, 400)
  }

  const { action, organization_id: orgId } = payload
  if (!orgId) return json({ error: 'organization_id is required' }, 400)

  // -- who is asking ---------------------------------------------------------
  // The caller's own token, so is_org_leader() answers for them and not for
  // the service role, which would say yes to anybody.
  const authHeader = req.headers.get('Authorization') ?? ''
  const caller = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  })

  const { data: userData } = await caller.auth.getUser()
  if (!userData.user) return json({ error: 'authentication required' }, 401)

  const { data: isLeader } = await caller.rpc('is_org_leader', { p_organization_id: orgId })
  if (isLeader !== true) {
    return json({ error: 'only an owner or athletic director can set up payments' }, 403)
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  const { data: org } = await admin
    .from('organizations')
    .select('id, name')
    .eq('id', orgId)
    .single()
  if (!org) return json({ error: 'no such organization' }, 404)

  const { data: existing } = await admin
    .from('org_payment_accounts')
    .select('external_id')
    .eq('organization_id', orgId)
    .maybeSingle()

  // -------------------------------------------------------------- actions --

  if (action === 'create_link') {
    let accountId = existing?.external_id ?? null

    if (!accountId) {
      // Accounts v1. Stripe now steers new Connect platforms to v2, but v2 is
      // a preview feature on this account -- it refuses any request without a
      // .preview version header -- and a preview API is not a foundation for
      // something that will take real money. v1 is GA and well-trodden; it
      // needs the Accounts v1 toggle enabled once in the dashboard, which is
      // the smaller and far safer of the two costs.
      const account = await stripe.accounts.create({
        type: 'express',
        email: userData.user.email ?? undefined,
        business_profile: { name: org.name },
        // Direct charges need the account to take cards in its own right.
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        metadata: { organization_id: orgId, teamops_org_name: org.name },
      })
      accountId = account.id

      await admin.from('org_payment_accounts').upsert(
        {
          organization_id: orgId,
          processor: 'stripe',
          external_id: accountId,
          livemode: live,
          last_checked_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'organization_id' },
      )
    }

    const link = await stripe.accountLinks.create({
      account: accountId,
      // Stripe sends them back here if the link went stale before they
      // finished, and the app just asks for another one.
      refresh_url: `${APP_URL}/org/${orgId}?stripe=refresh`,
      return_url: `${APP_URL}/org/${orgId}?stripe=return`,
      type: 'account_onboarding',
    })

    return json({ url: link.url, account_id: accountId, livemode: live })
  }

  if (action === 'refresh_status') {
    if (!existing?.external_id) {
      return json({ status: 'not_connected', account_id: null })
    }

    const account = await stripe.accounts.retrieve(existing.external_id)

    await admin
      .from('org_payment_accounts')
      .update({
        charges_enabled: account.charges_enabled ?? false,
        payouts_enabled: account.payouts_enabled ?? false,
        details_submitted: account.details_submitted ?? false,
        // Derived from the key rather than the account: Stripe does not put
        // livemode on an Account, and the key is what actually decides whose
        // money this is.
        livemode: live,
        requirements: account.requirements ?? null,
        last_checked_at: new Date().toISOString(),
        connected_at: account.charges_enabled ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq('organization_id', orgId)

    const { data: status } = await admin.rpc('org_payment_status', { p_organization_id: orgId })

    return json({
      status,
      account_id: existing.external_id,
      charges_enabled: account.charges_enabled ?? false,
      payouts_enabled: account.payouts_enabled ?? false,
      details_submitted: account.details_submitted ?? false,
      livemode: live,
      requirements: account.requirements ?? null,
    })
  }

  return json({ error: `unknown action ${action}` }, 400)

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