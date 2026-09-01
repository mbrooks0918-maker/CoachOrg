-- Claiming a child requires a code, not a pick from a list.
--
-- Carried forward from piece two as the one hole the audit found and could not
-- close inside that migration. guardians_insert admitted:
--
--     guardian_user_id = auth.uid() and person_in_my_program(person_id)
--
-- which is "anyone on the family code may attach themselves to any player on a
-- team they share". That is how the join screen worked: join, then tick your
-- children off the roster. Nothing verified the relationship. At a school with
-- six families it is a formality; at a recreation centre with four hundred it
-- means any parent can read any child's birthdate, emergency contact and
-- medical notes by ticking a box.
--
-- The fix follows the pattern already in this schema rather than inventing a
-- second one. program_codes are unreadable by rank-and-file, are redeemed
-- through a security definer function, and answer a bad code vaguely so the
-- endpoint cannot be used to discover which codes exist. A per-child code is
-- the same idea one level down: staff mint it for one person, hand it to the
-- adult they actually know, and redeeming it is the verification step.
--
-- The alternative considered was staff approval of self-claims. Rejected on
-- two counts: it leaves the browse-and-tick affordance on screen and merely
-- defers the grant, and it needs somebody to watch a queue -- a claim nobody
-- approves reads to the parent as a broken app.
--
-- One code does both jobs. Redeeming puts the adult on every team the child is
-- on AND records the guardianship, so "here is Jalen's family code" is the
-- whole of a parent's onboarding.

-- ============================================================================
-- 1. The codes
-- ============================================================================

create table if not exists public.person_claim_codes (
  id              uuid        primary key default gen_random_uuid(),
  organization_id uuid        not null references public.organizations (id) on delete cascade,
  person_id       uuid        not null references public.people (id)        on delete cascade,
  code            text        not null unique,
  created_by      uuid        not null references auth.users (id) on delete cascade,
  created_at      timestamptz not null default now(),
  -- A code left in an inbox forever is a standing invitation to a child's
  -- record, so it lapses on its own.
  expires_at      timestamptz not null default (now() + interval '30 days'),
  -- Two, because a child usually has two parents. Raise it deliberately.
  max_uses        integer     not null default 2 check (max_uses between 1 and 10),
  uses            integer     not null default 0 check (uses >= 0),
  revoked_at      timestamptz
);

comment on table public.person_claim_codes is
  'A one-child invitation. Minted by staff, handed to the adult they know, redeemed through claim_person(). Never readable by the person redeeming it.';

create index if not exists person_claim_codes_person_idx on public.person_claim_codes (person_id);
create index if not exists person_claim_codes_org_idx    on public.person_claim_codes (organization_id);

-- Keep the code pointing at the organization its person actually belongs to.
create or replace function public.person_claim_codes_validate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  select p.organization_id into v_org from public.people p where p.id = new.person_id;
  if v_org is null then
    raise exception 'person_claim_codes: no such person' using errcode = '23503';
  end if;
  if v_org <> new.organization_id then
    raise exception 'person_claim_codes: that person belongs to another organization'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists person_claim_codes_validate_trg on public.person_claim_codes;
create trigger person_claim_codes_validate_trg
  before insert or update on public.person_claim_codes
  for each row execute function public.person_claim_codes_validate();

-- ============================================================================
-- 2. Closing the self-claim branch
--
-- From here, the only way a guardian row appears is staff writing it directly
-- or claim_person() below. Nothing a family-role account can reach from the
-- interface creates one.
-- ============================================================================

drop policy if exists guardians_insert on public.guardians;
create policy guardians_insert
  on public.guardians
  for insert
  to authenticated
  with check (public.manages_person(person_id));

-- ============================================================================
-- 3. A coach may be a parent too
--
-- guardians_validate required the guardian to hold role 'parent' somewhere in
-- the organization, which was the rule that stopped a player claiming a
-- team-mate. With self-claiming gone that check is now belt to the RLS policy's
-- braces, and it was blocking a case that is extremely common in youth sport:
-- the assistant coach whose own child is on the team. Staff over a person can
-- already read everything about them, so admitting them as a guardian grants
-- no access they did not have -- it only records the relationship.
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

  -- The child side is unchanged: somebody who coaches or manages cannot be
  -- claimed as a child, which would hand the claimant their private details.
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

  -- The guardian side: family, or somebody already staff over this child.
  if not exists (
    select 1
      from public.program_members m
      join public.programs pr on pr.id = m.program_id
     where m.user_id = new.guardian_user_id
       and pr.organization_id = new.organization_id
       and m.role = 'parent'
  ) and not exists (
    select 1
      from public.program_members m
     where m.person_id = new.person_id
       and public.manages_program(m.program_id)
  ) then
    raise exception 'guardians: a guardian must be a family member of this organization'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

-- ============================================================================
-- 4. claim_person()
--
-- The verification step. Definer, because it must read a code table nobody
-- redeeming may read, and write a guardian row the caller's own policy now
-- forbids. It answers a bad code the same way join_program() does -- one vague
-- message for missing, revoked, expired and spent alike, so a caller cannot
-- learn which codes exist or whether one was ever real.
-- ============================================================================

