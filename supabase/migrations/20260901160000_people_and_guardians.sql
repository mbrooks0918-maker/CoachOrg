-- People: identity that outlives a roster spot.
--
-- Until now a person existed only as a program_members row, so a child who
-- played soccer in the fall and baseball in the spring was two unrelated
-- children: birthday twice, emergency contact twice, no shared history, and a
-- parent retyping everything. This moves identity up to the organization and
-- leaves the roster row as what it should always have been -- a link saying
-- "this person, on this team, for this season".
--
-- Identity is deliberately split across two tables, because the two halves
-- have different audiences:
--
--   people          -- name and phone. Visible to the same people who can
--                      already read a roster today: anyone in the program.
--   person_details  -- birthdate, emergency contact, medical notes. Visible
--                      only to staff of a program the person is on, an org
--                      admin, the person themselves, and their guardians.
--
-- Keeping them in one table would have quietly handed every parent on the
-- team every other child's medical notes, because RLS grants rows, not
-- columns. The split is what makes "the roster is public to the team" and
-- "a child's paperwork is not" expressible at the same time.
--
-- program_members.user_id survives as a derived mirror of people.user_id. It
-- is what every existing policy in this schema compares against, and keeping
-- it means none of those policies had to be rewritten -- the riskiest possible
-- change in a migration whose whole job is not to leak one family's child to
-- another family. A trigger owns the column; nothing else may set it.

-- ============================================================================
-- 1. Tables
-- ============================================================================

create table if not exists public.people (
  id              uuid        primary key default gen_random_uuid(),
  organization_id uuid        not null references public.organizations (id) on delete cascade,
  full_name       text        not null,
  phone_number    text,
  -- The account this person signs in with, when they have one. Null is the
  -- normal state for a child registered by a parent.
  user_id         uuid        references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- Name reduced to something comparable, for the duplicate guard below.
  match_key       text generated always as
                    (lower(btrim(regexp_replace(full_name, '\s+', ' ', 'g')))) stored
);

comment on table public.people is
  'A person known to an organization, independent of any team or season. Name and phone only; private detail lives in person_details.';

-- One person per account per organization. Without this, joining a second
-- program in the same school would mint a second copy of the same human.
create unique index if not exists people_org_user_key
  on public.people (organization_id, user_id)
  where user_id is not null;

create index if not exists people_org_idx   on public.people (organization_id);
create index if not exists people_match_idx on public.people (organization_id, match_key);

-- ----------------------------------------------------------------------------

create table if not exists public.person_details (
  person_id               uuid        primary key references public.people (id) on delete cascade,
  birthdate               date,
  emergency_contact_name  text,
  emergency_contact_phone text,
  medical_notes           text,
  updated_at              timestamptz not null default now()
);

comment on table public.person_details is
  'The private half of a person. Never readable by a teammate -- only staff, org admins, the person, and their guardians.';

create index if not exists person_details_birthdate_idx on public.person_details (birthdate);

-- ----------------------------------------------------------------------------

create table if not exists public.guardians (
  id              uuid        primary key default gen_random_uuid(),
  organization_id uuid        not null references public.organizations (id) on delete cascade,
  person_id       uuid        not null references public.people (id)        on delete cascade,
  guardian_user_id uuid       not null references auth.users (id)           on delete cascade,
  created_at      timestamptz not null default now(),

  constraint guardians_pair_key unique (person_id, guardian_user_id)
);

comment on table public.guardians is
  'Who is responsible for a child, recorded once for the organization rather than per team. Replaces player_guardians as the source of truth.';

create index if not exists guardians_person_idx on public.guardians (person_id);
create index if not exists guardians_user_idx   on public.guardians (guardian_user_id);
create index if not exists guardians_org_idx    on public.guardians (organization_id);

-- ----------------------------------------------------------------------------

create table if not exists public.seasons (
  id         uuid        primary key default gen_random_uuid(),
  program_id uuid        not null references public.programs (id) on delete cascade,
  name       text        not null,
  starts_on  date,
  ends_on    date,
  created_at timestamptz not null default now(),

  constraint seasons_program_name_key unique (program_id, name)
);

