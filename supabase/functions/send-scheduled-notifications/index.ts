/**
 * send-scheduled-notifications
 *
 * Delivers due rows from scheduled_tasks as web push notifications.
 *
 * Intended to be invoked on a schedule (every minute). Each run:
 *   1. Atomically claims every task where send_at <= now() and sent = false
 *   2. Resolves the recipients for each task from program_members, honouring
 *      target_role (null = the whole program)
 *   3. Looks up those users' push_subscriptions
 *   4. Sends a push to each subscription with the VAPID keys
 *   5. Prunes subscriptions the push service reports as gone (404 / 410)
 *
 * Runs with the service role, so RLS does not apply here. That is deliberate:
 * the worker has to read subscriptions belonging to every member of a program,
 * which no ordinary user is permitted to do.
 */

import { createClient } from 'jsr:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

// ---------------------------------------------------------------- config ----

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const VAPID_PUBLIC_KEY = Deno.env.get('VITE_VAPID_PUBLIC_KEY') ??
  Deno.env.get('VAPID_PUBLIC_KEY')!
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')!
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@coachorg.app'
const CRON_SECRET = Deno.env.get('CRON_SECRET')

// Push services reject a payload larger than ~4 KB.
const MAX_BODY_CHARS = 500

type Task = {
  id: string
  program_id: string
  title: string
  body: string | null
  target_role: string | null
}

type SubscriptionRow = {
  id: string
  user_id: string
  subscription: {
    endpoint: string
    keys: { p256dh: string; auth: string }
  }
}

// ----------------------------------------------------------------- auth ----

/**
 * The function must not be publicly invocable -- anyone who could call it
 * could drain the queue and silence real reminders. Accepts either an
 * explicit CRON_SECRET or the service role key, which is what pg_cron/pg_net
 * will present.
 */
function authorized(req: Request): boolean {
  const bearer = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
  const headerSecret = req.headers.get('x-cron-secret')?.trim()

  if (CRON_SECRET && (headerSecret === CRON_SECRET || bearer === CRON_SECRET)) return true
  if (bearer && bearer === SERVICE_ROLE_KEY) return true
  return false
}

// ----------------------------------------------------------------- main ----

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return json({ error: 'Method not allowed' }, 405)
  }
  if (!authorized(req)) {
    return json({ error: 'Unauthorized' }, 401)
  }
  if (!VAPID_PRIVATE_KEY || !VAPID_PUBLIC_KEY) {
    return json({ error: 'VAPID keys are not configured' }, 500)
  }

  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // -- 1. Claim due tasks -----------------------------------------------
  //
  // The UPDATE ... WHERE sent = false RETURNING is the claim: two overlapping
  // runs cannot both take the same row, because the second finds sent = true.
  //
  // Trade-off: this is at-most-once. A task is marked sent before its pushes
  // go out, so a crash mid-send drops those notifications rather than
  // re-sending them on the next tick. For a reminder that reads "bring cleats"
  // a duplicate is worse than a miss; revisit if that stops being true.
  const { data: claimed, error: claimError } = await supabase
    .from('scheduled_tasks')
    .update({ sent: true })
    .eq('sent', false)
    .lte('send_at', new Date().toISOString())
    .select('id, program_id, title, body, target_role')

  if (claimError) {
    return json({ error: `claim failed: ${claimError.message}` }, 500)
  }

  const tasks = (claimed ?? []) as Task[]
  if (tasks.length === 0) {
    return json({ claimed: 0, sent: 0, failed: 0, pruned: 0, tasks: [] })
  }

  let sent = 0
  let failed = 0
  const staleSubscriptionIds: string[] = []
  const perTask: Array<Record<string, unknown>> = []

  for (const task of tasks) {
    // -- 2. Recipients ---------------------------------------------------
    let memberQuery = supabase
      .from('program_members')
      .select('user_id')
      .eq('program_id', task.program_id)

    if (task.target_role) memberQuery = memberQuery.eq('role', task.target_role)

    const { data: members, error: memberError } = await memberQuery
    if (memberError) {
      perTask.push({ id: task.id, error: memberError.message })
      continue
    }

    const userIds = [...new Set((members ?? []).map((m) => m.user_id as string))]
    if (userIds.length === 0) {
      perTask.push({ id: task.id, recipients: 0, sent: 0, note: 'no members matched' })
      continue
    }

    // -- 3. Their subscriptions -------------------------------------------
    const { data: subs, error: subError } = await supabase
      .from('push_subscriptions')
      .select('id, user_id, subscription')
      .in('user_id', userIds)

    if (subError) {
      perTask.push({ id: task.id, error: subError.message })
      continue
    }

    const subscriptions = (subs ?? []) as SubscriptionRow[]

    const payload = JSON.stringify({
      title: task.title,
      body: (task.body ?? '').slice(0, MAX_BODY_CHARS),
      url: `/program/${task.program_id}`,
      tag: `task-${task.id}`,
      taskId: task.id,
    })

    // -- 4. Deliver --------------------------------------------------------
    const results = await Promise.allSettled(
      subscriptions.map((row) =>
        webpush.sendNotification(row.subscription, payload).catch((err: unknown) => {
          const status = (err as { statusCode?: number })?.statusCode
          // 404/410 mean the browser threw the subscription away. Keeping it
          // would fail forever, so collect it for pruning.
          if (status === 404 || status === 410) staleSubscriptionIds.push(row.id)
          throw err
        }),
      ),
    )

    const taskSent = results.filter((r) => r.status === 'fulfilled').length
    const taskFailed = results.length - taskSent
    sent += taskSent
    failed += taskFailed

    perTask.push({
      id: task.id,
      title: task.title,
      targetRole: task.target_role ?? 'everyone',
      recipients: userIds.length,
      subscriptions: subscriptions.length,
      sent: taskSent,
      failed: taskFailed,
    })
  }

  // -- 5. Prune dead subscriptions ----------------------------------------
  let pruned = 0
  if (staleSubscriptionIds.length > 0) {
    const { error: pruneError, count } = await supabase
      .from('push_subscriptions')
      .delete({ count: 'exact' })
      .in('id', staleSubscriptionIds)
    if (!pruneError) pruned = count ?? staleSubscriptionIds.length
  }

  return json({ claimed: tasks.length, sent, failed, pruned, tasks: perTask })
})

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
