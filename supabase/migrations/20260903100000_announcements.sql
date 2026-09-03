-- Announcements: the "Comms" half of Roster & Comms.
--
-- The navigation has promised comms since the first week and delivered only
-- scheduled reminders, which are a coach talking to the future. This is a
-- coach talking to the team now: staff post, everyone on the roster reads,
-- and a push goes out.
--
-- Two things it deliberately does not do.
--
-- It does not build a second notification pipeline. Posting queues a row in
-- scheduled_tasks with send_at = now(), and the cron that has been running
-- every minute since August picks it up on its next pass and delivers it
-- through the same edge function, the same subscription table and the same
-- service worker as every reminder. The cost is up to sixty seconds of delay,
-- which for "practice is moved" is nothing, and the benefit is that there is
-- exactly one thing to keep working.
--
-- It does not invent visibility logic. Who may read a program's announcements
-- is is_program_member(), the same predicate scheduled_tasks and events
-- already use. A parent is a member of every program their child is on --
-- registration and claim_person both put them there -- so "a family only sees
-- announcements for programs their child is actually on" is not a new rule
-- here, it is the existing one asked again.

-- ============================================================================
-- 1. Tables
-- ============================================================================

create table if not exists public.announcements (
  id         uuid        primary key default gen_random_uuid(),
  program_id uuid        not null references public.programs (id) on delete cascade,
  -- Nullable so a post outlives the account that wrote it: a coach leaving
  -- should not silently delete what they told the team.
  author_id  uuid        references auth.users (id) on delete set null,
  title      text        not null check (btrim(title) <> ''),
  body       text        not null check (btrim(body) <> ''),
  pinned     boolean     not null default false,
  created_at timestamptz not null default now(),
  -- Null until somebody edits it, so the interface can say "edited" honestly
  -- rather than every row carrying a timestamp that means nothing.
  edited_at  timestamptz
);

comment on table public.announcements is
  'A message from staff to everyone on a program roster. Pinned rows sort first.';

create index if not exists announcements_feed_idx
  on public.announcements (program_id, pinned desc, created_at desc);

-- ----------------------------------------------------------------------------

create table if not exists public.announcement_reads (
  announcement_id uuid        not null references public.announcements (id) on delete cascade,
  user_id         uuid        not null references auth.users (id)           on delete cascade,
  read_at         timestamptz not null default now(),

  constraint announcement_reads_pkey primary key (announcement_id, user_id)
);

comment on table public.announcement_reads is
  'One row per person per announcement they have seen. Absence means unread.';

create index if not exists announcement_reads_user_idx
  on public.announcement_reads (user_id);

-- ============================================================================
-- 2. Keeping the reminders screen honest
--
-- Announcement pushes travel as scheduled_tasks rows, which would otherwise
-- turn up in the coach's reminder list as things they never scheduled. The
-- column says where a row came from so that screen can show only the reminders
-- somebody actually wrote.
-- ============================================================================

alter table public.scheduled_tasks
  add column if not exists source text not null default 'manual'
    check (source in ('manual', 'announcement'));

-- ============================================================================
-- 3. Helpers
-- ============================================================================

-- "May I moderate anything in the organization above this program?"
-- is_org_leader() is owner-or-AD and already exists; this only saves every
-- caller from looking up the organization first.
create or replace function public.program_org_leader(p_program_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.programs p
     where p.id = p_program_id and public.is_org_leader(p.organization_id)
  );
$$;

revoke all     on function public.program_org_leader(uuid) from public;
revoke execute on function public.program_org_leader(uuid) from anon;
grant  execute on function public.program_org_leader(uuid) to authenticated;

-- How many announcements this person has not seen.
--
-- Deliberately NOT security definer: run as the caller, and the select policy
-- below decides what is countable. A number that cannot count anything the
-- reader could not open is correct by construction rather than by a guard
-- somebody has to remember to write.
--
-- Your own posts never count as unread. A coach does not need telling about
-- the thing they just wrote.
create or replace function public.unread_announcement_count(p_program_id uuid)
returns integer
language sql
stable
set search_path = ''
as $$
  select count(*)::integer
    from public.announcements a
   where a.program_id = p_program_id
     and a.author_id is distinct from (select auth.uid())
     and not exists (
       select 1
         from public.announcement_reads r
        where r.announcement_id = a.id
          and r.user_id = (select auth.uid())
     );
$$;

