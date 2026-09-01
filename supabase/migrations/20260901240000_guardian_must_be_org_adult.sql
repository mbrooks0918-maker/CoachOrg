-- A guardian must be an adult member of the organization.
--
-- The previous migration widened the guardian-side rule so an assistant coach
-- could be recorded as the guardian of their own child -- a case youth sport is
-- full of, and one the 'must hold role parent' rule refused. But it asked the
-- question the wrong way round: it tested whether THE CALLER was staff over the
-- child, not whether the person being named as guardian was anybody at all.
--
-- Since only staff over a child can insert a guardian row, that meant a coach
-- could name an arbitrary account -- anyone at all, in no program, in no
-- organization -- as a child's guardian, handing a stranger that child's
-- birthdate, emergency contact and medical notes. Caught while writing the
-- audit for this piece, before anything shipped.
--
-- The rule wanted is simply: a guardian is an adult who belongs to this
-- organization. Any role except player. That admits the coach-parent, keeps
-- out the player claiming a team-mate, and keeps out everybody who is not here
-- at all.

create or replace function public.guardians_validate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_person public.people%rowtype;
begin
  select * into v_person from public.people p where p.id = new.person_id;

  if v_person.id is null then
    raise exception 'guardians: no such person' using errcode = '23503';
  end if;

  if v_person.organization_id <> new.organization_id then
    raise exception 'guardians: that person belongs to another organization'
      using errcode = '23514';
  end if;

  if v_person.user_id is not null and v_person.user_id = new.guardian_user_id then
    raise exception 'guardians: a person cannot be their own guardian'
      using errcode = '23514';
  end if;

  -- The child side: somebody who coaches or manages cannot be claimed as a
  -- child, which would hand the claimant their private details.
  if exists (
    select 1
      from public.program_members m
      join public.programs pr on pr.id = m.program_id
     where m.person_id = new.person_id
       and pr.organization_id = new.organization_id
       and m.role <> 'player'
  ) then
    raise exception 'guardians: % holds a non-player role and cannot be claimed as a child',
      v_person.full_name using errcode = '23514';
  end if;

  -- The guardian side: an adult who belongs here. Any role but player, which
  -- covers the family member, the coach who is also a parent, and nobody else.
  if not exists (
    select 1
      from public.program_members m
      join public.programs pr on pr.id = m.program_id
     where m.user_id = new.guardian_user_id
       and pr.organization_id = new.organization_id
       and m.role <> 'player'
  ) then
    raise exception 'guardians: a guardian must be an adult member of this organization'
      using errcode = '23514';
  end if;

  return new;
end;
$$;
