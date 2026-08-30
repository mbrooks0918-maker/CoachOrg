-- Parent/guardian to player associations.
--
-- Joining with the family code makes someone a 'parent' of a *program*, which
-- is not specific enough: a parent belongs to particular players, a player can
-- have several guardians, and a guardian can have several children on the same
-- team. That is a many-to-many relationship, so it gets its own table rather
-- than a column on program_members.
--
-- program_id is stored on the row even though it is derivable from either
-- member. It is what every RLS policy keys off, and carrying it here keeps the
-- policies from having to join back to program_members to find out which
-- program a row belongs to.

create table if not exists public.player_guardians (
  id                 uuid        primary key default gen_random_uuid(),
  program_id         uuid        not null references public.programs (id)        on delete cascade,
  player_member_id   uuid        not null references public.program_members (id) on delete cascade,
  guardian_member_id uuid        not null references public.program_members (id) on delete cascade,
  created_at         timestamptz not null default now(),

  -- One link per pair. Re-linking is a no-op rather than a duplicate row.
  constraint player_guardians_pair_key unique (player_member_id, guardian_member_id),
  -- A member cannot be their own guardian.
  constraint player_guardians_distinct check (player_member_id <> guardian_member_id)
);

comment on table public.player_guardians is
  'Links a family-code member to the specific player(s) they are responsible for.';

create index if not exists player_guardians_program_idx  on public.player_guardians (program_id);
create index if not exists player_guardians_player_idx   on public.player_guardians (player_member_id);
create index if not exists player_guardians_guardian_idx on public.player_guardians (guardian_member_id);

-- ============================================================================
-- Integrity
-- ============================================================================

-- A CHECK constraint cannot look at other rows, so the parts of the contract
-- that span tables -- both members are in this program, and each one holds the
-- role its column implies -- are enforced by a trigger instead.
create or replace function public.player_guardians_validate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player   public.program_members%rowtype;
  v_guardian public.program_members%rowtype;
begin
  select * into v_player   from public.program_members where id = new.player_member_id;
  select * into v_guardian from public.program_members where id = new.guardian_member_id;

  if v_player.id is null or v_guardian.id is null then
    raise exception 'player_guardians: member not found' using errcode = '23503';
  end if;

  if v_player.program_id <> new.program_id or v_guardian.program_id <> new.program_id then
    raise exception 'player_guardians: both members must belong to the same program'
      using errcode = '23514';
  end if;

  if v_player.role <> 'player' then
    raise exception 'player_guardians: % is not a player', v_player.display_name
      using errcode = '23514';
  end if;

  if v_guardian.role <> 'parent' then
    raise exception 'player_guardians: % is not a family member', v_guardian.display_name
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists player_guardians_validate_trg on public.player_guardians;
create trigger player_guardians_validate_trg
  before insert or update on public.player_guardians
  for each row execute function public.player_guardians_validate();

-- ============================================================================
-- Helper
-- ============================================================================

-- "Is this program_members row mine?" Security definer so the policies below
-- are not themselves filtered by program_members' RLS, which is the same
-- reason every other helper in this schema is defined this way.
create or replace function public.owns_member_row(p_member_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.program_members m
    where m.id = p_member_id
      and m.user_id = (select auth.uid())
  );
$$;

revoke all    on function public.owns_member_row(uuid) from public;
revoke execute on function public.owns_member_row(uuid) from anon;
grant  execute on function public.owns_member_row(uuid) to authenticated;

-- ============================================================================
-- Row Level Security
-- ============================================================================

alter table public.player_guardians enable row level security;
grant select, insert, delete on public.player_guardians to authenticated;
-- No UPDATE: a link is created or removed, never edited into a different pair.

-- Staff and org admins see every link in their program. Everyone else sees
-- only links they are personally part of -- a parent sees their own children,
-- a player sees their own guardians, and neither can enumerate anyone else's
-- family.
drop policy if exists player_guardians_select on public.player_guardians;
create policy player_guardians_select
  on public.player_guardians
  for select
  to authenticated
  using (
    public.is_head_coach(program_id)
    or public.is_program_staff(program_id)
    or public.is_program_org_admin(program_id)
    or public.owns_member_row(player_member_id)
    or public.owns_member_row(guardian_member_id)
  );

-- Staff link anyone. A guardian may also link themselves, which is what the
-- join flow does when someone arrives on the family code and picks their
-- children -- but only ever as the guardian side of the pair.
drop policy if exists player_guardians_insert on public.player_guardians;
create policy player_guardians_insert
  on public.player_guardians
  for insert
  to authenticated
  with check (
    public.is_head_coach(program_id)
    or public.is_program_staff(program_id)
    or public.owns_member_row(guardian_member_id)
  );

-- Same shape for removal: staff can unlink anything, a guardian can withdraw
-- their own claim. A player cannot delete a link, so a guardian's connection
-- cannot be quietly severed by the child.
drop policy if exists player_guardians_delete on public.player_guardians;
create policy player_guardians_delete
  on public.player_guardians
  for delete
  to authenticated
  using (
    public.is_head_coach(program_id)
    or public.is_program_staff(program_id)
    or public.owns_member_row(guardian_member_id)
  );
