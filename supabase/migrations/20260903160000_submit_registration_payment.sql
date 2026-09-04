-- submit_registration(): a season that charges does not confirm on submission.
--
-- The only behavioural change for every season that exists today is none:
-- fee_cents defaults to null, so a free season still confirms on the spot,
-- still waitlists when full, and still refuses an out-of-bracket child before
-- creating anybody. Everything below only engages once somebody sets a fee.
--
-- Three rules arrive with fees:
--
-- 1. A paid registration is 'pending_payment' and is NOT on the roster. The
--    child has a place held for them and nothing more until the money lands.
-- 2. A place being paid for still counts against capacity. Counting only the
--    confirmed ones would let two families buy the same last place.
-- 3. A waitlisted child is not charged. Nobody should pay to queue. If a place
--    frees up, confirm_registration refuses until it has been paid for, which
--    is where the "send them a payment link" step will hook in once there is a
--    processor to send one from.
--
-- And one refusal: a season cannot charge if its organization has not finished
-- connecting a payment account. Taking a fee with nowhere to put it would be
-- worse than not taking it.

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
  v_fee        integer;
  v_pays       boolean;
  v_taken      integer;
  v_status     text;
  v_payment    text;
  v_amount     integer;
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

  v_fee := coalesce(v_season.fee_cents, 0);
  v_pays := v_fee > 0;

  if v_pays and not public.org_can_take_payments(v_org) then
    raise exception 'submit_registration: % charges a fee but has not finished setting up payments -- ask the organizer',
      v_season.name using errcode = '22023';
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
  else
    select p.id into v_child
      from public.people p
      join public.guardians g on g.person_id = p.id and g.guardian_user_id = v_uid
      left join public.person_details d on d.person_id = p.id
     where p.organization_id = v_org
       and p.match_key = lower(btrim(regexp_replace(coalesce(p_child_name, ''), '\s+', ' ', 'g')))
       and d.birthdate is not distinct from v_birthdate
     limit 1;
  end if;

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
    v_child := public.person_create_guarded(
      v_org, p_child_name, v_birthdate, null,
      p_emergency_contact_name, p_emergency_contact_phone, p_medical_notes
    );
  end if;

  if exists (
    select 1 from public.registrations r
     where r.season_id = v_season.id and r.person_id = v_child and r.status <> 'withdrawn'
  ) then
    raise exception 'submit_registration: % is already signed up for %',
      (select p.full_name from public.people p where p.id = v_child), v_season.name
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

  -- ---- confirmed, owing money, or waitlisted ------------------------------
  select count(*) into v_taken
    from public.registrations r
   where r.season_id = v_season.id
     and r.status in ('confirmed', 'pending_payment');

  if v_season.capacity is not null and v_taken >= v_season.capacity then
    v_status  := 'waitlisted';
    v_payment := 'not_required';
    v_amount  := null;
  elsif v_pays then
    v_status  := 'pending_payment';
    v_payment := 'pending';
    v_amount  := v_fee;
  else
    v_status  := 'confirmed';
    v_payment := 'not_required';
    v_amount  := null;
  end if;

  insert into public.registrations (
    organization_id, program_id, season_id, person_id, submitted_by,
    status, payment_status, amount_cents
  )
  values (
    v_org, v_program.id, v_season.id, v_child, v_uid,
    v_status, v_payment, v_amount
  )
  returning id into v_reg;

  insert into public.registration_answers (registration_id, question_id, answer)
  select v_reg, q.id, btrim(p_answers ->> q.id::text)
    from public.season_questions q
   where q.season_id = v_season.id
     and nullif(btrim(coalesce(p_answers ->> q.id::text, '')), '') is not null;

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

  -- Only a confirmed registration is on the roster. A child part-way through
  -- paying is not on the team yet, and a coach planning around them would be
  -- planning around a payment that may never arrive.
  if v_status = 'confirmed' then
    insert into public.program_members (program_id, person_id, role, season_id)
    values (v_program.id, v_child, 'player', v_season.id)
    on conflict do nothing;
  elsif v_status = 'waitlisted' then
    select count(*) + 1 into v_rank
      from public.registrations r
     where r.season_id = v_season.id and r.status = 'waitlisted' and r.id <> v_reg;
  end if;

  return jsonb_build_object(
    'registration_id',  v_reg,
    'status',           v_status,
    'waitlist_rank',    v_rank,
    'child_name',       (select p.full_name from public.people p where p.id = v_child),
    'season_name',      v_season.name,
    'program_name',     v_program.name,
    'program_id',       v_program.id,
    -- What the client needs to start a checkout, once there is one to start.
    'requires_payment', v_status = 'pending_payment',
    'amount_cents',     v_amount,
    'currency',         v_season.currency
  );
end;
$$;
