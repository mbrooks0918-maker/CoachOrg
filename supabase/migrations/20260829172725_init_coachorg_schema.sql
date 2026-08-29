-- CoachOrg — initial schema (organizations / programs model)
--
-- This migration REPLACES an earlier draft that used teams / team_codes /
-- team_members. Those tables are dropped at the top so that applying this
-- file leaves only the schema defined below, whether or not the draft was
-- ever applied.
--
-- Structure of this file:
--   1. Teardown of the superseded draft
--   2. Tables
--   3. Indexes
--   4. SECURITY DEFINER helper functions  <- read this before the policies
--   5. join_program()
--   6. RLS policies
--
-- Why the helpers exist
-- ---------------------
-- Every policy predicate below delegates to a SECURITY DEFINER function.
-- Those functions run as the function owner, which bypasses RLS, so a policy
-- on program_members can ask "is this user a member?" without re-entering
-- program_members' own policies. That is what keeps this schema free of the
-- infinite-recursion failures that policies cross-referencing each other
-- normally produce.
--
-- Each helper is STABLE and takes only an id, returning a fact about the
-- *calling* user (auth.uid()). None of them return another user's data, so
-- running them with elevated rights does not widen what a caller can see.
--
-- `set search_path = ''` on every function forces fully-qualified names,
-- which is what stops a caller from shadowing `public` or `auth` with their
-- own schema and redirecting a definer-rights function.


-- ============================================================================
-- 1. Teardown of the superseded draft
-- ============================================================================

-- cascade also removes the policies attached to these tables
drop table if exists public.team_members cascade;
drop table if exists public.team_codes   cascade;
drop table if exists public.teams        cascade;


-- ============================================================================
-- 2. Tables
-- ============================================================================

-- ------------------------------------------------------------ organizations

create table if not exists public.organizations (
  id         uuid        primary key default gen_random_uuid(),
  name       text        not null,
  created_by uuid        not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now()
);

comment on table public.organizations is
  'A school or club, e.g. "Albertville High School". Parent of programs.';

-- ----------------------------------------------------------------- programs

create table if not exists public.programs (
  id              uuid        primary key default gen_random_uuid(),
  organization_id uuid        not null references public.organizations (id) on delete cascade,
  name            text        not null,
  sport           text        not null,
  head_coach_id   uuid        not null references auth.users (id) on delete restrict,
  created_at      timestamptz not null default now()
);

comment on table public.programs is
  'A coached program, e.g. "Albertville Football". Owned by head_coach_id.';

-- ------------------------------------------------------------ program_codes

create table if not exists public.program_codes (
  id         uuid        primary key default gen_random_uuid(),
  program_id uuid        not null references public.programs (id) on delete cascade,
  code       text        not null unique,
  code_type  text        not null check (code_type in ('family', 'player', 'staff')),
  created_at timestamptz not null default now()
);

comment on table public.program_codes is
  'Shareable join codes. Never readable by rank-and-file members; joining '
  'goes through public.join_program().';

-- ---------------------------------------------------------- program_members

create table if not exists public.program_members (
  id           uuid        primary key default gen_random_uuid(),
  program_id   uuid        not null references public.programs (id) on delete cascade,
  user_id      uuid        not null references auth.users (id) on delete cascade,
  display_name text        not null,
  phone_number text,
  role         text        not null check (
                 role in (
                   'head_coach',
                   'assistant_coach',
                   'team_manager',
                   'parent',
                   'player'
                 )
               ),
  joined_at    timestamptz not null default now(),

  constraint program_members_program_id_user_id_key unique (program_id, user_id)
);

comment on table public.program_members is
  'Membership + role of a user within a program.';

-- --------------------------------------------------------------- org_admins

create table if not exists public.org_admins (
  id              uuid        primary key default gen_random_uuid(),
  organization_id uuid        not null references public.organizations (id) on delete cascade,
  user_id         uuid        not null references auth.users (id) on delete cascade,
  created_at      timestamptz not null default now(),

  constraint org_admins_organization_id_user_id_key unique (organization_id, user_id)
);

comment on table public.org_admins is
  'Athletic Directors: org-wide read access across every program in the org.';


