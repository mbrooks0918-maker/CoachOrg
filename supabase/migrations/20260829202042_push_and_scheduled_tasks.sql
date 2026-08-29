-- Web push subscriptions and scheduled notification tasks.
--
-- Both tables reuse the SECURITY DEFINER helpers from the initial schema
-- (is_head_coach, is_program_staff, is_program_org_admin, is_program_member,
-- program_role), so no policy here queries a policed table directly and there
-- is no recursion risk.

-- ============================================================================
-- push_subscriptions
-- ============================================================================

create table if not exists public.push_subscriptions (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null references auth.users (id) on delete cascade,
  -- the browser's PushSubscription, as returned by subscription.toJSON():
  -- { endpoint, expirationTime, keys: { p256dh, auth } }
  subscription jsonb       not null,
  created_at   timestamptz not null default now(),

  -- One row per browser. jsonb normalises key order, so re-subscribing from
  -- the same browser produces a byte-identical value and collides here rather
  -- than accumulating duplicates.
  constraint push_subscriptions_user_id_subscription_key
    unique (user_id, subscription)
);

comment on table public.push_subscriptions is
  'Per-browser web push subscriptions. One user may have several devices.';

create index if not exists push_subscriptions_user_id_idx
  on public.push_subscriptions (user_id);

-- ============================================================================
-- scheduled_tasks
-- ============================================================================

create table if not exists public.scheduled_tasks (
  id          uuid        primary key default gen_random_uuid(),
  program_id  uuid        not null references public.programs (id) on delete cascade,
  created_by  uuid        not null references auth.users (id) on delete cascade,
  title       text        not null,
  body        text,
  send_at     timestamptz not null,
  -- null means notify everyone in the program
  target_role text        check (
                target_role is null
                or target_role in (
                  'head_coach',
                  'assistant_coach',
                  'team_manager',
                  'parent',
                  'player'
                )
              ),
  sent        boolean     not null default false,
  created_at  timestamptz not null default now()
);

comment on table public.scheduled_tasks is
  'Notifications queued for future delivery by the send-scheduled-notifications edge function.';

create index if not exists scheduled_tasks_program_id_idx
  on public.scheduled_tasks (program_id);

-- The delivery worker polls "due and not yet sent" on a tight loop. A partial
-- index keeps that lookup off the already-sent rows, which are the bulk of the
-- table over time.
create index if not exists scheduled_tasks_due_idx
  on public.scheduled_tasks (send_at)
  where sent = false;

-- ============================================================================
-- Row Level Security
-- ============================================================================

alter table public.push_subscriptions enable row level security;
alter table public.scheduled_tasks    enable row level security;

grant select, insert, update, delete on public.push_subscriptions to authenticated;
grant select, insert, update, delete on public.scheduled_tasks    to authenticated;

-- --------------------------------------------------- push_subscriptions ----

-- Strictly own rows. A subscription is a capability: anyone holding the
-- endpoint and keys can push to that device, so this table must never be
-- readable across users.
drop policy if exists push_subscriptions_select_own on public.push_subscriptions;
create policy push_subscriptions_select_own
  on public.push_subscriptions
  for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists push_subscriptions_insert_own on public.push_subscriptions;
create policy push_subscriptions_insert_own
  on public.push_subscriptions
  for insert
  to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists push_subscriptions_delete_own on public.push_subscriptions;
create policy push_subscriptions_delete_own
  on public.push_subscriptions
  for delete
  to authenticated
  using (user_id = (select auth.uid()));

-- No UPDATE policy: a subscription is replaced, not edited. The client stores
-- rows with ON CONFLICT DO NOTHING, which needs only INSERT.

-- ------------------------------------------------------- scheduled_tasks ----

-- Staff see every task for their program. Parents and players see only tasks
-- addressed to everyone (target_role is null) or to their own role -- a task
-- aimed at 'player' is not visible to parents, and vice versa.
drop policy if exists scheduled_tasks_select on public.scheduled_tasks;
create policy scheduled_tasks_select
  on public.scheduled_tasks
  for select
  to authenticated
  using (
    public.is_head_coach(program_id)
    or public.is_program_staff(program_id)
    or public.is_program_org_admin(program_id)
    or (
      public.is_program_member(program_id)
      and (
        target_role is null
        or target_role = public.program_role(program_id)
      )
    )
  );

-- Head coach, assistant coaches and team managers may queue tasks. created_by
-- is pinned to the caller so a task cannot be attributed to someone else.
drop policy if exists scheduled_tasks_insert on public.scheduled_tasks;
create policy scheduled_tasks_insert
  on public.scheduled_tasks
  for insert
  to authenticated
  with check (
    created_by = (select auth.uid())
    and (
      public.is_head_coach(program_id)
      or public.is_program_staff(program_id)
    )
  );

-- The WITH CHECK repeats the predicate so a task cannot be moved to another
-- program on the way out of an update.
drop policy if exists scheduled_tasks_update on public.scheduled_tasks;
create policy scheduled_tasks_update
  on public.scheduled_tasks
  for update
  to authenticated
  using (
    public.is_head_coach(program_id)
    or public.is_program_staff(program_id)
  )
  with check (
    public.is_head_coach(program_id)
    or public.is_program_staff(program_id)
  );

-- No DELETE policy is defined, so deletes are denied to every ordinary user.
-- Cancelling a queued task is not yet a designed flow; add a policy when it
-- is. The edge function runs with the service role and bypasses RLS, so it
-- can still mark tasks sent.