comment on table public.seasons is
  'A run of a program, e.g. "Fall 2026". A roster spot may name one; existing rows predate seasons and name none.';

create index if not exists seasons_program_idx on public.seasons (program_id, starts_on);

-- ----------------------------------------------------------------------------

create table if not exists public.person_duplicate_reviews (
  id                 uuid        primary key default gen_random_uuid(),
  organization_id    uuid        not null references public.organizations (id) on delete cascade,
  new_person_id      uuid        not null references public.people (id) on delete cascade,
  existing_person_id uuid        not null references public.people (id) on delete cascade,
  status             text        not null default 'pending'
                       check (status in ('pending', 'same', 'different')),
  created_at         timestamptz not null default now(),
  reviewed_by        uuid        references auth.users (id) on delete set null,
  reviewed_at        timestamptz,

  constraint person_duplicate_reviews_pair_key unique (new_person_id, existing_person_id),
  constraint person_duplicate_reviews_distinct check (new_person_id <> existing_person_id)
);

comment on table public.person_duplicate_reviews is
  'A sign-up whose name and birthdate match somebody already on file. Held for a human to confirm -- never merged automatically.';

create index if not exists person_duplicate_reviews_pending_idx
  on public.person_duplicate_reviews (organization_id)
  where status = 'pending';

-- ============================================================================
-- 2. program_members grows a person, loses its copy of them
-- ============================================================================

alter table public.program_members
  add column if not exists person_id uuid references public.people (id) on delete cascade;

alter table public.program_members
  add column if not exists season_id uuid references public.seasons (id) on delete set null;

-- A roster spot for someone who has no account is the entire point.
alter table public.program_members
  alter column user_id drop not null;

-- ============================================================================
-- 3. Migrating what is already there
--
-- Every existing member has an account, so one person per (organization, user)
-- collapses a coach who runs two programs in the same school into one human
-- rather than two. Contact details come from the earliest membership, which is
-- the one the person filled in first.
-- ============================================================================

insert into public.people (organization_id, full_name, phone_number, user_id)
select distinct on (p.organization_id, m.user_id)
       p.organization_id,
       m.display_name,
       m.phone_number,
       m.user_id
from public.program_members m
join public.programs p on p.id = m.program_id
where m.user_id is not null
order by p.organization_id, m.user_id, m.joined_at
on conflict do nothing;

update public.program_members m
   set person_id = pe.id
  from public.programs p, public.people pe
 where p.id = m.program_id
   and pe.organization_id = p.organization_id
   and pe.user_id = m.user_id
   and m.person_id is null;

-- Guardianship moves from the team to the organization. distinct because the
-- same pair could be linked in two programs and is one fact at this level.
insert into public.guardians (organization_id, person_id, guardian_user_id)
select distinct
       pr.organization_id,
       player.person_id,
       guardian.user_id
from public.player_guardians g
join public.program_members player   on player.id   = g.player_member_id
join public.program_members guardian on guardian.id = g.guardian_member_id
join public.programs pr              on pr.id       = g.program_id
where player.person_id is not null
  and guardian.user_id is not null
on conflict do nothing;

-- --------------------------------------------------------------- assertions
--
-- The migration is worthless if it silently drops somebody. These run inside
-- the same transaction as everything above, so a mismatch rolls the whole
-- thing back rather than leaving a half-converted roster behind.

do $migrate$
declare
  v_orphans   bigint;
  v_expected  bigint;
  v_got       bigint;
begin
  select count(*) into v_orphans
    from public.program_members where person_id is null;
  if v_orphans > 0 then
    raise exception 'people migration: % roster rows found no person', v_orphans;
  end if;

  select count(distinct (pr.organization_id, player.person_id, guardian.user_id))
    into v_expected
    from public.player_guardians g
    join public.program_members player   on player.id   = g.player_member_id
    join public.program_members guardian on guardian.id = g.guardian_member_id
    join public.programs pr              on pr.id       = g.program_id;

  select count(*) into v_got from public.guardians;

  if v_got < v_expected then
    raise exception 'guardian migration: expected at least % links, got %', v_expected, v_got;
  end if;

  raise notice 'people migration: % people, % guardian links, 0 orphaned roster rows',
    (select count(*) from public.people), v_got;
