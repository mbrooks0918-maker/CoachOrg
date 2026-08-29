/**
 * One-off seeding script -- NOT part of the app bundle.
 *
 * Creates three confirmed test users and joins each to a program using its
 * join codes, so there is a realistic roster to develop against.
 *
 * !! This file reads SUPABASE_SERVICE_ROLE_KEY. That key bypasses RLS
 * !! entirely. It must never be imported from anything under src/. It is safe
 * !! here for two reasons: nothing in src/ imports this file, so Vite never
 * !! reaches it; and the variable has no VITE_ prefix, so Vite would refuse to
 * !! inline it into client code even if something did.
 *
 * Usage:
 *   node --env-file=.env.local scripts/seedTestData.ts \
 *     --family ALB-FAM-XXXX --player ALB-PLYR-XXXX --staff ALB-STAFF-XXXX
 *
 * Or let it look the codes up itself:
 *   node --env-file=.env.local scripts/seedTestData.ts --program-id <uuid>
 */

import { parseArgs } from 'node:util'
import { createClient } from '@supabase/supabase-js'

const PASSWORD = 'TestPass123!'

const TEST_USERS = [
  { email: 'coach1@test.coachorg.dev', displayName: 'Coach One', codeType: 'staff' },
  { email: 'parent1@test.coachorg.dev', displayName: 'Parent One', codeType: 'family' },
  { email: 'player1@test.coachorg.dev', displayName: 'Player One', codeType: 'player' },
] as const

// ---------------------------------------------------------------- env ----

const url = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL
const anonKey = process.env.VITE_SUPABASE_ANON_KEY
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !anonKey) {
  console.error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY.')
  console.error('Run with: node --env-file=.env.local scripts/seedTestData.ts ...')
  process.exit(1)
}

if (!serviceKey) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY.')
  console.error('Add it to .env.local (Dashboard -> Project Settings -> API).')
  process.exit(1)
}

// --------------------------------------------------------------- args ----

const { values } = parseArgs({
  options: {
    family: { type: 'string' },
    player: { type: 'string' },
    staff: { type: 'string' },
    'program-id': { type: 'string' },
  },
})

// service-role client: bypasses RLS, used only for admin work
const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function resolveCodes(): Promise<Record<string, string>> {
  if (values.family && values.player && values.staff) {
    return { family: values.family, player: values.player, staff: values.staff }
  }

  const programId = values['program-id']
  if (!programId) {
    console.error('Provide --family, --player and --staff, or --program-id <uuid>.')
    process.exit(1)
  }

  const { data, error } = await admin
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

/** Create the user, or reuse the existing one if the email is already taken. */
async function ensureUser(email: string): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true, // skip the confirmation mail for test accounts
  })

  if (!error && data.user) return data.user.id

  const alreadyExists =
    error?.status === 422 || /already/i.test(error?.message ?? '')
  if (!alreadyExists) throw new Error(`createUser(${email}): ${error?.message}`)

  const { data: list, error: listError } =
    await admin.auth.admin.listUsers({ perPage: 1000 })
  if (listError) throw new Error(`listUsers: ${listError.message}`)

  const found = list.users.find((u) => u.email === email)
  if (!found) throw new Error(`${email} reported as existing but was not found`)
  return found.id
}

async function main() {
  const codes = await resolveCodes()
  console.log('Using codes:')
  for (const [type, code] of Object.entries(codes)) {
    console.log(`  ${type.padEnd(7)} ${code}`)
  }
  console.log('')

  const summary: Array<Record<string, string>> = []

  for (const user of TEST_USERS) {
    const code = codes[user.codeType]
    if (!code) throw new Error(`No ${user.codeType} code available`)

    const userId = await ensureUser(user.email)

    // join_program() reads auth.uid(), so it has to run on a client that is
    // actually signed in as this user -- the service-role client would have a
    // null uid and be rejected by the function's own auth guard.
    const asUser = createClient(url!, anonKey!, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const { error: signInError } = await asUser.auth.signInWithPassword({
      email: user.email,
      password: PASSWORD,
    })
    if (signInError) throw new Error(`signIn(${user.email}): ${signInError.message}`)

    const { data: member, error: joinError } = await asUser.rpc('join_program', {
      code,
      display_name: user.displayName,
      phone_number: null,
    })
    if (joinError) throw new Error(`join_program(${user.email}): ${joinError.message}`)

    await asUser.auth.signOut()

    summary.push({
      email: user.email,
      userId,
      code,
      role: (member as { role?: string })?.role ?? '?',
      displayName: user.displayName,
    })
  }

  console.log('Created / joined:\n')
  console.log(
    ['EMAIL', 'DISPLAY NAME', 'ROLE', 'CODE USED'].map((h, i) =>
      h.padEnd([30, 14, 17, 18][i]),
    ).join(''),
  )
  console.log('-'.repeat(78))
  for (const r of summary) {
    console.log(
      r.email.padEnd(30) +
        r.displayName.padEnd(14) +
        r.role.padEnd(17) +
        r.code.padEnd(18),
    )
  }
  console.log(`\n${summary.length} test members seeded. Password for all: ${PASSWORD}`)
}

main().catch((err) => {
  console.error(`\nFailed: ${err.message}`)
  process.exit(1)
})
