-- Equipment inventory.
--
-- This is asset tracking: what the program owns, how many, and who currently
-- holds each one. It is deliberately unrelated to event_equipment_items, which
-- is a per-game packing list ("bring water coolers on Friday") and knows
-- nothing about assets. The two were kept apart on purpose when Game-Day Ops
-- landed, and nothing here links them.
--
-- A checkout row is never deleted on return. Returning stamps returned_at, so
-- the row becomes history: "who had the helmet in September" stays answerable.
-- Outstanding means returned_at is null, and that is the only definition of
-- "checked out" used anywhere.

create table if not exists public.equipment_items (
  id             uuid        primary key default gen_random_uuid(),
  program_id     uuid        not null references public.programs (id) on delete cascade,
  name           text        not null,
  category       text        not null,
  total_quantity integer     not null default 1 check (total_quantity > 0),
  condition      text,
  purchase_date  date,
  created_by     uuid        not null references auth.users (id) on delete cascade,
  created_at     timestamptz not null default now()
);

comment on table public.equipment_items is
  'Assets the program owns. Not to be confused with event_equipment_items, which is a per-game packing list.';

create index if not exists equipment_items_program_idx on public.equipment_items (program_id, category, name);

create table if not exists public.equipment_checkouts (
  id                uuid        primary key default gen_random_uuid(),
  program_id        uuid        not null references public.programs (id)        on delete cascade,
  equipment_item_id uuid        not null references public.equipment_items (id) on delete cascade,
  member_id         uuid        not null references public.program_members (id) on delete cascade,
  quantity          integer     not null default 1 check (quantity > 0),
  checked_out_at    timestamptz not null default now(),
  checked_out_by    uuid        not null references auth.users (id) on delete set null,
  returned_at       timestamptz,
  returned_by       uuid                 references auth.users (id) on delete set null,
  notes             text
);

-- The hot query is "what is still out", for one item or one person.
create index if not exists equipment_checkouts_open_item_idx
  on public.equipment_checkouts (equipment_item_id) where returned_at is null;
create index if not exists equipment_checkouts_open_member_idx
  on public.equipment_checkouts (member_id) where returned_at is null;
create index if not exists equipment_checkouts_program_idx
  on public.equipment_checkouts (program_id);

-- ============================================================================
-- Integrity
-- ============================================================================

-- Stops a program handing out more of something than it owns, and keeps an
-- item, a member and a checkout in the same program. None of this can be a
-- CHECK constraint: it all depends on other rows.
create or replace function public.equipment_checkout_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item        public.equipment_items%rowtype;
  v_member      public.program_members%rowtype;
  v_outstanding integer;
begin
  -- A return only stamps returned_at; it can never breach the supply.
  if new.returned_at is not null then
    return new;
  end if;

  select * into v_item   from public.equipment_items  where id = new.equipment_item_id;
  select * into v_member from public.program_members  where id = new.member_id;

  if v_item.id is null or v_member.id is null then
    raise exception 'equipment: item or member not found' using errcode = '23503';
  end if;

  if v_item.program_id <> new.program_id or v_member.program_id <> new.program_id then
    raise exception 'equipment: item and member must be in the same program'
      using errcode = '23514';
  end if;

  select coalesce(sum(quantity), 0) into v_outstanding
  from public.equipment_checkouts
  where equipment_item_id = new.equipment_item_id
    and returned_at is null
    and id <> new.id;

  if v_outstanding + new.quantity > v_item.total_quantity then
    raise exception 'only % of % left to check out',
      v_item.total_quantity - v_outstanding, v_item.name
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists equipment_checkout_guard_trg on public.equipment_checkouts;
create trigger equipment_checkout_guard_trg
  before insert or update on public.equipment_checkouts
  for each row execute function public.equipment_checkout_guard();

-- ============================================================================
-- Helper
-- ============================================================================

-- Lets a player see the name of a helmet they are holding without opening the
-- rest of the cupboard to them. Security definer so it is not itself filtered
-- by equipment_checkouts' own policy.
create or replace function public.has_equipment_claim(p_item_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.equipment_checkouts c
    join public.program_members m on m.id = c.member_id
    where c.equipment_item_id = p_item_id
      and m.user_id = (select auth.uid())
  );
$$;

revoke all     on function public.has_equipment_claim(uuid) from public;
revoke execute on function public.has_equipment_claim(uuid) from anon;
grant  execute on function public.has_equipment_claim(uuid) to authenticated;

-- ============================================================================
-- Row Level Security
-- ============================================================================

alter table public.equipment_items     enable row level security;
alter table public.equipment_checkouts enable row level security;

grant select, insert, update, delete on public.equipment_items     to authenticated;
grant select, insert, update, delete on public.equipment_checkouts to authenticated;

-- ---- items ----------------------------------------------------------------
-- Staff see the whole inventory. Everyone else sees only items they have
-- actually been handed, so the roster cannot browse what the program owns.
drop policy if exists equipment_items_select on public.equipment_items;
create policy equipment_items_select on public.equipment_items for select to authenticated
  using (
    public.manages_program(program_id)
    or public.is_program_org_admin(program_id)
    or public.has_equipment_claim(id)
  );

drop policy if exists equipment_items_insert on public.equipment_items;
create policy equipment_items_insert on public.equipment_items for insert to authenticated
  with check (created_by = (select auth.uid()) and public.manages_program(program_id));

drop policy if exists equipment_items_update on public.equipment_items;
create policy equipment_items_update on public.equipment_items for update to authenticated
  using (public.manages_program(program_id)) with check (public.manages_program(program_id));

drop policy if exists equipment_items_delete on public.equipment_items;
create policy equipment_items_delete on public.equipment_items for delete to authenticated
  using (public.manages_program(program_id));

-- ---- checkouts ------------------------------------------------------------
-- A member sees their own checkouts and nobody else's; staff see all of them.
drop policy if exists equipment_checkouts_select on public.equipment_checkouts;
create policy equipment_checkouts_select on public.equipment_checkouts for select to authenticated
  using (
    public.manages_program(program_id)
    or public.is_program_org_admin(program_id)
    or public.owns_member_row(member_id)
  );

-- Handing gear out and taking it back are both staff acts. A player cannot
-- check something out to themselves, and cannot mark it returned either --
-- otherwise "who still has a helmet" could be cleared by the person holding it.
drop policy if exists equipment_checkouts_insert on public.equipment_checkouts;
create policy equipment_checkouts_insert on public.equipment_checkouts for insert to authenticated
  with check (public.manages_program(program_id));

drop policy if exists equipment_checkouts_update on public.equipment_checkouts;
create policy equipment_checkouts_update on public.equipment_checkouts for update to authenticated
  using (public.manages_program(program_id)) with check (public.manages_program(program_id));

drop policy if exists equipment_checkouts_delete on public.equipment_checkouts;
create policy equipment_checkouts_delete on public.equipment_checkouts for delete to authenticated
  using (public.manages_program(program_id));