end
$migrate$;

-- Every roster row now has a person, so require it from here on.
alter table public.program_members
  alter column person_id set not null;

-- The copy is gone: name and phone have exactly one home.
alter table public.program_members drop column if exists display_name;
alter table public.program_members drop column if exists phone_number;

-- The old key assumed one row per person per program forever, which stops
-- being true the moment the same child plays a second season of the same
-- sport. Replaced by a pair of partial indexes so a null season still counts
-- as a value rather than as "always unique".
alter table public.program_members
  drop constraint if exists program_members_program_id_user_id_key;

create unique index if not exists program_members_program_person_noseason_key
  on public.program_members (program_id, person_id)
  where season_id is null;

create unique index if not exists program_members_program_person_season_key
  on public.program_members (program_id, person_id, season_id)
  where season_id is not null;

create index if not exists program_members_person_idx on public.program_members (person_id);

-- ============================================================================
-- 4. Keeping the derived column honest
--
-- program_members.user_id is no longer something a caller sets. It is always
-- the account of the person the row points at, which also closes a small hole:
-- program_members_update previously let a head coach write an arbitrary
-- user_id and hand a stranger a seat on the roster.
-- ============================================================================

create or replace function public.program_members_sync()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_person_org  uuid;
  v_program_org uuid;
begin
  select p.organization_id into v_person_org
    from public.people p where p.id = new.person_id;
  if v_person_org is null then
    raise exception 'program_members: no such person' using errcode = '23503';
  end if;

  select pr.organization_id into v_program_org
    from public.programs pr where pr.id = new.program_id;

  if v_person_org <> v_program_org then
    raise exception 'program_members: person belongs to another organization'
      using errcode = '23514';
  end if;

  if new.season_id is not null
     and not exists (
       select 1 from public.seasons s
        where s.id = new.season_id and s.program_id = new.program_id
     ) then
    raise exception 'program_members: that season belongs to another program'
      using errcode = '23514';
  end if;

  -- Derived, never supplied.
  select p.user_id into new.user_id from public.people p where p.id = new.person_id;

  return new;
end;
$$;

drop trigger if exists program_members_sync_trg on public.program_members;
create trigger program_members_sync_trg
  before insert or update on public.program_members
  for each row execute function public.program_members_sync();

-- When a person finally claims an account, every roster row they hold picks it
-- up at once -- past seasons included.
create or replace function public.people_propagate_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.user_id is distinct from old.user_id then
    update public.program_members
       set user_id = new.user_id
     where person_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists people_propagate_user_trg on public.people;
create trigger people_propagate_user_trg
  after update on public.people
  for each row execute function public.people_propagate_user();

-- ============================================================================
-- 5. Guardianship rules
--
-- The escalation this guards against: a guardian link grants sight of
-- person_details and of that person's paperwork. Without a rule about who may
-- be claimed, a parent could name a coach -- or another parent -- as their
-- "child" and read their medical notes and phone. So a claimable person is one
-- who is a player and nothing else in that organization.
-- ============================================================================

create or replace function public.guardians_validate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_person public.people%rowtype;
begin
  select * into v_person from public.people p where p.id = new.person_id;

  if v_person.id is null then
    raise exception 'guardians: no such person' using errcode = '23503';
  end if;

  if v_person.organization_id <> new.organization_id then
    raise exception 'guardians: that person belongs to another organization'
      using errcode = '23514';
  end if;

  if v_person.user_id is not null and v_person.user_id = new.guardian_user_id then
    raise exception 'guardians: a person cannot be their own guardian'
      using errcode = '23514';
  end if;

  if exists (
    select 1
      from public.program_members m
      join public.programs pr on pr.id = m.program_id
     where m.person_id = new.person_id
       and pr.organization_id = new.organization_id
       and m.role <> 'player'
  ) then
    raise exception 'guardians: % holds a non-player role and cannot be claimed as a child',
      v_person.full_name using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists guardians_validate_trg on public.guardians;
create trigger guardians_validate_trg
  before insert or update on public.guardians
  for each row execute function public.guardians_validate();

