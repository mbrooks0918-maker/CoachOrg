-- ============================================================================
-- Demo data that expired.
--
-- Sand Mountain Park was seeded on 2026-09-02 with registration windows
-- measured in weeks. Four weeks later three of the four had closed, which
-- takes the public sign-up links -- the thing the whole registration feature
-- exists to show -- off the air.
--
-- Scoped to Sand Mountain Park by name. Albertville is the real beta and
-- Riverside is somebody else's scratch org; neither is touched.
--
-- The windows are pushed well past any near-term demo rather than nudged, so
-- this does not need doing again next month.
-- ============================================================================

update public.seasons s
   set registration_closes_at = timestamptz '2027-06-30 23:59:00+00'
  from public.programs p
  join public.organizations o on o.id = p.organization_id
 where s.program_id = p.id
   and o.name = 'Sand Mountain Park'
   and s.registration_closes_at < timestamptz '2027-06-30 23:59:00+00';

-- Registration also has to have opened. Every seeded window opened in August,
-- so this is a guard rather than a change, but a season that opens in the
-- future is just as shut as one that has closed.
update public.seasons s
   set registration_opens_at = now() - interval '1 day'
  from public.programs p
  join public.organizations o on o.id = p.organization_id
 where s.program_id = p.id
   and o.name = 'Sand Mountain Park'
   and s.registration_opens_at > now();

-- ----------------------------------------------------------------------------
-- The three seeded reminders all fired on 2026-09-03, so Scheduled Tasks shows
-- an empty section. Two future ones, attached to real upcoming fixtures, so
-- the section demonstrates what it is for. Marked source 'manual' because that
-- is what a coach scheduling a reminder produces -- an announcement's push is
-- a different row and is deliberately not counted on the home tile.
-- ----------------------------------------------------------------------------

insert into public.scheduled_tasks (program_id, created_by, title, body, send_at, sent, source)
select
  p.id,
  (select m.user_id
     from public.program_members m
    where m.program_id = p.id
      and m.role = 'head_coach'
      and m.user_id is not null
    limit 1),
  v.title,
  v.body,
  v.send_at,
  false,
  'manual'
from public.programs p
join public.organizations o on o.id = p.organization_id
join (values
  ('Fall Soccer 8U',
   'Bring shin guards Saturday',
   'Season opener is at 9am at the north fields. Shin guards are required to take the pitch — spares are in the kit bag but there are only two pairs.',
   timestamptz '2026-10-02 14:00:00+00'),
  ('Flag Football',
   'Jamboree arrival time',
   'All divisions play Saturday. Please arrive 45 minutes before your slot for flag checks and the team photo.',
   timestamptz '2026-10-09 14:00:00+00')
) as v(program_name, title, body, send_at) on v.program_name = p.name
where o.name = 'Sand Mountain Park'
  -- Re-runnable: never stack a second copy of the same reminder.
  and not exists (
    select 1 from public.scheduled_tasks t
     where t.program_id = p.id and t.title = v.title
  );
