-- Public registration: seasons, questions, and the sign-up itself.
--
-- The first thing in CoachOrg a stranger can reach without an account. A rec
-- centre publishes a link, a parent opens it on their phone, fills in their
-- child, makes an account at the end, and the child lands on a roster.
--
-- Two rules shape most of what follows.
--
-- Ineligible is refused; full is waitlisted. A child outside the age bracket
-- is not eligible for this season and never will be, so holding them in a
-- queue is a lie -- and in practice it is far more often a mistyped birthdate
-- than a real attempt. A full season is the opposite: the child IS eligible
-- and places genuinely open when families withdraw, so refusing there just
-- sends away somebody the rec centre wants. The bracket is therefore checked
-- BEFORE the child's record is created, so a typo leaves nothing behind for
-- staff to tidy up.
--
-- Nothing here works without the registration feature. The check sits inside
-- the two functions a caller can actually reach, so an organization that has
-- not been switched on cannot be talked into serving a form or accepting a
-- submission, whatever the interface does.

-- ============================================================================
-- 1. Seasons learn to accept registrations
-- ============================================================================

alter table public.seasons
  add column if not exists registration_opens_at  timestamptz,
  add column if not exists registration_closes_at timestamptz,
  -- Null capacity means uncapped; nobody is ever waitlisted.
  add column if not exists capacity               integer check (capacity is null or capacity > 0),
  add column if not exists min_age                integer check (min_age is null or min_age between 0 and 100),
  add column if not exists max_age                integer check (max_age is null or max_age between 0 and 100),
  -- "Under 9 as of 31 August" is how youth sport actually words a bracket.
  -- Null falls back to the season start, then to today.
  add column if not exists age_as_of              date,
  -- The public address of the form. Random rather than sequential so a link
  -- cannot be walked to discover other seasons.
  add column if not exists public_token           text not null default replace(gen_random_uuid()::text, '-', '');

alter table public.seasons
  drop constraint if exists seasons_public_token_key;
alter table public.seasons
  add constraint seasons_public_token_key unique (public_token);

alter table public.seasons
  drop constraint if exists seasons_age_range_check;
alter table public.seasons
  add constraint seasons_age_range_check
  check (min_age is null or max_age is null or min_age <= max_age);

comment on column public.seasons.public_token is
  'Addresses the public form at /register/<token>. Setting both registration timestamps is what publishes it.';

-- ============================================================================
-- 2. Questions a rec centre wants asked
-- ============================================================================

create table if not exists public.season_questions (
  id         uuid        primary key default gen_random_uuid(),
  season_id  uuid        not null references public.seasons (id) on delete cascade,
  prompt     text        not null,
  kind       text        not null check (kind in ('text', 'boolean', 'choice')),
  -- Only meaningful for 'choice'; the trigger below insists on it there.
  options    text[]      not null default '{}',
  required   boolean     not null default false,
  position   integer     not null default 0,
  created_at timestamptz not null default now()
);

comment on table public.season_questions is
  'Extra fields a program asks at sign-up: shirt size, prior experience, photo consent.';

create index if not exists season_questions_season_idx
  on public.season_questions (season_id, position);

create or replace function public.season_questions_validate()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.kind = 'choice' and coalesce(array_length(new.options, 1), 0) < 2 then
    raise exception 'season_questions: a multiple-choice question needs at least two options'
      using errcode = '23514';
  end if;
  if new.kind <> 'choice' and coalesce(array_length(new.options, 1), 0) > 0 then
    raise exception 'season_questions: only a multiple-choice question has options'
      using errcode = '23514';
  end if;
  if btrim(new.prompt) = '' then
    raise exception 'season_questions: a question needs wording' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists season_questions_validate_trg on public.season_questions;
create trigger season_questions_validate_trg
  before insert or update on public.season_questions
  for each row execute function public.season_questions_validate();

-- ============================================================================
-- 3. The registrations themselves
-- ============================================================================

