-- claim_person(): ROW_COUNT is a count, not a flag.
--
-- The previous definition did `get diagnostics v_created = row_count` into a
-- boolean, which PL/pgSQL refuses at runtime -- there is no cast from bigint to
-- boolean. Caught before the function was ever called. Same logic, correct
-- types: read the count, then decide.

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
  v_rows      integer := 0;
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

  if not exists (select 1 from public.program_members m where m.person_id = v_person.id) then
    raise exception 'claim_person: % is not on a team yet -- ask your coach to add them first',
      v_person.full_name using errcode = '23514';
  end if;

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

  get diagnostics v_rows = row_count;
  v_created := v_rows > 0;

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