-- ============================================================================
-- 6. Helpers
--
-- Every question the policies below ask is answered by one of these, so the
-- policies stay one-liners and the reasoning lives in one place. All are
-- security definer for the reason the rest of this schema is: a policy that
-- calls them must not itself be filtered by the tables they read.
-- ============================================================================

-- "Is this person me?"
create or replace function public.is_person_me(p_person_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.people p
     where p.id = p_person_id and p.user_id = (select auth.uid())
  );
$$;

-- "Am I responsible for this person?"
create or replace function public.is_guardian_of_person(p_person_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.guardians g
     where g.person_id = p_person_id
       and g.guardian_user_id = (select auth.uid())
  );
$$;

-- "Do I share a team with this person?" Deliberately the same reach as
-- program_members_select, so moving names into people neither widened nor
-- narrowed who can read a roster.
create or replace function public.person_in_my_program(p_person_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.program_members m
     where m.person_id = p_person_id
       and (
         public.is_program_member(m.program_id)
         or public.is_head_coach(m.program_id)
         or public.is_program_org_admin(m.program_id)
       )
  );
$$;

-- "Am I staff over this person?" Staff of a team they are on, or an AD or
-- owner of their organization.
create or replace function public.manages_person(p_person_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.people p
     where p.id = p_person_id
       and (public.is_org_owner(p.organization_id) or public.is_org_admin(p.organization_id))
  )
  or exists (
    select 1 from public.program_members m
     where m.person_id = p_person_id
       and public.manages_program(m.program_id)
  );
$$;