revoke all     on function public.unread_announcement_count(uuid) from public;
revoke execute on function public.unread_announcement_count(uuid) from anon;
grant  execute on function public.unread_announcement_count(uuid) to authenticated;

-- ============================================================================
-- 4. Posting queues the push
--
-- A trigger rather than a second client call, so an announcement cannot be
-- posted without notifying: there is no path through the interface, or around
-- it, that writes the row and forgets the push.
--
-- INSERT only. Fixing a typo should not buzz forty phones a second time.
-- ============================================================================

create or replace function public.announcements_queue_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_program text;
begin
  -- author_id is not null on any insert the policy admits; this is belt and
  -- braces for a service-role write, where a null would break the not-null on
  -- scheduled_tasks.created_by and take the announcement down with it.
  if new.author_id is null then
    return new;
  end if;

  select p.name into v_program from public.programs p where p.id = new.program_id;

  insert into public.scheduled_tasks (
    program_id, created_by, title, body, send_at, source
  )
  values (
    new.program_id,
    new.author_id,
    new.title,
    v_program || ' — ' || left(regexp_replace(new.body, '\s+', ' ', 'g'), 140),
    now(),
    'announcement'
  );

  return new;
end;
$$;

drop trigger if exists announcements_queue_push_trg on public.announcements;
create trigger announcements_queue_push_trg
  after insert on public.announcements
  for each row execute function public.announcements_queue_push();

-- Stamp edited_at rather than trusting the client to say it was edited.
create or replace function public.announcements_stamp_edit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Pinning is not editing: sticking a post to the top does not change what it
  -- says, and marking it "edited" would be a lie.
  if new.title is distinct from old.title or new.body is distinct from old.body then
    new.edited_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists announcements_stamp_edit_trg on public.announcements;
create trigger announcements_stamp_edit_trg
  before update on public.announcements
  for each row execute function public.announcements_stamp_edit();

-- ============================================================================
-- 5. Row Level Security
-- ============================================================================

alter table public.announcements       enable row level security;
alter table public.announcement_reads  enable row level security;

grant select, insert, update, delete on public.announcements      to authenticated;
grant select, insert, delete         on public.announcement_reads to authenticated;

-- Everyone on the roster, plus the head coach and any AD over the program.
-- The same three predicates scheduled_tasks_select and events_select use --
-- copied deliberately rather than re-derived, so the three cannot drift.
drop policy if exists announcements_select on public.announcements;
create policy announcements_select
  on public.announcements
  for select
  to authenticated
  using (
    public.is_program_member(program_id)
    or public.is_head_coach(program_id)
    or public.is_program_org_admin(program_id)
  );

-- Staff of this program only, posting as themselves.
drop policy if exists announcements_insert on public.announcements;
create policy announcements_insert
  on public.announcements
  for insert
  to authenticated
  with check (
    public.manages_program(program_id)
    and author_id = (select auth.uid())
  );

-- Your own post, or anything in your organization if you run it. An assistant
-- coach cannot quietly rewrite the head coach's words.
drop policy if exists announcements_update on public.announcements;
create policy announcements_update
  on public.announcements
  for update
  to authenticated
  using (
    (author_id = (select auth.uid()) and public.manages_program(program_id))
    or public.program_org_leader(program_id)
  )
  with check (
    (author_id = (select auth.uid()) and public.manages_program(program_id))
    or public.program_org_leader(program_id)
  );

drop policy if exists announcements_delete on public.announcements;
create policy announcements_delete
  on public.announcements
  for delete
  to authenticated
  using (
    (author_id = (select auth.uid()) and public.manages_program(program_id))
    or public.program_org_leader(program_id)
  );

-- ------------------------------------------------------- announcement_reads

-- Yours and nobody else's, in both directions: you cannot see who else has
-- read a post, and you cannot mark a post read on somebody else's behalf.
drop policy if exists announcement_reads_select on public.announcement_reads;
create policy announcement_reads_select
  on public.announcement_reads
  for select
  to authenticated
  using (user_id = (select auth.uid()));

-- The EXISTS is filtered by announcements_select, so a read receipt can only
-- be filed against something the reader was allowed to open.
drop policy if exists announcement_reads_insert on public.announcement_reads;
create policy announcement_reads_insert
  on public.announcement_reads
  for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.announcements a where a.id = announcement_id)
  );

drop policy if exists announcement_reads_delete on public.announcement_reads;
create policy announcement_reads_delete
  on public.announcement_reads
  for delete
  to authenticated
  using (user_id = (select auth.uid()));
