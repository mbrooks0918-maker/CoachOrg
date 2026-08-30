-- Game-Day Ops.
--
-- Everything here hangs off an event: a game or scrimmage has its own to-do
-- list, its own "what do we need to bring" list, and its own volunteer slots.
--
-- The equipment list here is deliberately NOT asset tracking. It records what
-- is needed at one event, not what the program owns or who currently holds it.
-- The inventory module planned separately will have its own tables; keeping
-- them apart means neither has to compromise for the other.
--
-- Every table carries program_id even where it is reachable through event_id.
-- It is what every policy keys off, and it keeps the policies from joining
-- back through events to discover which program a row belongs to.

-- ============================================================================
-- Helper
-- ============================================================================

-- "May this user run the program?" Head coach or staff, which is the pairing
-- every write policy in this file needs and which the existing tables spell
-- out longhand.
create or replace function public.manages_program(p_program_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_head_coach(p_program_id) or public.is_program_staff(p_program_id);
$$;

revoke all     on function public.manages_program(uuid) from public;
revoke execute on function public.manages_program(uuid) from anon;
grant  execute on function public.manages_program(uuid) to authenticated;

-- ============================================================================
-- Tables
-- ============================================================================

create table if not exists public.events (
  id         uuid        primary key default gen_random_uuid(),
  program_id uuid        not null references public.programs (id) on delete cascade,
  name       text        not null,
  starts_at  timestamptz not null,
  location   text,
  opponent   text,
  notes      text,
  created_by uuid        not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

comment on table public.events is
  'A game, scrimmage or other dated occasion that Game-Day Ops is organised around.';

create index if not exists events_program_starts_idx on public.events (program_id, starts_at);

-- The to-do list and the equipment list are the same shape but stay separate
-- tables: they are different lists to a coach, they are templated separately,
-- and folding them into one table with a discriminator would put a filter on
-- every single query for no gain.
create table if not exists public.event_checklist_items (
  id                 uuid        primary key default gen_random_uuid(),
  event_id           uuid        not null references public.events (id)          on delete cascade,
  program_id         uuid        not null references public.programs (id)        on delete cascade,
  label              text        not null,
  assigned_member_id uuid                 references public.program_members (id) on delete set null,
  position           integer     not null default 0,
  done_at            timestamptz,
  done_by            uuid                 references auth.users (id)             on delete set null,
  created_at         timestamptz not null default now()
);

create table if not exists public.event_equipment_items (
  id                 uuid        primary key default gen_random_uuid(),
  event_id           uuid        not null references public.events (id)          on delete cascade,
  program_id         uuid        not null references public.programs (id)        on delete cascade,
  label              text        not null,
  assigned_member_id uuid                 references public.program_members (id) on delete set null,
  position           integer     not null default 0,
  done_at            timestamptz,
  done_by            uuid                 references auth.users (id)             on delete set null,
  created_at         timestamptz not null default now()
);

comment on table public.event_equipment_items is
  'What to bring to one event. Not inventory: this tracks a game, not an asset.';

create index if not exists event_checklist_event_idx on public.event_checklist_items (event_id, position);
create index if not exists event_equipment_event_idx on public.event_equipment_items (event_id, position);

create table if not exists public.event_volunteer_assignments (
  id         uuid        primary key default gen_random_uuid(),
  event_id   uuid        not null references public.events (id)          on delete cascade,
  program_id uuid        not null references public.programs (id)        on delete cascade,
  member_id  uuid        not null references public.program_members (id) on delete cascade,
  role_label text        not null,
  created_at timestamptz not null default now(),
  constraint event_volunteer_unique unique (event_id, member_id, role_label)
);

create index if not exists event_volunteer_event_idx  on public.event_volunteer_assignments (event_id);
create index if not exists event_volunteer_member_idx on public.event_volunteer_assignments (member_id);

-- Templates so a coach does not retype the same list every Friday. One table
-- serves both lists because a template item is only ever a label; `kind` says
-- which list it may be applied to.
create table if not exists public.event_list_templates (
  id         uuid        primary key default gen_random_uuid(),
  program_id uuid        not null references public.programs (id) on delete cascade,
  name       text        not null,
  kind       text        not null check (kind in ('todo', 'equipment')),
  created_by uuid        not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint event_list_templates_name_key unique (program_id, kind, name)
);

create table if not exists public.event_list_template_items (
  id          uuid    primary key default gen_random_uuid(),
  template_id uuid    not null references public.event_list_templates (id) on delete cascade,
  program_id  uuid    not null references public.programs (id)             on delete cascade,
  label       text    not null,
  position    integer not null default 0
);

create index if not exists event_list_template_items_idx
  on public.event_list_template_items (template_id, position);

-- ============================================================================
-- Item guard
-- ============================================================================

-- RLS decides whether a row may be updated at all; it cannot say "only these
-- columns". Staff may change anything. Anyone else has exactly one power --
-- ticking an item they were assigned -- so every other column is frozen for
-- them here.
create or replace function public.event_item_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.manages_program(new.program_id) then
    return new;
  end if;

  if old.assigned_member_id is null
     or not public.owns_member_row(old.assigned_member_id) then
    raise exception 'only the person assigned this item can change it'
      using errcode = '42501';
  end if;

  if new.label              is distinct from old.label
     or new.assigned_member_id is distinct from old.assigned_member_id
     or new.event_id           is distinct from old.event_id
     or new.program_id         is distinct from old.program_id
     or new.position           is distinct from old.position then
    raise exception 'you may only check this item off, not change it'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists event_checklist_guard_trg on public.event_checklist_items;
create trigger event_checklist_guard_trg
  before update on public.event_checklist_items
  for each row execute function public.event_item_guard();

drop trigger if exists event_equipment_guard_trg on public.event_equipment_items;
create trigger event_equipment_guard_trg
  before update on public.event_equipment_items
  for each row execute function public.event_item_guard();

-- ============================================================================
-- Row Level Security
-- ============================================================================

alter table public.events                      enable row level security;
alter table public.event_checklist_items       enable row level security;
alter table public.event_equipment_items       enable row level security;
alter table public.event_volunteer_assignments enable row level security;
alter table public.event_list_templates        enable row level security;
alter table public.event_list_template_items   enable row level security;

grant select, insert, update, delete on public.events                      to authenticated;
grant select, insert, update, delete on public.event_checklist_items       to authenticated;
grant select, insert, update, delete on public.event_equipment_items       to authenticated;
grant select, insert, update, delete on public.event_volunteer_assignments to authenticated;
grant select, insert, update, delete on public.event_list_templates        to authenticated;
grant select, insert, update, delete on public.event_list_template_items   to authenticated;

-- ---- events: the whole roster reads, staff write --------------------------
drop policy if exists events_select on public.events;
create policy events_select on public.events for select to authenticated
  using (public.is_program_member(program_id) or public.is_program_org_admin(program_id));

drop policy if exists events_insert on public.events;
create policy events_insert on public.events for insert to authenticated
  with check (created_by = (select auth.uid()) and public.manages_program(program_id));

drop policy if exists events_update on public.events;
create policy events_update on public.events for update to authenticated
  using (public.manages_program(program_id)) with check (public.manages_program(program_id));

drop policy if exists events_delete on public.events;
create policy events_delete on public.events for delete to authenticated
  using (public.manages_program(program_id));

-- ---- list items: everyone reads, staff write, assignee may tick -----------
-- Repeated across the two item tables rather than generated, so each table's
-- rules can be read on their own.
drop policy if exists event_checklist_select on public.event_checklist_items;
create policy event_checklist_select on public.event_checklist_items for select to authenticated
  using (public.is_program_member(program_id) or public.is_program_org_admin(program_id));

drop policy if exists event_checklist_insert on public.event_checklist_items;
create policy event_checklist_insert on public.event_checklist_items for insert to authenticated
  with check (public.manages_program(program_id));

drop policy if exists event_checklist_update on public.event_checklist_items;
create policy event_checklist_update on public.event_checklist_items for update to authenticated
  using (
    public.manages_program(program_id)
    or (assigned_member_id is not null and public.owns_member_row(assigned_member_id))
  )
  with check (
    public.manages_program(program_id)
    or (assigned_member_id is not null and public.owns_member_row(assigned_member_id))
  );

drop policy if exists event_checklist_delete on public.event_checklist_items;
create policy event_checklist_delete on public.event_checklist_items for delete to authenticated
  using (public.manages_program(program_id));

drop policy if exists event_equipment_select on public.event_equipment_items;
create policy event_equipment_select on public.event_equipment_items for select to authenticated
  using (public.is_program_member(program_id) or public.is_program_org_admin(program_id));

drop policy if exists event_equipment_insert on public.event_equipment_items;
create policy event_equipment_insert on public.event_equipment_items for insert to authenticated
  with check (public.manages_program(program_id));

drop policy if exists event_equipment_update on public.event_equipment_items;
create policy event_equipment_update on public.event_equipment_items for update to authenticated
  using (
    public.manages_program(program_id)
    or (assigned_member_id is not null and public.owns_member_row(assigned_member_id))
  )
  with check (
    public.manages_program(program_id)
    or (assigned_member_id is not null and public.owns_member_row(assigned_member_id))
  );

drop policy if exists event_equipment_delete on public.event_equipment_items;
create policy event_equipment_delete on public.event_equipment_items for delete to authenticated
  using (public.manages_program(program_id));

-- ---- volunteers: the roster sees who is doing what, staff assign ----------
drop policy if exists event_volunteers_select on public.event_volunteer_assignments;
create policy event_volunteers_select on public.event_volunteer_assignments for select to authenticated
  using (public.is_program_member(program_id) or public.is_program_org_admin(program_id));

drop policy if exists event_volunteers_insert on public.event_volunteer_assignments;
create policy event_volunteers_insert on public.event_volunteer_assignments for insert to authenticated
  with check (public.manages_program(program_id));

drop policy if exists event_volunteers_delete on public.event_volunteer_assignments;
create policy event_volunteers_delete on public.event_volunteer_assignments for delete to authenticated
  using (public.manages_program(program_id));

-- ---- templates: a staff-side convenience, invisible to the roster ---------
drop policy if exists event_templates_select on public.event_list_templates;
create policy event_templates_select on public.event_list_templates for select to authenticated
  using (public.manages_program(program_id));

drop policy if exists event_templates_insert on public.event_list_templates;
create policy event_templates_insert on public.event_list_templates for insert to authenticated
  with check (created_by = (select auth.uid()) and public.manages_program(program_id));

drop policy if exists event_templates_delete on public.event_list_templates;
create policy event_templates_delete on public.event_list_templates for delete to authenticated
  using (public.manages_program(program_id));

drop policy if exists event_template_items_select on public.event_list_template_items;
create policy event_template_items_select on public.event_list_template_items for select to authenticated
  using (public.manages_program(program_id));

drop policy if exists event_template_items_insert on public.event_list_template_items;
create policy event_template_items_insert on public.event_list_template_items for insert to authenticated
  with check (public.manages_program(program_id));

drop policy if exists event_template_items_delete on public.event_list_template_items;
create policy event_template_items_delete on public.event_list_template_items for delete to authenticated
  using (public.manages_program(program_id));
