# TeamOps

Operations software for the people who run youth sport — a park, a club, a
school athletics department. Registration, rosters, family contacts, paperwork,
equipment and game day, in one place.

Formerly CoachOrg. The rename is display-layer only: database tables,
functions, columns and the Supabase project keep their original names, because
renaming them buys nothing and risks a lot.

## What it does

- **Registration** — a public sign-up link per season, with capacity, age
  brackets and custom questions. Parents sign up with no account and make one
  at the end. Full seasons waitlist rather than turn people away.
- **People, not roster rows** — a child is a record held by the organization,
  so the same kid playing two sports is one person with one birthday and one
  set of paperwork.
- **Roster and family links** — guardianship is recorded once for the
  organization and survives into next season. Becoming a child's guardian
  requires a code issued by staff, never a pick from a list.
- **Scheduled reminders** — web push, sent by a cron-driven edge function.
- **Equipment** — what the program owns, who is holding it.
- **Game day** — events with per-event to-do lists, packing lists and
  volunteer assignments.
- **Organization overview** — one view above the programs, for owners and
  athletic directors only.

Paid features are unlocked per organization through `org_plans`, which only the
service role may write.

## Running it

```bash
npm install
npm run dev
```

Environment (`.env.local`):

| Variable | What it is |
| --- | --- |
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase publishable key |
| `VITE_VAPID_PUBLIC_KEY` | Web push application server key (public half) |

`npm run build` type-checks and bundles. `npm run lint` runs oxlint.

## Database

Migrations live in `supabase/migrations` and are applied with the linked CLI:

```bash
./node_modules/.bin/supabase db push --linked
```

Migrations are append-only. Never edit one that has been applied; add another.

## Build identity

Every deploy stamps its own commit into the bundle at build time
(`vite.config.ts` reads Vercel's git environment variables, falling back to
local git). The badge in the corner of every screen shows the short SHA, and
tapping it shows the full commit, branch, subject and build time. Nothing here
is hand-maintained, so it cannot go stale.

## Icons

`python3 scripts/generate-icons.py` regenerates the PWA icon set from code. The
mark is drawn from the same geometry as the `Logo` component in
`src/components/brand.tsx`, so the two cannot drift.