create table if not exists public.registrations (
  id                uuid        primary key default gen_random_uuid(),
  organization_id   uuid        not null references public.organizations (id) on delete cascade,
  program_id        uuid        not null references public.programs (id)      on delete cascade,
  season_id         uuid        not null references public.seasons (id)       on delete cascade,
  person_id         uuid        not null references public.people (id)        on delete cascade,
  -- The account that filled the form in. Kept even if guardianship changes.
  submitted_by      uuid        references auth.users (id) on delete set null,
  status            text        not null default 'confirmed'
                      check (status in ('confirmed', 'waitlisted', 'withdrawn', 'pending_payment')),
  -- No stored waitlist position on purpose: it drifts the moment anybody
  -- withdraws or is promoted, and a stale number shown to a parent is worse
  -- than none. Rank is whatever created_at says at the moment somebody looks.
  -- PIECE 4 HOOK. Every registration today is 'not_required' and confirms on
  -- the spot. When payment lands, a season with a fee will submit as
  -- 'pending_payment' / 'pending' instead, and the Stripe webhook -- not this
  -- function -- will be what moves it to 'confirmed' / 'paid'. The gate is
  -- confirm_registration() below; that is the only place status becomes
  -- 'confirmed', so it is the only place that will need the condition.
  payment_status    text        not null default 'not_required'
                      check (payment_status in ('not_required', 'pending', 'paid', 'refunded')),
  created_at        timestamptz not null default now(),

  constraint registrations_season_person_key unique (season_id, person_id)
);

comment on table public.registrations is
  'One child signed up for one season. Confirmed rows have a matching roster spot; waitlisted rows deliberately do not.';

create index if not exists registrations_season_idx on public.registrations (season_id, status);
create index if not exists registrations_person_idx on public.registrations (person_id);
create index if not exists registrations_org_idx    on public.registrations (organization_id);

create table if not exists public.registration_answers (
  id              uuid primary key default gen_random_uuid(),
  registration_id uuid not null references public.registrations (id)    on delete cascade,
  question_id     uuid not null references public.season_questions (id) on delete cascade,
  answer          text not null,

  constraint registration_answers_key unique (registration_id, question_id)
);

comment on table public.registration_answers is
  'What one family answered to one custom question.';

create index if not exists registration_answers_reg_idx on public.registration_answers (registration_id);

-- ============================================================================
-- 4. register_person(), split so registration can reuse the duplicate guard
--
-- The guard -- same name, same birthdate, hold it for a human -- must run for
-- a parent signing up from the street exactly as it does for staff typing
-- somebody in. But register_person() checks staffs_org() first, and a parent
-- is not staff, so it cannot simply be called.
--
-- Rather than write a second copy of the matching logic and let the two drift,
-- the body moves into a core with no permission check of its own and EXECUTE
-- revoked from every client role. Only a security definer function running as
-- the owner can reach it. register_person() keeps its signature and its guard
-- and now just wraps the core; submit_registration() calls the same core.
-- ============================================================================