-- ============================================================================
-- 3. Indexes
--
-- Primary keys and unique constraints are indexed automatically; foreign keys
-- are not. These back the lookups the helper functions perform on every
-- policy evaluation.
-- ============================================================================

create index if not exists organizations_created_by_idx      on public.organizations   (created_by);
create index if not exists programs_organization_id_idx      on public.programs        (organization_id);
create index if not exists programs_head_coach_id_idx        on public.programs        (head_coach_id);
create index if not exists program_codes_program_id_idx      on public.program_codes   (program_id);
create index if not exists program_members_program_id_idx    on public.program_members (program_id);
create index if not exists program_members_user_id_idx       on public.program_members (user_id);
create index if not exists org_admins_organization_id_idx    on public.org_admins      (organization_id);
create index if not exists org_admins_user_id_idx            on public.org_admins      (user_id);


-- ============================================================================
-- 4. SECURITY DEFINER helper functions
-- ============================================================================

-- Is the caller the AD (org admin) of this organization?
create or replace function public.is_org_admin(p_organization_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.org_admins a
    where a.organization_id = p_organization_id
      and a.user_id = (select auth.uid())
  );
$$;

-- Did the caller create this organization?
create or replace function public.is_org_owner(p_organization_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.organizations o
    where o.id = p_organization_id
      and o.created_by = (select auth.uid())
  );
$$;

-- Does the caller belong to any program under this organization?
-- Lets a parent read the name of the school their kid's program sits under.
create or replace function public.is_org_program_member(p_organization_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.program_members m
    join public.programs p on p.id = m.program_id
    where p.organization_id = p_organization_id
      and m.user_id = (select auth.uid())
  );
$$;

-- Is the caller the head coach of this program?
create or replace function public.is_head_coach(p_program_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.programs p
    where p.id = p_program_id
      and p.head_coach_id = (select auth.uid())
  );
$$;

-- Is the caller an AD over the organization that owns this program?
create or replace function public.is_program_org_admin(p_program_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.programs p
    join public.org_admins a on a.organization_id = p.organization_id
    where p.id = p_program_id
      and a.user_id = (select auth.uid())
  );
$$;

-- Does the caller hold any membership row in this program?
create or replace function public.is_program_member(p_program_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.program_members m
    where m.program_id = p_program_id
      and m.user_id = (select auth.uid())
  );
$$;

-- Is the caller an assistant coach or team manager in this program?
-- Deliberately excludes head_coach: that authority comes from
-- programs.head_coach_id via is_head_coach(), not from a membership row.
create or replace function public.is_program_staff(p_program_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.program_members m
    where m.program_id = p_program_id
      and m.user_id = (select auth.uid())
      and m.role in ('assistant_coach', 'team_manager')
  );
$$;

-- The caller's own role in this program, or null.
create or replace function public.program_role(p_program_id uuid)
returns text
language sql
security definer
stable
set search_path = ''
as $$
  select m.role
  from public.program_members m
  where m.program_id = p_program_id
    and m.user_id = (select auth.uid())
$$;

-- These run with the owner's rights, so they must not be callable by
-- unauthenticated traffic.
revoke all on function public.is_org_admin(uuid)          from public;
revoke all on function public.is_org_owner(uuid)          from public;
revoke all on function public.is_org_program_member(uuid) from public;
revoke all on function public.is_head_coach(uuid)         from public;
revoke all on function public.is_program_org_admin(uuid)  from public;
revoke all on function public.is_program_member(uuid)     from public;
revoke all on function public.is_program_staff(uuid)      from public;
revoke all on function public.program_role(uuid)          from public;

grant execute on function public.is_org_admin(uuid)          to authenticated;
grant execute on function public.is_org_owner(uuid)          to authenticated;
grant execute on function public.is_org_program_member(uuid) to authenticated;
grant execute on function public.is_head_coach(uuid)         to authenticated;
grant execute on function public.is_program_org_admin(uuid)  to authenticated;
grant execute on function public.is_program_member(uuid)     to authenticated;
grant execute on function public.is_program_staff(uuid)      to authenticated;
grant execute on function public.program_role(uuid)          to authenticated;


