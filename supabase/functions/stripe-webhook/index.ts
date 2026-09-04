/**
 * stripe-webhook
 *
 * The only door to mark_registration_paid(), which is revoked from anon and
 * authenticated precisely so that a browser cannot claim money arrived. This
 * function holds the service key and Stripe's signature is what earns it.
 *
 * Handles:
 *   checkout.session.completed / async_payment_succeeded
 *       -> mark_registration_paid(), which records the payment AND places the
 *          child on the roster in one transaction. A client-side redirect
 *          confirms nothing; a parent who closes the tab the instant they pay
 *          still ends up registered, because this is what does the work.
 *   account.updated
 *       -> refreshes what the connected account can actually do, so the status
 *          shown in the app comes from Stripe rather than from somebody having
 *          clicked a button once.
 *
 * Fails CLOSED. With no signing secret configured it refuses everything rather
 * than trusting an unverified body -- an endpoint that accepts unsigned events
 * is an endpoint where anyone on the internet can register a child for free.
 *
 * Deployed with --no-verify-jwt: Stripe cannot present a Supabase JWT. The
 * signature is the authentication, which is why the secret is not optional.
 */

import Stripe from 'npm:stripe@17.7.0'
import { createClient } from 'jsr:@supabase/supabase-js@2'

const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY')
const WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ALLOW_LIVE = Deno.env.get('STRIPE_ALLOW_LIVE') === 'true'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (!STRIPE_SECRET_KEY) {
    return json({ error: 'STRIPE_SECRET_KEY is not set on this function' }, 500)
  }
  if (!WEBHOOK_SECRET) {
    // Deliberate: no secret, no processing. See the note above.
    return json(
      { error: 'STRIPE_WEBHOOK_SECRET is not set; refusing to process unverified events' },
      500,
    )
  }
  const live = STRIPE_SECRET_KEY.startsWith('sk_live_')
  if (live && !ALLOW_LIVE) {
    return json({ error: 'refusing to run with a live Stripe key' }, 403)
  }

  const stripe = new Stripe(STRIPE_SECRET_KEY, {
    httpClient: Stripe.createFetchHttpClient(),
  })

  const signature = req.headers.get('stripe-signature')
  if (!signature) return json({ error: 'missing stripe-signature' }, 400)

  // The RAW body: parsing it first would change the bytes the signature covers.
  const raw = await req.text()

  let event: Stripe.Event
  try {
    // Async because signature verification needs SubtleCrypto in Deno.
    event = await stripe.webhooks.constructEventAsync(raw, signature, WEBHOOK_SECRET)
  } catch (err) {
    return json({ error: `signature verification failed: ${(err as Error).message}` }, 400)
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  try {
    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded': {
        const session = event.data.object as Stripe.Checkout.Session

        // An unpaid completed session is a real thing -- a bank debit still
        // clearing, for instance -- and it is not a paid registration.
        if (session.payment_status !== 'paid') {
          return json({ received: true, ignored: `payment_status ${session.payment_status}` })
        }

        const registrationId = session.metadata?.registration_id
        if (!registrationId) {
          return json({ received: true, ignored: 'no registration_id in metadata' })
        }

        const { data, error } = await admin.rpc('mark_registration_paid', {
          p_registration_id: registrationId,
          p_processor: 'stripe',
          p_payment_ref: (session.payment_intent as string) ?? session.id,
          p_amount_cents: session.amount_total ?? null,
        })
        if (error) return json({ error: error.message }, 500)

        return json({ received: true, event: event.type, result: data })
      }

      case 'account.updated': {
        const account = event.data.object as Stripe.Account
        const { error } = await admin
          .from('org_payment_accounts')
          .update({
            charges_enabled: account.charges_enabled ?? false,
            payouts_enabled: account.payouts_enabled ?? false,
            details_submitted: account.details_submitted ?? false,
            requirements: account.requirements ?? null,
            last_checked_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('external_id', account.id)
        if (error) return json({ error: error.message }, 500)

        return json({ received: true, event: event.type, account: account.id })
      }

      default:
        return json({ received: true, ignored: event.type })
    }
  } catch (err) {
    return json({ error: (err as Error).message }, 500)
  }
})
