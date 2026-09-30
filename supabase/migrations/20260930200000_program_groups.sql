-- ============================================================================
-- Program groups, and the Program Admin who runs one.
--
-- Until now a division was the largest unit the app knew about: "Fall Soccer
-- 8U" and "Fall Soccer 10U" were two unrelated rows, and nobody could hold
-- soccer as a whole. This adds the missing level between a team and an
-- organization.
--
-- Built as the organization pattern one level down rather than as a new idea:
--   org_admins            -> program_group_admins
--   is_org_admin()        -> is_group_admin()
--   is_program_org_admin()-> is_program_group_admin()
--   org_overview()        -> group_overview()
-- A Program Admin is structurally "the overview, scoped to one group", and
-- nothing here invents a second way of asking who may do what.
--
-- Grouping is optional and nothing is grouped by this migration except the
-- one demo group at the bottom. A program with a null program_group_id
-- behaves exactly as it did.
-- ============================================================================

create table if not exists public.program_groups (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name            text not null,
  created_at      timestamptz not null default now(),
  created_by      uuid references auth.users(id) on delete set null,

  constraint program_groups_name_not_blank check (btrim(name) <> ''),
  constraint program_groups_name_length    check (char_length(name) <= 60)
);

create unique index if not exists program_groups_one_name_per_org
  on public.program_groups (organization_id, lower(btrim(name)));

-- Nullable on purpose: ungrouped is the default and stays valid forever. A
-- one-team high school never needs a group, and set null on delete means
-- removing a group releases its divisions rather than destroying them.
alter table public.programs
  add column if not exists program_group_id uuid
  references public.program_groups(id) on delete set null;

create index if not exists programs_by_group on public.programs (program_group_id);

-- Same shape as org_admins, one level down.
create table if not exists public.program_group_admins (
  id               uuid primary key default gen_random_uuid(),
  program_group_id uuid not null references public.program_groups(id) on delete cascade,
  user_id          uuid not null references auth.users(id) on delete cascade,
  created_at       timestamptz not null default now(),

  constraint program_group_admins_group_user_key unique (program_group_id, user_id)
);

comment on table public.program_group_admins is
  'Program Admins: manage every division inside one program group.';

-- A group and the programs in it must belong to the same organization, or a
-- group admin in one park would reach a division in another.
create or replace function public.programs_group_same_org()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.program_group_id is not null and not exists (
    select 1 from public.program_groups g
     where g.id = new.program_group_id
       and g.organization_id = new.organization_id
  ) then
    raise exception 'That program group belongs to a different organization.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists programs_group_same_org on public.programs;
create trigger programs_group_same_org
  before insert or update of program_group_id, organization_id on public.programs
  for each row execute function public.programs_group_same_org();

-- ---------------------------------------------------------------- helpers

-- Mirrors is_org_admin().
create or replace function public.is_group_admin(p_program_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.program_group_admins a
     where a.program_group_id = p_program_group_id
       and a.user_id = (select auth.uid())
  );
$$;

revoke all     on function public.is_group_admin(uuid) from public;
revoke execute on function public.is_group_admin(uuid) from anon;
grant  execute on function public.is_group_admin(uuid) to authenticated;

-- Mirrors is_program_org_admin(). Returns false for an ungrouped program,
-- which is what keeps every existing program behaving exactly as before.
create or replace function public.is_program_group_admin(p_program_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.programs p
      join public.program_group_admins a on a.program_group_id = p.program_group_id
     where p.id = p_program_id
       and p.program_group_id is not null
       and a.user_id = (select auth.uid())
  );
$$;

revoke all     on function public.is_program_group_admin(uuid) from public;
revoke execute on function public.is_program_group_admin(uuid) from anon;
grant  execute on function public.is_program_group_admin(uuid) to authenticated;

