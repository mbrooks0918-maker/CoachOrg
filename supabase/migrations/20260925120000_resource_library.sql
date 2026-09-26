-- ============================================================================
-- The coaching resource library, moved out of the bundle and into the database
-- so staff can curate it.
--
-- Organization-scoped, not program-scoped: concussion guidance applies to
-- whoever is on the field, and the coach running soccer in the autumn is often
-- the one running basketball in the winter.
--
-- Every organization gets its OWN copy of the curated starting list rather
-- than sharing global rows. That is what makes "no special protection on the
-- seeded rows" safe to promise -- Albertville deleting the basketball section
-- cannot take it away from Sand Mountain Park.
-- ============================================================================

create table if not exists public.resource_categories (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title           text not null,
  blurb           text,
  position        integer not null default 0,
  created_at      timestamptz not null default now(),
  created_by      uuid references auth.users(id) on delete set null,

  constraint resource_categories_title_not_blank check (btrim(title) <> ''),
  constraint resource_categories_title_length    check (char_length(title) <= 60)
);

-- One "Soccer" per organization, however it was typed. The dialog lets staff
-- key in a new category name, so the same section arriving twice as "Soccer"
-- and "soccer" is the obvious way this table gets messy.
create unique index if not exists resource_categories_one_title_per_org
  on public.resource_categories (organization_id, lower(btrim(title)));

create table if not exists public.resources (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  -- restrict, not cascade: a category may only be deleted once it is empty,
  -- and that rule belongs somewhere it cannot be clicked past. The interface
  -- hides the delete control on a category that still holds something; this is
  -- what makes that a rule rather than a courtesy.
  category_id     uuid not null references public.resource_categories(id) on delete restrict,
  title           text not null,
  description     text,
  url             text not null,
  youtube_id      text,
  tag             text,
  position        integer not null default 0,
  created_at      timestamptz not null default now(),
  created_by      uuid references auth.users(id) on delete set null,

  constraint resources_title_not_blank check (btrim(title) <> ''),
  constraint resources_title_length    check (char_length(title) <= 120),
  -- Deliberately loose. This is the backstop against a pasted phone number or
  -- a bare "google.com", not an attempt to validate URLs in a check
  -- constraint; the interface does the tidying before it gets here.
  constraint resources_url_is_http     check (url ~* '^https?://[^[:space:]]+$'),
  constraint resources_url_length      check (char_length(url) <= 2048),
  -- YouTube ids are exactly eleven of this alphabet. Anything else is a
  -- pasted URL the interface failed to unwrap, and an eleven-character check
  -- is what turns that into an error instead of a blank player.
  constraint resources_youtube_id_shape
    check (youtube_id is null or youtube_id ~ '^[A-Za-z0-9_-]{11}$')
);

create index if not exists resources_by_category on public.resources (category_id);
create index if not exists resources_by_org      on public.resources (organization_id);

-- The resource and its category must belong to the same organization. Without
-- this a staff member could file one organization's link under another's
-- section by passing a category_id from elsewhere.
create or replace function public.resources_same_org()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.resource_categories c
     where c.id = new.category_id
       and c.organization_id = new.organization_id
  ) then
    raise exception 'That category belongs to a different organization.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists resources_same_org on public.resources;
create trigger resources_same_org
  before insert or update on public.resources
  for each row execute function public.resources_same_org();

-- ----------------------------------------------------------------- policies

alter table public.resource_categories enable row level security;
alter table public.resources           enable row level security;

-- Read: anybody in the organization. The rows are public web links, so there
-- is nothing here to keep from a parent -- the section is hidden from families
-- in the navigation because it is coaching material, not because it is
-- sensitive. Leaving the read policy open means turning family visibility on
-- later is an interface change and not a migration.
drop policy if exists resource_categories_select on public.resource_categories;
create policy resource_categories_select on public.resource_categories
  for select to authenticated
  using (
    public.is_org_program_member(organization_id)
    or public.staffs_org(organization_id)
  );

drop policy if exists resources_select on public.resources;
create policy resources_select on public.resources
  for select to authenticated
  using (
    public.is_org_program_member(organization_id)
    or public.staffs_org(organization_id)
  );