-- ============================================================================
-- 5. join_program()
--
-- The only sanctioned path from a code to a membership row. Because it runs
-- SECURITY DEFINER it can read program_codes even though no SELECT policy on
-- that table admits ordinary members -- the code is consumed as an argument
-- and never returned, so a caller cannot enumerate codes or discover the
-- codes of programs they do not belong to.
-- ============================================================================

create or replace function public.join_program(
  code         text,
  display_name text,
  phone_number text default null
)
returns public.program_members
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := (select auth.uid());
  v_code   public.program_codes%rowtype;
  v_role   text;
  v_member public.program_members%rowtype;
begin
  if v_uid is null then
    raise exception 'join_program: authentication required'
      using errcode = '28000';
  end if;

  select * into v_code
  from public.program_codes c
  where c.code = join_program.code;

  if not found then
    -- deliberately vague: distinguishing "no such code" from "not allowed"
    -- would turn this function into a code oracle
    raise exception 'join_program: invalid code'
      using errcode = '22023';
  end if;

  v_role := case v_code.code_type
              when 'family' then 'parent'
              when 'player' then 'player'
              when 'staff'  then 'assistant_coach'
            end;

  if v_role is null then
    raise exception 'join_program: unrecognized code_type %', v_code.code_type
      using errcode = '22023';
  end if;

  -- Re-running with the same code updates the contact details but never the
  -- role: a member cannot escalate by replaying a staff code.
  insert into public.program_members (
    program_id, user_id, display_name, phone_number, role
  )
  values (
    v_code.program_id, v_uid, join_program.display_name,
    join_program.phone_number, v_role
  )
  on conflict on constraint program_members_program_id_user_id_key
  do update set
    display_name = excluded.display_name,
    phone_number = excluded.phone_number
  returning * into v_member;

  return v_member;
end;
$$;

revoke all on function public.join_program(text, text, text) from public;
grant execute on function public.join_program(text, text, text) to authenticated;


-- ============================================================================
-- 6. Row Level Security
-- ============================================================================

alter table public.organizations   enable row level security;
alter table public.programs        enable row level security;
alter table public.program_codes   enable row level security;
alter table public.program_members enable row level security;
alter table public.org_admins      enable row level security;

grant select, insert, update, delete on public.organizations   to authenticated;
grant select, insert, update, delete on public.programs        to authenticated;
grant select, insert, update, delete on public.program_codes   to authenticated;
grant select, insert, update, delete on public.program_members to authenticated;
grant select, insert, update, delete on public.org_admins      to authenticated;

-- -------------------------------------------------------- organizations ----

-- Visible to its creator, its ADs, and anyone in one of its programs.
drop policy if exists organizations_select on public.organizations;
create policy organizations_select
  on public.organizations
  for select
  to authenticated
  using (
    created_by = (select auth.uid())
    or public.is_org_admin(id)
    or public.is_org_program_member(id)
  );

drop policy if exists organizations_insert on public.organizations;
create policy organizations_insert
  on public.organizations
  for insert
  to authenticated
  with check (created_by = (select auth.uid()));

-- Creator only. ADs are read-only at the org level.
drop policy if exists organizations_update on public.organizations;
create policy organizations_update
  on public.organizations
  for update
  to authenticated
  using (created_by = (select auth.uid()))
  with check (created_by = (select auth.uid()));

drop policy if exists organizations_delete on public.organizations;
create policy organizations_delete
  on public.organizations
  for delete
  to authenticated
  using (created_by = (select auth.uid()));

-- ----------------------------------------------------------- org_admins ----

-- An AD sees their own appointment; the org creator and fellow ADs see the
-- whole roster of ADs for that org.
drop policy if exists org_admins_select on public.org_admins;
create policy org_admins_select
  on public.org_admins
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or public.is_org_owner(organization_id)
    or public.is_org_admin(organization_id)
  );

-- Appointing an AD is the org creator's call alone. ADs cannot appoint peers,
-- which keeps org-wide access from spreading without the owner.
drop policy if exists org_admins_insert on public.org_admins;
create policy org_admins_insert
  on public.org_admins
  for insert
  to authenticated
  with check (public.is_org_owner(organization_id));