create or replace function public.person_create_guarded(
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
begin
  if btrim(coalesce(p_full_name, '')) = '' then
    raise exception 'person_create_guarded: a name is required' using errcode = '22023';
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
    end loop;
  end if;

  return v_person_id;
end;
$$;

-- Reachable only from inside another definer function. No client role may call
-- it, because it is the one path that creates a person with no permission check.
revoke all on function public.person_create_guarded(uuid, text, date, text, text, text, text) from public;
revoke all on function public.person_create_guarded(uuid, text, date, text, text, text, text) from anon;
revoke all on function public.person_create_guarded(uuid, text, date, text, text, text, text) from authenticated;

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
begin
  if not public.staffs_org(p_organization_id) then
    raise exception 'register_person: not permitted for this organization'
      using errcode = '42501';
  end if;

  return public.person_create_guarded(
    p_organization_id, p_full_name, p_birthdate, p_phone_number,
    p_emergency_contact_name, p_emergency_contact_phone, p_medical_notes
  );
end;
$$;

revoke all on function public.register_person(uuid, text, date, text, text, text, text) from public;
revoke all on function public.register_person(uuid, text, date, text, text, text, text) from anon;
grant execute on function public.register_person(uuid, text, date, text, text, text, text) to authenticated;

-- ============================================================================
-- 5. Age brackets
-- ============================================================================

create or replace function public.season_age_ok(p_season_id uuid, p_birthdate date)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_season public.seasons%rowtype;
  v_as_of  date;
  v_age    integer;
begin
  select * into v_season from public.seasons s where s.id = p_season_id;
  if v_season.id is null then return false; end if;

  -- No bracket, no question.
  if v_season.min_age is null and v_season.max_age is null then return true; end if;

  -- A bracket with nothing to measure against cannot be satisfied. Saying
  -- "yes" here would let an unchecked child through a season that asked.
  if p_birthdate is null then return false; end if;

  v_as_of := coalesce(v_season.age_as_of, v_season.starts_on, current_date);
  v_age := date_part('year', age(v_as_of::timestamp, p_birthdate::timestamp))::integer;

  return (v_season.min_age is null or v_age >= v_season.min_age)
     and (v_season.max_age is null or v_age <= v_season.max_age);
end;
$$;

revoke all     on function public.season_age_ok(uuid, date) from public;
revoke execute on function public.season_age_ok(uuid, date) from anon;
grant  execute on function public.season_age_ok(uuid, date) to authenticated;

-- ============================================================================
-- 6. Helpers for the policies below
-- ============================================================================

create or replace function public.manages_season(p_season_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.seasons s
     where s.id = p_season_id and public.manages_program(s.program_id)
  );
$$;

create or replace function public.can_see_season(p_season_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.seasons s
     where s.id = p_season_id
       and (
         public.is_program_member(s.program_id)
         or public.is_program_org_admin(s.program_id)
         or public.is_head_coach(s.program_id)
       )
  );
$$;

-- "Is this season's organization actually paying for registration?"
create or replace function public.season_registration_enabled(p_season_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
      from public.seasons s
      join public.programs pr on pr.id = s.program_id
     where s.id = p_season_id
       and public.org_has_feature(pr.organization_id, 'registration')
  );
$$;

revoke all     on function public.manages_season(uuid)               from public;
revoke execute on function public.manages_season(uuid)               from anon;
grant  execute on function public.manages_season(uuid)               to authenticated;
revoke all     on function public.can_see_season(uuid)               from public;
revoke execute on function public.can_see_season(uuid)               from anon;
grant  execute on function public.can_see_season(uuid)               to authenticated;
revoke all     on function public.season_registration_enabled(uuid)  from public;
revoke execute on function public.season_registration_enabled(uuid)  from anon;
grant  execute on function public.season_registration_enabled(uuid)  to authenticated;

-- ============================================================================
-- 7. public_season_info() -- the one thing a stranger may read
--
-- Granted to anon, which nothing else in this schema is. It therefore returns
-- only what a poster on a noticeboard would say: which program, which season,
-- when it runs, who it is for, how many places are left, and what the form
-- will ask. No names, no roster, no contact details.
--
-- An organization without the registration feature has no public form, and
-- says so the same way a wrong token does -- one answer, so the endpoint
-- cannot be used to tell "not switched on" from "no such season".
-- ============================================================================

create or replace function public.public_season_info(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_season    public.seasons%rowtype;
  v_program   public.programs%rowtype;
  v_org_name  text;
  v_org_id    uuid;
  v_confirmed integer;
begin
  select * into v_season
    from public.seasons s
   where s.public_token = p_token
     and s.registration_opens_at is not null
     and s.registration_closes_at is not null;

  if not found then
    raise exception 'public_season_info: no such registration' using errcode = '22023';
  end if;

  select * into v_program from public.programs p where p.id = v_season.program_id;
  select o.name, o.id into v_org_name, v_org_id
    from public.organizations o where o.id = v_program.organization_id;

  if not public.org_has_feature(v_org_id, 'registration') then
    raise exception 'public_season_info: no such registration' using errcode = '22023';
  end if;

  select count(*) into v_confirmed
    from public.registrations r
   where r.season_id = v_season.id and r.status = 'confirmed';

  return jsonb_build_object(
    'season_id',              v_season.id,
    'organization_id',        v_org_id,
    'organization_name',      v_org_name,
    'program_name',           v_program.name,
    'sport',                  v_program.sport,
    'season_name',            v_season.name,
    'starts_on',              v_season.starts_on,
    'ends_on',                v_season.ends_on,
    'registration_opens_at',  v_season.registration_opens_at,
    'registration_closes_at', v_season.registration_closes_at,
    'open_now',               now() >= v_season.registration_opens_at
                                and now() <= v_season.registration_closes_at,
    'capacity',               v_season.capacity,
    'spots_remaining',        case when v_season.capacity is null then null
                                   else greatest(v_season.capacity - v_confirmed, 0) end,
    'min_age',                v_season.min_age,
    'max_age',                v_season.max_age,
    'age_as_of',              coalesce(v_season.age_as_of, v_season.starts_on),
    'questions',              coalesce((
                                select jsonb_agg(jsonb_build_object(
                                         'id', q.id, 'prompt', q.prompt, 'kind', q.kind,
                                         'options', q.options, 'required', q.required
                                       ) order by q.position, q.created_at)
                                  from public.season_questions q
                                 where q.season_id = v_season.id
                              ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.public_season_info(text) from public;
grant execute on function public.public_season_info(text) to anon;
grant execute on function public.public_season_info(text) to authenticated;

-- ============================================================================
-- 8. submit_registration()
--
-- Anonymous browsing ends here: this requires an account, because a
-- registration that belongs to nobody cannot be looked after -- the adult has
-- to be reachable, and has to be able to come back and see it.
--
-- The season row is locked for the duration. Without that, two families
-- submitting into the last place would both count the same free spot and both
-- be confirmed, and a capacity of twelve would quietly become thirteen.
-- ============================================================================

create or replace function public.submit_registration(
  p_token                   text,
  p_parent_name             text  default null,
  p_parent_phone            text  default null,
  p_person_id               uuid  default null,
  p_child_name              text  default null,
  p_birthdate               date  default null,
  p_emergency_contact_name  text  default null,
  p_emergency_contact_phone text  default null,
  p_medical_notes           text  default null,
  p_answers                 jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid        uuid := (select auth.uid());
  v_season     public.seasons%rowtype;
  v_program    public.programs%rowtype;
  v_org        uuid;
  v_parent     uuid;
  v_child      uuid;
  v_birthdate  date := p_birthdate;
  v_confirmed  integer;
  v_status     text;
  v_rank       integer;
  v_reg        uuid;
  v_question   public.season_questions%rowtype;
  v_answer     text;
begin
  if v_uid is null then
    raise exception 'submit_registration: authentication required' using errcode = '28000';
  end if;

  select * into v_season
    from public.seasons s
   where s.public_token = p_token
     and s.registration_opens_at is not null
     and s.registration_closes_at is not null
     for update;

  if not found then
    raise exception 'submit_registration: no such registration' using errcode = '22023';
  end if;

  select * into v_program from public.programs p where p.id = v_season.program_id;
  v_org := v_program.organization_id;

  if not public.org_has_feature(v_org, 'registration') then
    raise exception 'submit_registration: no such registration' using errcode = '22023';
  end if;

  if now() < v_season.registration_opens_at then
    raise exception 'submit_registration: registration for % has not opened yet', v_season.name
      using errcode = '22023';
  end if;
  if now() > v_season.registration_closes_at then
    raise exception 'submit_registration: registration for % has closed', v_season.name
      using errcode = '22023';
  end if;

  -- ---- the adult ----------------------------------------------------------
  select p.id into v_parent
    from public.people p
   where p.organization_id = v_org and p.user_id = v_uid;

  if v_parent is null then
    if btrim(coalesce(p_parent_name, '')) = '' then
      raise exception 'submit_registration: your name is required' using errcode = '22023';
    end if;
    insert into public.people (organization_id, full_name, phone_number, user_id)
    values (v_org, btrim(p_parent_name), p_parent_phone, v_uid)
    returning id into v_parent;
  elsif btrim(coalesce(p_parent_phone, '')) <> '' then
    update public.people set phone_number = p_parent_phone, updated_at = now()
     where id = v_parent;
  end if;

  -- ---- the child ----------------------------------------------------------
  if p_person_id is not null then
    -- Registering somebody already known here is only allowed to the adult
    -- responsible for them. Otherwise this would be a way to read a child's
    -- details back by registering them.
    if not exists (
      select 1 from public.guardians g
       where g.person_id = p_person_id and g.guardian_user_id = v_uid
    ) then
      raise exception 'submit_registration: that is not your child to register'
        using errcode = '42501';
    end if;
    if not exists (
      select 1 from public.people p where p.id = p_person_id and p.organization_id = v_org
    ) then
      raise exception 'submit_registration: that child belongs to another organization'
        using errcode = '42501';
    end if;
    v_child := p_person_id;
    select d.birthdate into v_birthdate from public.person_details d where d.person_id = v_child;
  end if;

  -- Checked before the child's record exists, so a mistyped birthdate leaves
  -- nothing behind. Ineligible is a refusal, not a queue: the season is not
  -- for them and no amount of waiting changes that.
  if not public.season_age_ok(v_season.id, v_birthdate) then
    raise exception 'submit_registration: % takes ages % to % (as of %) -- check the date of birth',
      v_season.name,
      coalesce(v_season.min_age::text, 'any'),
      coalesce(v_season.max_age::text, 'any'),
      to_char(coalesce(v_season.age_as_of, v_season.starts_on, current_date), 'DD Mon YYYY')
      using errcode = '23514';
  end if;

  if v_child is null then
    if btrim(coalesce(p_child_name, '')) = '' then
      raise exception 'submit_registration: the player''s name is required' using errcode = '22023';
    end if;
    -- Same duplicate guard staff get: a matching name and birthdate is filed
    -- for a human to look at, never merged and never silently doubled.
    v_child := public.person_create_guarded(
      v_org, p_child_name, v_birthdate, null,
      p_emergency_contact_name, p_emergency_contact_phone, p_medical_notes
    );
  end if;

  if exists (
    select 1 from public.registrations r
     where r.season_id = v_season.id and r.person_id = v_child and r.status <> 'withdrawn'
  ) then
    raise exception 'submit_registration: they are already signed up for %', v_season.name
      using errcode = '23505';
  end if;

  -- ---- required questions -------------------------------------------------
  for v_question in
    select * from public.season_questions q where q.season_id = v_season.id order by q.position
  loop
    v_answer := nullif(btrim(coalesce(p_answers ->> v_question.id::text, '')), '');

    if v_question.required and v_answer is null then
      raise exception 'submit_registration: "%" needs an answer', v_question.prompt
        using errcode = '22023';
    end if;
    if v_answer is not null and v_question.kind = 'choice'
       and not (v_answer = any (v_question.options)) then
      raise exception 'submit_registration: "%" is not one of the choices for "%"',
        v_answer, v_question.prompt using errcode = '22023';
    end if;
    if v_answer is not null and v_question.kind = 'boolean'
       and v_answer not in ('true', 'false') then
      raise exception 'submit_registration: "%" expects yes or no', v_question.prompt
        using errcode = '22023';
    end if;
  end loop;

  -- ---- confirmed, or waitlisted -------------------------------------------
  select count(*) into v_confirmed
    from public.registrations r
   where r.season_id = v_season.id and r.status = 'confirmed';

  if v_season.capacity is not null and v_confirmed >= v_season.capacity then
    v_status := 'waitlisted';
  else
    v_status := 'confirmed';
  end if;

  insert into public.registrations (
    organization_id, program_id, season_id, person_id, submitted_by, status
  )
  values (v_org, v_program.id, v_season.id, v_child, v_uid, v_status)
  returning id into v_reg;

  insert into public.registration_answers (registration_id, question_id, answer)
  select v_reg, q.id, btrim(p_answers ->> q.id::text)
    from public.season_questions q
   where q.season_id = v_season.id
     and nullif(btrim(coalesce(p_answers ->> q.id::text, '')), '') is not null;

  -- ---- the adult joins the team and is recorded as responsible ------------
  -- Both happen whether confirmed or waitlisted: the relationship is true
  -- either way, and a waitlisted family still needs to see where they stand.
  if not exists (
    select 1 from public.program_members m
     where m.program_id = v_program.id and m.person_id = v_parent
  ) then
    insert into public.program_members (program_id, person_id, role)
    values (v_program.id, v_parent, 'parent');
  end if;

  insert into public.guardians (organization_id, person_id, guardian_user_id)
  values (v_org, v_child, v_uid)
  on conflict on constraint guardians_pair_key do nothing;

  -- Only a confirmed registration puts a child on the roster. A waitlisted
  -- child is not on the team, and showing them there would be a lie the coach
  -- would plan around.
  if v_status = 'confirmed' then
    insert into public.program_members (program_id, person_id, role, season_id)
    values (v_program.id, v_child, 'player', v_season.id)
    on conflict do nothing;
  else
    select count(*) + 1 into v_rank
      from public.registrations r
     where r.season_id = v_season.id and r.status = 'waitlisted' and r.id <> v_reg;
  end if;

  return jsonb_build_object(
    'registration_id', v_reg,
    'status',          v_status,
    'waitlist_rank',   v_rank,
    'child_name',      (select p.full_name from public.people p where p.id = v_child),
    'season_name',     v_season.name,
    'program_name',    v_program.name,
    'program_id',      v_program.id
  );
end;
$$;

revoke all on function public.submit_registration(text, text, text, uuid, text, date, text, text, text, jsonb) from public;
revoke all on function public.submit_registration(text, text, text, uuid, text, date, text, text, text, jsonb) from anon;
grant execute on function public.submit_registration(text, text, text, uuid, text, date, text, text, text, jsonb) to authenticated;

-- ============================================================================
-- 9. Moving a registration
--
-- Status is only ever changed through these two, never by an UPDATE from the
-- interface, because every transition has to keep the roster in step. There is
-- deliberately no UPDATE policy on registrations at all.
-- ============================================================================

create or replace function public.confirm_registration(p_registration_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reg       public.registrations%rowtype;
  v_season    public.seasons%rowtype;
  v_confirmed integer;
begin
  select * into v_reg from public.registrations r where r.id = p_registration_id;
  if not found then
    raise exception 'confirm_registration: no such registration' using errcode = '22023';
  end if;

  if not (public.manages_person(v_reg.person_id) or public.staffs_org(v_reg.organization_id)) then
    raise exception 'confirm_registration: not permitted' using errcode = '42501';
  end if;

  if v_reg.status = 'confirmed' then
    return jsonb_build_object('registration_id', v_reg.id, 'status', 'confirmed', 'changed', false);
  end if;

  -- PIECE 4 HOOK. This is the single place a registration becomes confirmed,
  -- so it is the single place payment will gate. When fees arrive the
  -- condition to add is: if the season charges and v_reg.payment_status is not
  -- 'paid', refuse -- and the Stripe webhook calls this function rather than
  -- writing status itself.

  select * into v_season from public.seasons s where s.id = v_reg.season_id for update;

  select count(*) into v_confirmed
    from public.registrations r
   where r.season_id = v_reg.season_id and r.status = 'confirmed';

  if v_season.capacity is not null and v_confirmed >= v_season.capacity then
    raise exception 'confirm_registration: % is full at % -- raise the cap first',
      v_season.name, v_season.capacity using errcode = '23514';
  end if;

  update public.registrations set status = 'confirmed' where id = v_reg.id;

  insert into public.program_members (program_id, person_id, role, season_id)
  values (v_reg.program_id, v_reg.person_id, 'player', v_reg.season_id)
  on conflict do nothing;

  return jsonb_build_object('registration_id', v_reg.id, 'status', 'confirmed', 'changed', true);
end;
$$;

create or replace function public.withdraw_registration(p_registration_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reg public.registrations%rowtype;
begin
  select * into v_reg from public.registrations r where r.id = p_registration_id;
  if not found then
    raise exception 'withdraw_registration: no such registration' using errcode = '22023';
  end if;

  -- Staff, or the family themselves. A parent pulling their own child out
  -- should not need to phone anybody.
  if not (
    public.manages_person(v_reg.person_id)
    or public.staffs_org(v_reg.organization_id)
    or public.is_guardian_of_person(v_reg.person_id)
    or v_reg.submitted_by = (select auth.uid())
  ) then
    raise exception 'withdraw_registration: not permitted' using errcode = '42501';
  end if;

  update public.registrations set status = 'withdrawn' where id = v_reg.id;

  -- The roster spot goes with it, which is what frees the place for whoever is
  -- waiting. Only this season's spot: a child on last season's roster stays in
  -- last season's history.
  delete from public.program_members
   where program_id = v_reg.program_id
     and person_id  = v_reg.person_id
     and season_id  = v_reg.season_id;

  return jsonb_build_object('registration_id', v_reg.id, 'status', 'withdrawn');
end;
$$;

revoke all on function public.confirm_registration(uuid)  from public;
revoke all on function public.confirm_registration(uuid)  from anon;
grant execute on function public.confirm_registration(uuid) to authenticated;
revoke all on function public.withdraw_registration(uuid) from public;
revoke all on function public.withdraw_registration(uuid) from anon;
grant execute on function public.withdraw_registration(uuid) to authenticated;

-- ============================================================================
-- 10. Row Level Security
-- ============================================================================

alter table public.season_questions      enable row level security;
alter table public.registrations         enable row level security;
alter table public.registration_answers  enable row level security;

grant select, insert, update, delete on public.season_questions     to authenticated;
grant select                         on public.registrations        to authenticated;
grant select                         on public.registration_answers to authenticated;

-- -------------------------------------------------------- season_questions --

-- Anyone in the program may read the questions; the public form reads them
-- through public_season_info() instead and needs no policy here.
drop policy if exists season_questions_select on public.season_questions;
create policy season_questions_select
  on public.season_questions
  for select
  to authenticated
  using (public.can_see_season(season_id));

-- Writing them is staff work, and only where registration is switched on --
-- the feature gate lives in the database, not only in the interface.
drop policy if exists season_questions_insert on public.season_questions;
create policy season_questions_insert
  on public.season_questions
  for insert
  to authenticated
  with check (
    public.manages_season(season_id)
    and public.season_registration_enabled(season_id)
  );

drop policy if exists season_questions_update on public.season_questions;
create policy season_questions_update
  on public.season_questions
  for update
  to authenticated
  using (public.manages_season(season_id) and public.season_registration_enabled(season_id))
  with check (public.manages_season(season_id) and public.season_registration_enabled(season_id));

drop policy if exists season_questions_delete on public.season_questions;
create policy season_questions_delete
  on public.season_questions
  for delete
  to authenticated
  using (public.manages_season(season_id) and public.season_registration_enabled(season_id));

-- ----------------------------------------------------------- registrations --

-- Staff over the child, the child themselves, whoever is responsible for them,
-- and whoever filled the form in. No INSERT, UPDATE or DELETE policy exists:
-- every one of those goes through a function that keeps the roster in step.
drop policy if exists registrations_select on public.registrations;
create policy registrations_select
  on public.registrations
  for select
  to authenticated
  using (
    public.manages_person(person_id)
    or public.is_guardian_of_person(person_id)
    or public.is_person_me(person_id)
    or submitted_by = (select auth.uid())
  );

-- Answers follow their registration exactly: if you may see the sign-up, you
-- may see what it said. The subquery is filtered by the policy above.
drop policy if exists registration_answers_select on public.registration_answers;
create policy registration_answers_select
  on public.registration_answers
  for select
  to authenticated
  using (
    exists (select 1 from public.registrations r where r.id = registration_id)
  );
