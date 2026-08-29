/**
 * One-off seeding script -- NOT part of the app bundle.
 *
 * Builds a realistic roster against a program: staff, players and parents,
 * each a real auth user that joined through join_program() with a join code.
 *
 * Two ways to create the users:
 *
 *   1. SUPABASE_SERVICE_ROLE_KEY set -> admin.createUser({ email_confirm: true }).
 *      Works whether or not the project requires email confirmation.
 *   2. Key absent -> plain signUp(). Only works when the project has email
 *      confirmation turned off, because otherwise no session comes back and
 *      join_program() has no auth.uid() to attach the membership to.
 *
 * !! The service-role key bypasses RLS. Nothing under src/ imports this file,
 * !! and the variable has no VITE_ prefix, so Vite will not inline it into
 * !! client code.
 *
 * Usage:
 *   node --env-file=.env.local scripts/seedTestData.ts \
 *     --family ALB-FAM-XXXX --player ALB-PLYR-XXXX --staff ALB-STAFF-XXXX
 *
 *   node --env-file=.env.local scripts/seedTestData.ts --program-id <uuid>
 *
 * Optional:
 *   --players N --parents N --staff-count N     roster size
 *   --head-coach-email / --head-coach-password  promote one assistant to
 *                                               team_manager afterwards
 */

import { parseArgs } from 'node:util'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const PASSWORD = 'TestPass123!'
const EMAIL_DOMAIN = 'example.com' // IANA-reserved; cannot collide with a real mailbox

// ---------------------------------------------------------------- roster ----

const PLAYERS = [
  'Jalen Carter', 'Marcus Webb', 'Tyler Boyd', 'Devin Hart', 'Cole Sanders',
  'Isaiah Reed', 'Brayden Fox', 'Malik Turner', 'Owen Pierce', 'Rhett Callaway',
  'Andre Mosley', 'Grant Whitlow',
]

const PARENTS = [
  'Angela Carter', 'Dana Webb', 'Sonia Boyd', 'Rachel Hart',
  'Priya Sanders', 'Monique Reed', 'Karen Fox', 'Lydia Turner',
]

const STAFF = ['Ray Whitfield', 'Dee Ellison', 'Sam Okafor', 'Tony Marsh']

// ------------------------------------------------------------------ env ----

const url = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL
const anonKey = process.env.VITE_SUPABASE_ANON_KEY
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || undefined

if (!url || !anonKey) {
  console.error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY.')
  console.error('Run with: node --env-file=.env.local scripts/seedTestData.ts ...')
  process.exit(1)
}

// ----------------------------------------------------------------- args ----

const { values } = parseArgs({
  options: {
    family: { type: 'string' },
    player: { type: 'string' },
    staff: { type: 'string' },
    'program-id': { type: 'string' },
    players: { type: 'string' },
    parents: { type: 'string' },
    'staff-count': { type: 'string' },
    'head-coach-email': { type: 'string' },
    'head-coach-password': { type: 'string' },
  },
})

const nPlayers = Number(values.players ?? 10)
const nParents = Number(values.parents ?? 6)
const nStaff = Number(values['staff-count'] ?? 3)

const admin = serviceKey
  ? createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  : null

// ---------------------------------------------------------------- utils ----

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function emailFor(name: string): string {
  return `${name.toLowerCase().replace(/[^a-z]+/g, '.')}@${EMAIL_DOMAIN}`
}

function phoneFor(i: number): string {
  // 555-01xx is reserved for fiction, so these can never dial a real person
  return `256-555-${String(100 + i).padStart(4, '0')}`
}

/**
 * Retries on 429, which Supabase returns when auth calls come in too fast.
 *
 * The callback is typed loosely because supabase-js returns discriminated
 * unions (data non-null XOR error non-null) that will not unify with a single
 * `{ data: T; error: E | null }` shape.
 */
async function withBackoff<T = unknown>(
  label: string,
  fn: () => PromiseLike<{ data: unknown; error: unknown }>,
): Promise<T> {
  let delay = 1500
  for (let attempt = 0; attempt < 6; attempt++) {
    const { data, error } = await fn()
    if (!error) return data as T

    const err = error as { message?: string; status?: number }
    const message = err.message ?? String(error)
    const rateLimited = err.status === 429 || /rate limit|too many/i.test(message)
    if (!rateLimited) throw new Error(`${label}: ${message}`)

    console.log(`    rate limited, waiting ${delay / 1000}s...`)
    await sleep(delay)
    delay *= 2
  }
  throw new Error(`${label}: still rate limited after 6 attempts`)
}

async function resolveCodes(client: SupabaseClient): Promise<Record<string, string>> {
  if (values.family && values.player && values.staff) {
    return { family: values.family, player: values.player, staff: values.staff }
  }

  const programId = values['program-id']
  if (!programId) {
    console.error('Provide --family, --player and --staff, or --program-id <uuid>.')
    process.exit(1)
  }
  if (!admin) {
    console.error('--program-id needs SUPABASE_SERVICE_ROLE_KEY. Pass the codes instead.')
    process.exit(1)
  }

  const { data, error } = await client
    .from('program_codes')
    .select('code, code_type')
    .eq('program_id', programId)

  if (error) {
    console.error(`Could not read program_codes: ${error.message}`)
    process.exit(1)
  }
  if (!data?.length) {
    console.error(`No codes found for program ${programId}.`)
    process.exit(1)
  }
  return Object.fromEntries(data.map((r) => [r.code_type, r.code]))
}