-- "Do I run anything in this organization?" Used where no person exists yet.
create or replace function public.staffs_org(p_organization_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.is_org_owner(p_organization_id)
      or public.is_org_admin(p_organization_id)
      or exists (
        select 1 from public.programs pr
         where pr.organization_id = p_organization_id
           and public.manages_program(pr.id)
      );
$$;

-- Same question, same answer, new source: guardianship is now an organization
-- fact rather than a per-team one. The signature is unchanged on purpose --
-- can_see_player_docs, can_manage_player_docs and both storage policies call
-- this and did not have to be touched.
create or replace function public.is_guardian_of(p_player_member_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
      from public.program_members m
      join public.guardians g on g.person_id = m.person_id
     where m.id = p_player_member_id
       and g.guardian_user_id = (select auth.uid())
  );
$$;

revoke all     on function public.is_person_me(uuid)           from public;
revoke execute on function public.is_person_me(uuid)           from anon;
grant  execute on function public.is_person_me(uuid)           to authenticated;
revoke all     on function public.is_guardian_of_person(uuid)  from public;
revoke execute on function public.is_guardian_of_person(uuid)  from anon;
grant  execute on function public.is_guardian_of_person(uuid)  to authenticated;
revoke all     on function public.person_in_my_program(uuid)   from public;
revoke execute on function public.person_in_my_program(uuid)   from anon;
grant  execute on function public.person_in_my_program(uuid)   to authenticated;
revoke all     on function public.manages_person(uuid)         from public;
revoke execute on function public.manages_person(uuid)         from anon;
grant  execute on function public.manages_person(uuid)         to authenticated;
revoke all     on function public.staffs_org(uuid)             from public;
revoke execute on function public.staffs_org(uuid)             from anon;
grant  execute on function public.staffs_org(uuid)             to authenticated;

-- ============================================================================
-- 7. The old per-team link is gone
--
-- Its rows were copied into guardians above and its one reader, is_guardian_of,
-- now consults guardians. Leaving the table behind would leave two answers to
-- "who is this child's parent", which is the exact bug this migration exists
-- to remove.
-- ============================================================================

drop table if exists public.player_guardians cascade;
drop function if exists public.player_guardians_validate() cascade;

-- ============================================================================
-- 8. join_program(), now person-aware
--
-- Same contract as before: a code in, a membership row out, contact details
-- refreshed on a replay, role never escalated. What changed underneath is that
-- the details land on the person rather than on the roster row, so a coach who
-- joins a second program in the same school updates one human.
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
  v_uid       uuid := (select auth.uid());
  v_code      public.program_codes%rowtype;
  v_role      text;
  v_org       uuid;
  v_person_id uuid;
  v_member    public.program_members%rowtype;
begin
  if v_uid is null then
    raise exception 'join_program: authentication required' using errcode = '28000';
  end if;

  select * into v_code
    from public.program_codes c
   where c.code = join_program.code;

  if not found then
    raise exception 'join_program: invalid code' using errcode = '22023';
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

  select pr.organization_id into v_org
    from public.programs pr where pr.id = v_code.program_id;

  select p.id into v_person_id
    from public.people p
   where p.organization_id = v_org and p.user_id = v_uid;

  if v_person_id is null then
    insert into public.people (organization_id, full_name, phone_number, user_id)
    values (v_org, join_program.display_name, join_program.phone_number, v_uid)
    returning id into v_person_id;
  else
    update public.people
       set full_name    = join_program.display_name,
           phone_number = join_program.phone_number,
           updated_at   = now()
     where id = v_person_id;
  end if;

  select * into v_member
    from public.program_members m
   where m.program_id = v_code.program_id
     and m.person_id  = v_person_id
     and m.season_id is null;

  if found then
    return v_member;
  end if;

  insert into public.program_members (program_id, person_id, role)
  values (v_code.program_id, v_person_id, v_role)
  returning * into v_member;

  return v_member;
end;
$$;

revoke all on function public.join_program(text, text, text) from public;
grant execute on function public.join_program(text, text, text) to authenticated;

-- ============================================================================
-- 9. program_roster
--
-- The roster as the interface wants it: a membership with the person's name
-- and phone alongside. security_invoker means both underlying tables' policies
-- still apply to the caller, so this view can only ever show what a direct
-- query would have shown -- it is a convenience, not a way around anything.
-- ============================================================================

drop view if exists public.program_roster;
create view public.program_roster
with (security_invoker = true) as
select m.id,
       m.program_id,
       m.person_id,
       m.season_id,
       m.user_id,
       m.role,
       m.joined_at,
       p.full_name    as display_name,
       p.phone_number as phone_number
  from public.program_members m
  join public.people p on p.id = m.person_id;

comment on view public.program_roster is
  'Roster rows joined to the person they point at. Read-only; writes go to program_members and people.';

grant select on public.program_roster to authenticated;

-- ============================================================================
-- 10. register_person() -- the duplicate guard
--
-- A rec center will see the same child arrive year after year, and a sign-up
-- form cannot tell "Jordan Reed, born 2018-04-02, registering again" from
-- "a different Jordan Reed". Both answers are common and only a human knows
-- which is which, so this does neither of the two tempting things: it does not
-- merge, and it does not silently create a second record and move on. It
-- creates the person -- registration must not be blocked by a maybe -- and
-- files a pending review naming both records.
-- ============================================================================

create or replace function public.register_person(
  p_organization_id         uuid,
  p_full_name               text,
  p_birthdate               date default null,
  p_phone_number            text default null,
  p_emergency_contact_name  text default null,
  p_emergency_contact_phone text default null,
  p_medical_notes           text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_person_id uuid;
  v_match_key text;
  v_match     uuid;
  v_flagged   integer := 0;
begin
  if not public.staffs_org(p_organization_id) then
    raise exception 'register_person: not permitted for this organization'
      using errcode = '42501';
  end if;

  if btrim(coalesce(p_full_name, '')) = '' then
    raise exception 'register_person: a name is required' using errcode = '22023';
  end if;

  insert into public.people (organization_id, full_name, phone_number)
  values (p_organization_id, btrim(p_full_name), p_phone_number)
  returning id, match_key into v_person_id, v_match_key;

  insert into public.person_details (
    person_id, birthdate, emergency_contact_name, emergency_contact_phone, medical_notes
  )
  values (
    v_person_id, p_birthdate, p_emergency_contact_name, p_emergency_contact_phone, p_medical_notes
  );

  -- Name alone is far too common to flag on; a shared birthdate is what makes
  -- it worth a person's attention. No birthdate means nothing to compare, and
  -- a silent pass is the honest outcome rather than a guess.
  if p_birthdate is not null then
    for v_match in
      select p.id
        from public.people p
        join public.person_details d on d.person_id = p.id
       where p.organization_id = p_organization_id
         and p.id <> v_person_id
         and p.match_key = v_match_key
         and d.birthdate = p_birthdate
    loop
      insert into public.person_duplicate_reviews (
        organization_id, new_person_id, existing_person_id
      )
      values (p_organization_id, v_person_id, v_match)
      on conflict do nothing;
      v_flagged := v_flagged + 1;
    end loop;
  end if;

  return v_person_id;
end;
$$;

revoke all on function public.register_person(uuid, text, date, text, text, text, text) from public;
grant execute on function public.register_person(uuid, text, date, text, text, text, text) to authenticated;

-- ============================================================================
-- 11. Guarding the two columns that grant access
--
-- organization_id decides which policies apply to a row, and user_id decides
-- whose account a person is. Neither should be reachable by an ordinary update
-- however broad that row's UPDATE policy is, so they are pinned here rather
-- than in a WITH CHECK -- a policy check evaluating a helper that re-reads the
-- same row mid-statement is exactly the kind of subtlety this schema should
-- not depend on.
-- ============================================================================

create or replace function public.people_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.organization_id <> old.organization_id then
    raise exception 'people: a person cannot be moved to another organization'
      using errcode = '23514';
  end if;

  if new.user_id is distinct from old.user_id then
    -- Claiming an unclaimed record for yourself is allowed. Assigning somebody
    -- else's account to a person is not: it would hand that account every
    -- roster row, document and detail the person has.
    if not (
      (old.user_id is null and new.user_id = (select auth.uid()))
      or (select auth.uid()) is null
    ) then
      raise exception 'people: an account can only be claimed by its own owner'
        using errcode = '42501';
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists people_guard_trg on public.people;
create trigger people_guard_trg
  before update on public.people
  for each row execute function public.people_guard();

-- ============================================================================
-- 12. Row Level Security
-- ============================================================================

alter table public.people                    enable row level security;
alter table public.person_details            enable row level security;
alter table public.guardians                 enable row level security;
alter table public.seasons                   enable row level security;
alter table public.person_duplicate_reviews  enable row level security;

grant select, insert, update, delete on public.people                   to authenticated;
grant select, insert, update, delete on public.person_details           to authenticated;
grant select, insert, delete         on public.guardians                to authenticated;
grant select, insert, update, delete on public.seasons                  to authenticated;
grant select, update                 on public.person_duplicate_reviews to authenticated;

-- ------------------------------------------------------------------ people --

-- The same reach a roster has today: teammates see each other's names, staff
-- and ADs see everyone on their teams, and you always see yourself and your
-- own children. Nobody sees a person from an organization they are not in.
drop policy if exists people_select on public.people;
create policy people_select
  on public.people
  for select
  to authenticated
  using (
    public.manages_person(id)
    or public.is_person_me(id)
    or public.is_guardian_of_person(id)
    or public.person_in_my_program(id)
  );

drop policy if exists people_insert on public.people;
create policy people_insert
  on public.people
  for insert
  to authenticated
  with check (public.staffs_org(organization_id));

-- Yourself, your children, or anyone you are staff over. The two columns that
-- would turn this into an escalation are pinned by people_guard above.
drop policy if exists people_update on public.people;
create policy people_update
  on public.people
  for update
  to authenticated
  using (
    public.manages_person(id)
    or public.is_person_me(id)
    or public.is_guardian_of_person(id)
  )
  with check (
    public.manages_person(id)
    or public.is_person_me(id)
    or public.is_guardian_of_person(id)
  );

-- Deleting a person erases their history across every season. Owner and AD
-- only -- a head coach removes somebody from a roster, not from the club.
drop policy if exists people_delete on public.people;
create policy people_delete
  on public.people
  for delete
  to authenticated
  using (
    public.is_org_owner(organization_id)
    or public.is_org_admin(organization_id)
  );

-- ---------------------------------------------------------- person_details --

-- Note what is absent: person_in_my_program. A teammate's parent can read a
-- name off the roster and always could; they have never been able to read a
-- birthdate, an emergency contact or a medical note, and this is the line that
-- keeps it that way.
drop policy if exists person_details_select on public.person_details;
create policy person_details_select
  on public.person_details
  for select
  to authenticated
  using (
    public.manages_person(person_id)
    or public.is_person_me(person_id)
    or public.is_guardian_of_person(person_id)
  );

drop policy if exists person_details_insert on public.person_details;
create policy person_details_insert
  on public.person_details
  for insert
  to authenticated
  with check (
    public.manages_person(person_id)
    or public.is_person_me(person_id)
    or public.is_guardian_of_person(person_id)
  );

drop policy if exists person_details_update on public.person_details;
create policy person_details_update
  on public.person_details
  for update
  to authenticated
  using (
    public.manages_person(person_id)
    or public.is_person_me(person_id)
    or public.is_guardian_of_person(person_id)
  )
  with check (
    public.manages_person(person_id)
    or public.is_person_me(person_id)
    or public.is_guardian_of_person(person_id)
  );

drop policy if exists person_details_delete on public.person_details;
create policy person_details_delete
  on public.person_details
  for delete
  to authenticated
  using (
    public.manages_person(person_id)
    or public.is_guardian_of_person(person_id)
  );

-- --------------------------------------------------------------- guardians --

-- Staff over the child see every link. Everyone else sees only links they are
-- part of: a parent sees their own children, a player sees their own
-- guardians, and neither can enumerate another family. This is the same
-- contract player_guardians had, asked at the organization instead of the team.
drop policy if exists guardians_select on public.guardians;
create policy guardians_select
  on public.guardians
  for select
  to authenticated
  using (
    public.manages_person(person_id)
    or guardian_user_id = (select auth.uid())
    or public.is_person_me(person_id)
  );

-- Staff link anyone they are staff over. Anyone else may only claim a child on
-- a team they are themselves in, and only ever as the guardian side of the
-- pair -- which is what the family-code join flow does. Without the second
-- half of that condition, any signed-in account could claim any child whose id
-- it could guess.
drop policy if exists guardians_insert on public.guardians;
create policy guardians_insert
  on public.guardians
  for insert
  to authenticated
  with check (
    public.manages_person(person_id)
    or (
      guardian_user_id = (select auth.uid())
      and public.person_in_my_program(person_id)
    )
  );

-- Staff unlink anything; a guardian may withdraw their own claim. A child
-- cannot remove their guardian.
drop policy if exists guardians_delete on public.guardians;
create policy guardians_delete
  on public.guardians
  for delete
  to authenticated
  using (
    public.manages_person(person_id)
    or guardian_user_id = (select auth.uid())
  );

-- ----------------------------------------------------------------- seasons --

drop policy if exists seasons_select on public.seasons;
create policy seasons_select
  on public.seasons
  for select
  to authenticated
  using (
    public.is_program_member(program_id)
    or public.is_program_org_admin(program_id)
    or public.is_head_coach(program_id)
  );

drop policy if exists seasons_insert on public.seasons;
create policy seasons_insert
  on public.seasons
  for insert
  to authenticated
  with check (public.manages_program(program_id));

drop policy if exists seasons_update on public.seasons;
create policy seasons_update
  on public.seasons
  for update
  to authenticated
  using (public.manages_program(program_id))
  with check (public.manages_program(program_id));

drop policy if exists seasons_delete on public.seasons;
create policy seasons_delete
  on public.seasons
  for delete
  to authenticated
  using (public.manages_program(program_id));

-- ------------------------------------------------ person_duplicate_reviews --

-- Only the people who could resolve one can see one. No insert policy: rows
-- are filed by register_person(), which runs as definer.
drop policy if exists person_duplicate_reviews_select on public.person_duplicate_reviews;
create policy person_duplicate_reviews_select
  on public.person_duplicate_reviews
  for select
  to authenticated
  using (
    public.manages_person(new_person_id)
    or public.is_org_owner(organization_id)
    or public.is_org_admin(organization_id)
  );

drop policy if exists person_duplicate_reviews_update on public.person_duplicate_reviews;
create policy person_duplicate_reviews_update
  on public.person_duplicate_reviews
  for update
  to authenticated
  using (
    public.manages_person(new_person_id)
    or public.is_org_owner(organization_id)
    or public.is_org_admin(organization_id)
  )
  with check (
    public.manages_person(new_person_id)
    or public.is_org_owner(organization_id)
    or public.is_org_admin(organization_id)
  );