-- Write: organization staff. staffs_org() is already owner, athletic director,
-- or head coach / assistant coach / team manager of any program in the
-- organization -- exactly the set that should be curating this. No author
-- check on update or delete: this is shared organization content, so the
-- assistant who fixes a dead link put there by the head coach is doing the
-- right thing, not overstepping.
drop policy if exists resource_categories_write on public.resource_categories;
create policy resource_categories_write on public.resource_categories
  for all to authenticated
  using (public.staffs_org(organization_id))
  with check (public.staffs_org(organization_id));

drop policy if exists resources_write on public.resources;
create policy resources_write on public.resources
  for all to authenticated
  using (public.staffs_org(organization_id))
  with check (public.staffs_org(organization_id));

grant select, insert, update, delete on public.resource_categories to authenticated;
grant select, insert, update, delete on public.resources           to authenticated;

-- ------------------------------------------------------------ adding a row
--
-- One call, because "use the category called Soccer, or make it if there
-- isn't one" is two statements that must not half-happen. Invoker, so both
-- tables' policies apply to the caller exactly as they would to a plain
-- insert -- the function is here for atomicity, not for authority.

create or replace function public.add_resource(
  p_organization_id uuid,
  p_category_id     uuid,
  p_new_category    text,
  p_title           text,
  p_description     text,
  p_url             text,
  p_youtube_id      text,
  p_tag             text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_category uuid := p_category_id;
  v_name     text := btrim(coalesce(p_new_category, ''));
  v_id       uuid;
begin
  if v_category is null and v_name = '' then
    raise exception 'Pick a category, or name a new one.'
      using errcode = 'check_violation';
  end if;

  if v_category is null then
    -- Typing the name of a section that already exists should land the
    -- resource in that section rather than refusing the whole submission.
    select c.id into v_category
      from public.resource_categories c
     where c.organization_id = p_organization_id
       and lower(btrim(c.title)) = lower(v_name);

    if v_category is null then
      insert into public.resource_categories (organization_id, title, position, created_by)
      values (
        p_organization_id,
        v_name,
        coalesce((
          select max(c.position) + 1 from public.resource_categories c
           where c.organization_id = p_organization_id
        ), 0),
        (select auth.uid())
      )
      returning id into v_category;
    end if;
  end if;

  insert into public.resources (
    organization_id, category_id, title, description, url, youtube_id, tag, position, created_by
  )
  values (
    p_organization_id,
    v_category,
    btrim(p_title),
    nullif(btrim(coalesce(p_description, '')), ''),
    btrim(p_url),
    nullif(btrim(coalesce(p_youtube_id, '')), ''),
    nullif(btrim(coalesce(p_tag, '')), ''),
    coalesce((
      select max(r.position) + 1 from public.resources r where r.category_id = v_category
    ), 0),
    (select auth.uid())
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all     on function public.add_resource(uuid, uuid, text, text, text, text, text, text) from public;
revoke execute on function public.add_resource(uuid, uuid, text, text, text, text, text, text) from anon;
grant  execute on function public.add_resource(uuid, uuid, text, text, text, text, text, text) to authenticated;

-- ------------------------------------------------------------------- seed
--
-- The curated list every organization starts with. Definer so it can run from
-- the trigger below during organization creation, before the creator holds any
-- membership that a policy could recognise.

create or replace function public.seed_resource_library(p_organization_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_safety     uuid;
  v_philosophy uuid;
  v_soccer     uuid;
  v_flag       uuid;
  v_basketball uuid;
begin
  -- Never seed twice: the trigger fires on insert, and the backfill below
  -- runs over organizations that already exist.
  if exists (
    select 1 from public.resource_categories c where c.organization_id = p_organization_id
  ) then
    return;
  end if;

  insert into public.resource_categories (organization_id, title, blurb, position)
  values (p_organization_id, 'Safety & Certification',
          'Start here. These apply to every sport and most leagues expect them.', 0)
  returning id into v_safety;

  insert into public.resource_categories (organization_id, title, blurb, position)
  values (p_organization_id, 'Coaching Philosophy',
          'How to run a season kids want to come back to.', 1)
  returning id into v_philosophy;

  insert into public.resource_categories (organization_id, title, blurb, position)
  values (p_organization_id, 'Soccer',
          'Session plans and drills you can run at practice tomorrow.', 2)
  returning id into v_soccer;

  insert into public.resource_categories (organization_id, title, blurb, position)
  values (p_organization_id, 'Flag Football',
          'Practice plans, drills and the rules side of running a flag season.', 3)
  returning id into v_flag;

  insert into public.resource_categories (organization_id, title, blurb, position)
  values (p_organization_id, 'Basketball',
          'Curriculum for a whole season, and drills for a single practice.', 4)
  returning id into v_basketball;

  insert into public.resources
    (organization_id, category_id, title, description, url, youtube_id, tag, position)
  values
    (p_organization_id, v_safety, 'CDC HEADS UP Concussion Training',
     'The standard concussion course for youth coaches: spotting it, and what to do on the spot. Free, about 30 minutes, certificate at the end.',
     'https://www.cdc.gov/heads-up/training/youth-sports.html', null, 'Free course', 0),

    (p_organization_id, v_safety, 'How to Coach Kids',
     'Nike, Project Play and NRPA on coaching children rather than coaching a sport. Free, about 30 minutes, no sport-specific knowledge assumed.',
     'https://www.nrpa.org/our-work/Promotional-Partnerships/how-to-coach-kids/', null, 'Free course', 1),

    (p_organization_id, v_safety, 'Youth Sports Coach-Mentor Certification',
     'Free mentor training from the U.S. Soccer Foundation via NCYS. Written for all youth sports, not only soccer.',
     'https://ncys.org/education/free-youth-sports-mentor-certification/', null, 'Free', 2),

    (p_organization_id, v_philosophy, 'Positive Coaching Alliance',
     'Articles, videos and workshops on culture, parents and keeping sport worth playing. Much of the library is free to read.',
     'https://positivecoach.org/', null, null, 0),

    (p_organization_id, v_philosophy, 'National Alliance for Youth Sports',
     'NAYS coach training and certification, plus chapters for parents and officials. Some courses are paid.',
     'https://www.nays.org/', null, null, 1),

    (p_organization_id, v_soccer, 'OnlineSoccerTraining',
     'Straightforward drills aimed at younger and beginner teams. Start with the dribbling series below, then work through the channel.',
     'https://www.youtube.com/@onlinesoccertraining', 'dDXjFKn-eO8', 'Video', 0),

    (p_organization_id, v_soccer, 'SoccerCoachTV',
     'A large general drill library that scales up as your players do. The decision-making drill below works at any age.',
     'https://www.youtube.com/@SoccerCoachTV', 'JXDkJIGC9Ok', 'Video', 1),

    (p_organization_id, v_flag, 'USA Football Coach Tools',
     'Practice plans, drills and certification from the sport’s governing body. The flag coaching course is the one most leagues ask for.',
     'https://usafootball.com/coaches-organizations/coach-tools', null, null, 0),

    (p_organization_id, v_flag, 'NFL FLAG Coaches’ Guide',
     'The NFL’s own guide to running a flag team: practice structure, drills and rules. This is where the coaching content actually lives.',
     'https://playfootball.nfl.com/flag/coaches-guide/', null, 'Free', 1),

    (p_organization_id, v_flag, 'NFL Play Football (YouTube)',
     'The official NFL youth channel. Worth following for the programme, though the feed is league news and highlights rather than drills.',
     'https://www.youtube.com/@playfootball', null, null, 2),

    (p_organization_id, v_flag, '10 Most Popular Flag Football Drills',
     'MOJO’s ten drills, each written up with a diagram and a point. A good practice plan in one page.',
     'https://mojo.sport/coachs-corner/10-most-popular-flag-football-drills-on-mojo/', null, null, 3),

    (p_organization_id, v_basketball, 'Jr. NBA Instructional Curriculum',
     'Forty-eight ready-made practice plans by age group, free from the NBA. The closest thing to a season in a box.',
     'https://jr.nba.com/jr-nba-instructional-curriculum', null, 'Free', 0),

    (p_organization_id, v_basketball, 'Breakthrough Basketball Drill Library',
     'Over two hundred drills, filterable by skill and age. Free to browse; the deeper programmes are paid.',
     'https://www.breakthroughbasketball.com/drills/basketballdrills', null, null, 1);
end;
$$;

revoke all on function public.seed_resource_library(uuid) from public, anon, authenticated;

create or replace function public.seed_resource_library_on_org()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.seed_resource_library(new.id);
  return new;
end;
$$;

drop trigger if exists seed_resource_library_on_org on public.organizations;
create trigger seed_resource_library_on_org
  after insert on public.organizations
  for each row execute function public.seed_resource_library_on_org();

-- Every organization that already exists gets the same starting list.
do $$
declare
  v_org uuid;
begin
  for v_org in select id from public.organizations loop
    perform public.seed_resource_library(v_org);
  end loop;
end;
$$;