/**
 * Returns a client already signed in as this person, creating the account if
 * needed. join_program() reads auth.uid(), so the call has to run on a session
 * belonging to the joiner -- a service-role client would have a null uid and be
 * rejected by the function's own guard.
 */
async function signedInClient(email: string): Promise<SupabaseClient> {
  const client = createClient(url!, anonKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  if (admin) {
    const { error } = await admin.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
    })
    const exists = error?.status === 422 || /already/i.test(error?.message ?? '')
    if (error && !exists) throw new Error(`createUser(${email}): ${error.message}`)

    await withBackoff(`signIn(${email})`, () =>
      client.auth.signInWithPassword({ email, password: PASSWORD }),
    )
    return client
  }

  // No service key: sign up directly. Requires email confirmation to be off.
  const { error: signUpError } = await client.auth.signUp({ email, password: PASSWORD })

  if (signUpError) {
    const exists = /already|registered/i.test(signUpError.message)
    if (!exists && signUpError.status !== 429) {
      throw new Error(`signUp(${email}): ${signUpError.message}`)
    }
    await withBackoff(`signIn(${email})`, () =>
      client.auth.signInWithPassword({ email, password: PASSWORD }),
    )
    return client
  }

  const { data } = await client.auth.getSession()
  if (!data.session) {
    throw new Error(
      `signUp(${email}) returned no session -- email confirmation is still on. ` +
        'Turn it off, or set SUPABASE_SERVICE_ROLE_KEY.',
    )
  }
  return client
}

// ------------------------------------------------------------------ main ----

type Seeded = { name: string; email: string; role: string; code: string }

async function main() {
  const lookupClient =
    admin ?? createClient(url!, anonKey!, { auth: { persistSession: false } })
  const codes = await resolveCodes(lookupClient)

  const cohorts = [
    { people: STAFF.slice(0, nStaff), codeType: 'staff', expect: 'assistant_coach' },
    { people: PLAYERS.slice(0, nPlayers), codeType: 'player', expect: 'player' },
    { people: PARENTS.slice(0, nParents), codeType: 'family', expect: 'parent' },
  ]

  console.log(`Seeding via ${admin ? 'admin API' : 'public signUp'}\n`)
  for (const [type, code] of Object.entries(codes)) {
    console.log(`  ${type.padEnd(7)} ${code}`)
  }
  console.log('')

  const seeded: Seeded[] = []
  let index = 0

  for (const cohort of cohorts) {
    const code = codes[cohort.codeType]
    if (!code) throw new Error(`No ${cohort.codeType} code available`)

    for (const name of cohort.people) {
      const email = emailFor(name)
      process.stdout.write(`  ${name.padEnd(18)} ${email.padEnd(28)} `)

      const client = await signedInClient(email)
      const member = await withBackoff(`join_program(${email})`, () =>
        client.rpc('join_program', {
          code,
          display_name: name,
          phone_number: phoneFor(index++),
        }),
      )

      const role = (member as { role?: string })?.role ?? '?'
      console.log(role)
      seeded.push({ name, email, role, code })

      await client.auth.signOut()
      await sleep(350) // stay under the auth rate limit
    }
  }

  // Optionally promote one assistant coach to team_manager. Codes only ever
  // produce assistant_coach for staff, so a manager has to be set by the head
  // coach afterwards -- which also exercises the head coach's UPDATE policy.
  const hcEmail = values['head-coach-email']
  const hcPassword = values['head-coach-password']
  let promoted: string | null = null

  if (hcEmail && hcPassword) {
    const target = seeded.find((s) => s.role === 'assistant_coach')
    if (target) {
      const hc = createClient(url!, anonKey!, { auth: { persistSession: false } })
      const { error: hcError } = await hc.auth.signInWithPassword({
        email: hcEmail,
        password: hcPassword,
      })
      if (hcError) {
        console.log(`\n  (skipped promotion: ${hcError.message})`)
      } else {
        const { data: rows, error: upError } = await hc
          .from('program_members')
          .update({ role: 'team_manager' })
          .eq('display_name', target.name)
          .select()
        if (upError) console.log(`\n  (promotion failed: ${upError.message})`)
        else if (rows?.length) {
          promoted = target.name
          target.role = 'team_manager'
        }
        await hc.auth.signOut()
      }
    }
  }

  // -------------------------------------------------------------- report ----

  const byRole = seeded.reduce<Record<string, number>>((acc, s) => {
    acc[s.role] = (acc[s.role] ?? 0) + 1
    return acc
  }, {})

  console.log('\n' + '='.repeat(72))
  console.log('ROSTER SEEDED\n')
  console.log('NAME'.padEnd(20) + 'EMAIL'.padEnd(30) + 'ROLE')
  console.log('-'.repeat(72))
  for (const s of seeded) {
    console.log(s.name.padEnd(20) + s.email.padEnd(30) + s.role)
  }
  console.log('-'.repeat(72))
  console.log(
    'Totals: ' +
      Object.entries(byRole)
        .map(([r, n]) => `${n} ${r}`)
        .join(', '),
  )
  if (promoted) console.log(`Promoted to team_manager: ${promoted}`)
  console.log(`\n${seeded.length} members. Password for all: ${PASSWORD}`)
}

main().catch((err) => {
  console.error(`\nFailed: ${err.message}`)
  process.exit(1)
})