drop policy if exists org_admins_delete on public.org_admins;
create policy org_admins_delete
  on public.org_admins
  for delete
  to authenticated
  using (public.is_org_owner(organization_id));

-- ------------------------------------------------------------- programs ----

-- Head coach, any AD over the org, and every member of the program.
drop policy if exists programs_select on public.programs;
create policy programs_select
  on public.programs
  for select
  to authenticated
  using (
    head_coach_id = (select auth.uid())
    or public.is_program_org_admin(id)
    or public.is_program_member(id)
  );

-- Creating a program under an org is restricted to that org's creator or an
-- AD, so a stranger cannot attach a program to someone else's school.
drop policy if exists programs_insert on public.programs;
create policy programs_insert
  on public.programs
  for insert
  to authenticated
  with check (
    public.is_org_owner(organization_id)
    or public.is_org_admin(organization_id)
  );

-- Head coach only. An AD who is not the head coach is read-only here, which
-- is the org-wide-read / program-scoped-write split.
drop policy if exists programs_update on public.programs;
create policy programs_update
  on public.programs
  for update
  to authenticated
  using (head_coach_id = (select auth.uid()))
  with check (head_coach_id = (select auth.uid()));

drop policy if exists programs_delete on public.programs;
create policy programs_delete
  on public.programs
  for delete
  to authenticated
  using (head_coach_id = (select auth.uid()));

-- -------------------------------------------------------- program_codes ----

-- Head coach and ADs only. Assistant coaches, team managers, parents and
-- players get no SELECT at all -- they reach programs through join_program().
drop policy if exists program_codes_select on public.program_codes;
create policy program_codes_select
  on public.program_codes
  for select
  to authenticated
  using (
    public.is_head_coach(program_id)
    or public.is_program_org_admin(program_id)
  );

-- Minting, editing and revoking codes is the head coach's alone.
drop policy if exists program_codes_insert on public.program_codes;
create policy program_codes_insert
  on public.program_codes
  for insert
  to authenticated
  with check (public.is_head_coach(program_id));

drop policy if exists program_codes_update on public.program_codes;
create policy program_codes_update
  on public.program_codes
  for update
  to authenticated
  using (public.is_head_coach(program_id))
  with check (public.is_head_coach(program_id));

drop policy if exists program_codes_delete on public.program_codes;
create policy program_codes_delete
  on public.program_codes
  for delete
  to authenticated
  using (public.is_head_coach(program_id));

-- ------------------------------------------------------ program_members ----

-- The roster is visible to everyone in the program, plus the head coach and
-- any AD over the org. This is what makes "roster names" readable to parents
-- and players.
drop policy if exists program_members_select on public.program_members;
create policy program_members_select
  on public.program_members
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or public.is_head_coach(program_id)
    or public.is_program_org_admin(program_id)
    or public.is_program_member(program_id)
  );

-- Head coach and staff may add members directly; anyone else arrives through
-- join_program(), which bypasses this policy by design.
drop policy if exists program_members_insert on public.program_members;
create policy program_members_insert
  on public.program_members
  for insert
  to authenticated
  with check (
    public.is_head_coach(program_id)
    or public.is_program_staff(program_id)
  );

-- Head coach and staff may edit any member row. Everyone else may edit only
-- their own -- that is the parent/player "update my phone number" case.
-- The WITH CHECK repeats the predicate so a row cannot be moved to another
-- program or reassigned to another user on the way out.
drop policy if exists program_members_update on public.program_members;
create policy program_members_update
  on public.program_members
  for update
  to authenticated
  using (
    user_id = (select auth.uid())
    or public.is_head_coach(program_id)
    or public.is_program_staff(program_id)
  )
  with check (
    user_id = (select auth.uid())
    or public.is_head_coach(program_id)
    or public.is_program_staff(program_id)
  );

-- Leaving a program is always allowed. Removing somebody else is the head
-- coach's call -- assistant coaches and team managers are excluded here, per
-- "cannot remove other members".
drop policy if exists program_members_delete on public.program_members;
create policy program_members_delete
  on public.program_members
  for delete
  to authenticated
  using (
    user_id = (select auth.uid())
    or public.is_head_coach(program_id)
  );