create or replace function public.claim_person(
  code         text,
  display_name text default null,
  phone_number text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := (select auth.uid());
  v_code      public.person_claim_codes%rowtype;
  v_person    public.people%rowtype;
  v_self      uuid;
  v_program   uuid;
  v_landing   uuid;
  v_created   boolean := false;
begin
  if v_uid is null then
    raise exception 'claim_person: authentication required' using errcode = '28000';
  end if;

  select * into v_code
    from public.person_claim_codes c
   where c.code = claim_person.code
     and c.revoked_at is null
     and c.expires_at > now()
     and c.uses < c.max_uses;

  if not found then
    raise exception 'claim_person: invalid code' using errcode = '22023';
  end if;

  select * into v_person from public.people p where p.id = v_code.person_id;

  -- The adult's own record in this organization. Reused when they are already
  -- known here, so claiming a second child does not mint a second copy of them.
  select p.id into v_self
    from public.people p
   where p.organization_id = v_code.organization_id
     and p.user_id = v_uid;

  if v_self is null then
    if btrim(coalesce(claim_person.display_name, '')) = '' then
      raise exception 'claim_person: a name is required the first time you use a code'
        using errcode = '22023';
    end if;
    insert into public.people (organization_id, full_name, phone_number, user_id)
    values (v_code.organization_id, btrim(claim_person.display_name),
            claim_person.phone_number, v_uid)
    returning id into v_self;
  end if;

  if v_self = v_person.id then
    raise exception 'claim_person: that code is for your own record'
      using errcode = '23514';
  end if;

  -- A child with no team has nowhere to put the adult, and the guardian rule
  -- has no roster row to check them against. Say so plainly rather than
  -- failing on a constraint further down.
  if not exists (select 1 from public.program_members m where m.person_id = v_person.id) then
    raise exception 'claim_person: % is not on a team yet -- ask your coach to add them first',
      v_person.full_name using errcode = '23514';
  end if;

  -- On every team the child is on, so a parent of a two-sport child sees both.
  for v_program in
    select distinct m.program_id
      from public.program_members m
     where m.person_id = v_person.id
  loop
    if v_landing is null then v_landing := v_program; end if;

    if not exists (
      select 1 from public.program_members m
       where m.program_id = v_program and m.person_id = v_self
    ) then
      insert into public.program_members (program_id, person_id, role)
      values (v_program, v_self, 'parent');
    end if;
  end loop;

  insert into public.guardians (organization_id, person_id, guardian_user_id)
  values (v_code.organization_id, v_person.id, v_uid)
  on conflict on constraint guardians_pair_key do nothing;

  get diagnostics v_created = row_count;

  -- A parent re-entering their own code is not a second use.
  if v_created then
    update public.person_claim_codes
       set uses = uses + 1
     where id = v_code.id;
  end if;

  return jsonb_build_object(
    'kind',       'person',
    'person_id',  v_person.id,
    'child_name', v_person.full_name,
    'program_id', v_landing,
    'new_link',   v_created
  );
end;
$$;

revoke all on function public.claim_person(text, text, text) from public;
grant execute on function public.claim_person(text, text, text) to authenticated;

-- ============================================================================
-- 5. redeem_code()
--
-- One box on the join screen for both kinds of code. Team codes keep working
-- exactly as they did -- this delegates to join_program() untouched -- and a
-- child code takes the path above. Dispatching in the database rather than the
-- client means one vague answer for anything unrecognised, instead of the
-- client learning "not a child code" and then "not a team code" in turn.
-- ============================================================================

create or replace function public.redeem_code(
  code         text,
  display_name text default null,
  phone_number text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member public.program_members%rowtype;
begin
  if exists (select 1 from public.person_claim_codes c where c.code = redeem_code.code) then
    return public.claim_person(redeem_code.code, redeem_code.display_name, redeem_code.phone_number);
  end if;

  if btrim(coalesce(redeem_code.display_name, '')) = '' then
    raise exception 'redeem_code: a name is required' using errcode = '22023';
  end if;

  v_member := public.join_program(
    redeem_code.code, btrim(redeem_code.display_name), redeem_code.phone_number
  );

  return jsonb_build_object(
    'kind',       'program',
    'member_id',  v_member.id,
    'program_id', v_member.program_id,
    'role',       v_member.role
  );
end;
$$;

revoke all on function public.redeem_code(text, text, text) from public;
grant execute on function public.redeem_code(text, text, text) to authenticated;

-- ============================================================================
-- 6. Row Level Security
--
-- Readable and writable only by staff over the child in question. There is no
-- policy admitting the person who will redeem the code: they are handed it out
-- of band, which is the entire point of it being a verification step.
-- ============================================================================

alter table public.person_claim_codes enable row level security;

grant select, insert, update, delete on public.person_claim_codes to authenticated;

drop policy if exists person_claim_codes_select on public.person_claim_codes;
create policy person_claim_codes_select
  on public.person_claim_codes
  for select
  to authenticated
  using (public.manages_person(person_id));

drop policy if exists person_claim_codes_insert on public.person_claim_codes;
create policy person_claim_codes_insert
  on public.person_claim_codes
  for insert
  to authenticated
  with check (
    public.manages_person(person_id)
    and created_by = (select auth.uid())
  );

-- Revoking is an update; the same staff who could mint it may withdraw it.
drop policy if exists person_claim_codes_update on public.person_claim_codes;
create policy person_claim_codes_update
  on public.person_claim_codes
  for update
  to authenticated
  using (public.manages_person(person_id))
  with check (public.manages_person(person_id));

drop policy if exists person_claim_codes_delete on public.person_claim_codes;
create policy person_claim_codes_delete
  on public.person_claim_codes
  for delete
  to authenticated
  using (public.manages_person(person_id));