-- ------------------------------------------------------- the single hook
--
-- manages_program() is what every program-scoped policy in the app already
-- asks before letting somebody change a roster, a fixture, a kit list or a
-- document. Adding the group admin here is what gives them a coach's reach
-- over every division in their group, in one place, rather than editing
-- thirty policies and hoping none was missed.
--
-- This deliberately does NOT widen anything organization-wide. staffs_org()
-- is already true for any coach of any one team, so a group admin gains
-- nothing there that a single-team assistant coach did not already have, and
-- is_org_leader() -- the gate on Organization Overview -- is owner or AD
-- only and is untouched.
create or replace function public.manages_program(p_program_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_head_coach(p_program_id)
      or public.is_program_staff(p_program_id)
      or public.is_program_group_admin(p_program_id);
$$;

-- --------------------------------------------------------------- policies

alter table public.program_groups       enable row level security;
alter table public.program_group_admins enable row level security;

grant select, insert, update, delete on public.program_groups       to authenticated;
grant select, insert, update, delete on public.program_group_admins to authenticated;

-- Anyone in the organization may read the group names -- they are labels on
-- programs people can already see.
drop policy if exists program_groups_select on public.program_groups;
create policy program_groups_select on public.program_groups
  for select to authenticated
  using (
    public.is_org_program_member(organization_id)
    or public.staffs_org(organization_id)
  );

-- Creating a group and deciding what belongs in it is a director's act, the
-- same as appointing an athletic director.
drop policy if exists program_groups_write on public.program_groups;
create policy program_groups_write on public.program_groups
  for all to authenticated
  using (public.is_org_leader(organization_id))
  with check (public.is_org_leader(organization_id));

-- You can see that you are a group admin; a director can see everyone.
drop policy if exists program_group_admins_select on public.program_group_admins;
create policy program_group_admins_select on public.program_group_admins
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1 from public.program_groups g
       where g.id = program_group_id
         and public.is_org_leader(g.organization_id)
    )
  );

drop policy if exists program_group_admins_write on public.program_group_admins;
create policy program_group_admins_write on public.program_group_admins
  for all to authenticated
  using (
    exists (
      select 1 from public.program_groups g
       where g.id = program_group_id
         and public.is_org_leader(g.organization_id)
    )
  )
  with check (
    exists (
      select 1 from public.program_groups g
       where g.id = program_group_id
         and public.is_org_leader(g.organization_id)
    )
  );

-- ------------------------------------------------------- group_overview()
--
-- org_overview() with the organization swapped for the group. Definer for the
-- same reason: it reads across divisions without the caller needing a
-- membership in each, which is the whole point of the tier.

