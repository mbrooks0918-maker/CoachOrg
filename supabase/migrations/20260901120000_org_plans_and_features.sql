-- Organization plans and unlockable features.
--
-- CoachOrg is growing past school teams: a recreation center wants online
-- registration and card payments, a high school does not. Rather than shipping
-- every organization every screen, capability is granted per organization.
--
-- The switch deliberately does NOT live on public.organizations. That table is
-- writable by whoever created the row (organizations_update), so a customer
-- could put themselves on the paid plan. Everything here is readable by the
-- people it affects and writable by nobody holding the 'authenticated' role --
-- only the service role, i.e. the SQL editor, can change a plan.
--
-- Two ways to grant, because they answer different questions:
--   org_plans          -- "what are they paying for"   (the billable tier)
--   org_feature_grants -- "what is switched on for them" (comps, pilots, beta)
-- A feature counts as available if EITHER says so. An organization with no
-- row anywhere has no features, which is what every existing organization is.

-- ============================================================================
-- Tables
-- ============================================================================

-- What each tier includes. A price list, not a permission -- readable by all.
create table if not exists public.plan_features (
  plan    text not null,
  feature text not null,

  constraint plan_features_pkey primary key (plan, feature)
);

comment on table public.plan_features is
  'Which features each plan includes. Seeded below; add a row to extend a plan.';

-- Which tier an organization is on. Absent means basic.
create table if not exists public.org_plans (
  organization_id uuid        primary key references public.organizations (id) on delete cascade,
  plan            text        not null default 'basic',
  note            text,
  updated_at      timestamptz not null default now()
);

comment on table public.org_plans is
  'The plan an organization is on. No row means basic. Service role writes only.';

-- One-off unlocks that ignore the plan: pilots, comps, a beta tester.
create table if not exists public.org_feature_grants (
  organization_id uuid        not null references public.organizations (id) on delete cascade,
  feature         text        not null,
  note            text,
  granted_at      timestamptz not null default now(),

  constraint org_feature_grants_pkey primary key (organization_id, feature)
);

comment on table public.org_feature_grants is
  'Feature switched on for one organization regardless of plan. Service role writes only.';

-- ============================================================================
-- Seed
--
-- 'basic' is every organization today and is listed with no features rather
-- than left out, so that selecting the tiers is a query and not a hard-coded
-- list in the app.
-- ============================================================================

insert into public.plan_features (plan, feature) values
  ('registration', 'registration'),
  ('registration', 'payments')
on conflict do nothing;

-- ============================================================================
-- Helpers
--
-- security definer for the same reason every other helper in this schema is:
-- a policy that calls them must not be filtered by these tables' own policies.
-- ============================================================================

-- "Does this organization have this feature?"
create or replace function public.org_has_feature(
  p_organization_id uuid,
  p_feature         text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.org_plans p
    join public.plan_features f on f.plan = p.plan
    where p.organization_id = p_organization_id
      and f.feature = p_feature
  )
  or exists (
    select 1
    from public.org_feature_grants g
    where g.organization_id = p_organization_id
      and g.feature = p_feature
  );
$$;

-- Same question asked of a program, which is how the app will usually ask it.
create or replace function public.program_has_feature(
  p_program_id uuid,
  p_feature    text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.org_has_feature(p.organization_id, p_feature)
  from public.programs p
  where p.id = p_program_id;
$$;

-- Every feature a program's organization has, for the shell to load once and
-- hand to the whole interface. Guarded: someone with no connection to the
-- program learns nothing, not even the tier its organization is on.
create or replace function public.program_features(p_program_id uuid)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(distinct feature), '{}')
  from (
    select f.feature
      from public.org_plans p
      join public.plan_features f on f.plan = p.plan
      join public.programs prog on prog.id = p_program_id
     where p.organization_id = prog.organization_id

    union

    select g.feature
      from public.org_feature_grants g
      join public.programs prog on prog.id = p_program_id
     where g.organization_id = prog.organization_id
  ) available
  where public.is_program_member(p_program_id)
     or public.is_program_org_admin(p_program_id)
     or public.is_head_coach(p_program_id);
$$;

revoke all     on function public.org_has_feature(uuid, text)     from public;
revoke execute on function public.org_has_feature(uuid, text)     from anon;
grant  execute on function public.org_has_feature(uuid, text)     to authenticated;

revoke all     on function public.program_has_feature(uuid, text) from public;
revoke execute on function public.program_has_feature(uuid, text) from anon;
grant  execute on function public.program_has_feature(uuid, text) to authenticated;

revoke all     on function public.program_features(uuid)          from public;
revoke execute on function public.program_features(uuid)          from anon;
grant  execute on function public.program_features(uuid)          to authenticated;

-- ============================================================================
-- Row Level Security
--
-- Note what is missing: there is no insert, update or delete policy on any of
-- these tables, and no write grant. With RLS on and no permissive policy, a
-- signed-in user cannot change a plan even if the interface asked them to.
-- Changing a tier is a service-role operation, done in the SQL editor.
-- ============================================================================

alter table public.plan_features      enable row level security;
alter table public.org_plans          enable row level security;
alter table public.org_feature_grants enable row level security;

grant select on public.plan_features      to authenticated;
grant select on public.org_plans          to authenticated;
grant select on public.org_feature_grants to authenticated;

-- The tier list is not secret; knowing 'registration' exists sells it.
drop policy if exists plan_features_select on public.plan_features;
create policy plan_features_select
  on public.plan_features
  for select
  to authenticated
  using (true);

-- An organization's own plan is visible to the people inside it.
drop policy if exists org_plans_select on public.org_plans;
create policy org_plans_select
  on public.org_plans
  for select
  to authenticated
  using (
    public.is_org_owner(organization_id)
    or public.is_org_admin(organization_id)
    or public.is_org_program_member(organization_id)
  );

drop policy if exists org_feature_grants_select on public.org_feature_grants;
create policy org_feature_grants_select
  on public.org_feature_grants
  for select
  to authenticated
  using (
    public.is_org_owner(organization_id)
    or public.is_org_admin(organization_id)
    or public.is_org_program_member(organization_id)
  );