create or replace function public.group_overview(p_program_group_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_group public.program_groups%rowtype;
begin
  if not public.is_group_admin(p_program_group_id) then
    raise exception 'group_overview: not permitted for this program group'
      using errcode = '42501';
  end if;

  select * into v_group from public.program_groups g where g.id = p_program_group_id;
  if not found then
    raise exception 'group_overview: no such program group' using errcode = '22023';
  end if;

  return jsonb_build_object(
    'group', jsonb_build_object(
      'id', v_group.id, 'name', v_group.name, 'organization_id', v_group.organization_id
    ),

    'totals', jsonb_build_object(
      'programs',   (select count(*) from public.programs pr
                      where pr.program_group_id = p_program_group_id),
      'children',   (select count(distinct r.person_id) from public.registrations r
                      join public.programs pr on pr.id = r.program_id
                     where pr.program_group_id = p_program_group_id and r.status <> 'withdrawn'),
      'signups',    (select count(*) from public.registrations r
                      join public.programs pr on pr.id = r.program_id
                     where pr.program_group_id = p_program_group_id and r.status <> 'withdrawn'),
      'confirmed',  (select count(*) from public.registrations r
                      join public.programs pr on pr.id = r.program_id
                     where pr.program_group_id = p_program_group_id and r.status = 'confirmed'),
      'waitlisted', (select count(*) from public.registrations r
                      join public.programs pr on pr.id = r.program_id
                     where pr.program_group_id = p_program_group_id and r.status = 'waitlisted'),
      'players',    (select count(*) from public.program_members m
                      join public.programs pr on pr.id = m.program_id
                     where pr.program_group_id = p_program_group_id and m.role = 'player')
    ),

    'programs', coalesce((
      select jsonb_agg(q.row order by q.nm)
        from (
          select pr.name as nm,
                 jsonb_build_object(
                   'id',    pr.id,
                   'name',  pr.name,
                   'sport', pr.sport,
                   'players', (select count(*) from public.program_members m
                                where m.program_id = pr.id and m.role = 'player'),
                   'confirmed', (select count(*) from public.registrations r
                                  where r.program_id = pr.id and r.status = 'confirmed'),
                   'waitlisted', (select count(*) from public.registrations r
                                   where r.program_id = pr.id and r.status = 'waitlisted'),
                   'season', (
                     select jsonb_build_object(
                              'name', s.name,
                              'capacity', s.capacity,
                              'spots_remaining',
                                case when s.capacity is null then null
                                     else greatest(s.capacity - (
                                       select count(*) from public.registrations r2
                                        where r2.season_id = s.id and r2.status = 'confirmed'), 0)
                                end,
                              'closes_at', s.registration_closes_at,
                              'open_now', s.registration_opens_at is not null
                                          and s.registration_closes_at is not null
                                          and now() between s.registration_opens_at
                                                        and s.registration_closes_at,
                              'public_token', s.public_token
                            )
                       from public.seasons s
                      where s.program_id = pr.id
                      order by s.starts_on desc nulls last, s.created_at desc
                      limit 1
                   )
                 ) as row
            from public.programs pr
           where pr.program_group_id = p_program_group_id
        ) q
    ), '[]'::jsonb),

    'upcoming_events', coalesce((
      select jsonb_agg(q.row order by q.ord)
        from (
          select e.starts_at as ord,
                 jsonb_build_object(
                   'id', e.id, 'program_id', e.program_id, 'program_name', pr.name,
                   'name', e.name, 'starts_at', e.starts_at,
                   'location', e.location, 'opponent', e.opponent
                 ) as row
            from public.events e
            join public.programs pr on pr.id = e.program_id
           where pr.program_group_id = p_program_group_id
             and e.starts_at >= now()
           order by e.starts_at
           limit 20
        ) q
    ), '[]'::jsonb),

    'equipment', jsonb_build_object(
      'items', (select count(*) from public.equipment_items i
                 join public.programs pr on pr.id = i.program_id
                where pr.program_group_id = p_program_group_id),
      'total_quantity', (select coalesce(sum(i.total_quantity), 0) from public.equipment_items i
                          join public.programs pr on pr.id = i.program_id
                         where pr.program_group_id = p_program_group_id),
      'checked_out', (select coalesce(sum(co.quantity), 0)
                        from public.equipment_checkouts co
                        join public.equipment_items i on i.id = co.equipment_item_id
                        join public.programs pr on pr.id = i.program_id
                       where pr.program_group_id = p_program_group_id
                         and co.returned_at is null)
    )
  );
end;
$$;

revoke all     on function public.group_overview(uuid) from public;
revoke execute on function public.group_overview(uuid) from anon;
grant  execute on function public.group_overview(uuid) to authenticated;

-- ------------------------------------------------------------- demo group
--
-- Sand Mountain Park only, and only the two soccer divisions. Flag Football
-- and Youth Basketball stay ungrouped deliberately, so the same organization
-- demonstrates both halves: a sport that has been gathered under an admin,
-- and sports that have not.
do $$
declare
  v_org   uuid;
  v_group uuid;
begin
  select id into v_org from public.organizations where name = 'Sand Mountain Park';
  if v_org is null then
    return;
  end if;

  select id into v_group
    from public.program_groups
   where organization_id = v_org and lower(btrim(name)) = 'soccer';

  if v_group is null then
    insert into public.program_groups (organization_id, name)
    values (v_org, 'Soccer')
    returning id into v_group;
  end if;

  update public.programs
     set program_group_id = v_group
   where organization_id = v_org
     and name in ('Fall Soccer 8U', 'Fall Soccer 10U');
end;
$$;
