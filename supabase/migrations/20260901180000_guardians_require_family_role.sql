-- A guardian must be a family member, not merely a member.
--
-- Caught by the permission audit run immediately after the people migration:
-- signed in as a player, claiming a team-mate as one's own child succeeded,
-- and the resulting link then satisfied people_update, so that player could
-- rename the other child's record. The audit renamed Jalen Carter to "Hacked"
-- to prove it. Both were reverted.
--
-- The cause was a rule lost in translation. player_guardians_validate() used
-- to require BOTH sides: the child had to hold role 'player', and the guardian
-- had to hold role 'parent'. Moving guardianship up to the organization
-- carried the first rule over and dropped the second, which left "is a member
-- of the same program" as the only thing standing between a player and another
-- family's child.
--
-- This restores the missing half. Note what it does NOT do: a family member
-- can still claim any player in a program they share, which is what the
-- family-code join flow relies on and is the behaviour that has always been
-- there. That is acceptable for a school team of six families and is not
-- acceptable for a recreation centre of four hundred; closing it belongs with
-- registration, which will create the link from the person who signed the
-- child up and make self-claiming unnecessary.

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

  -- The child side: a person who coaches or manages cannot be claimed as
  -- somebody's child, which would hand the claimant their private details.
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

  -- The guardian side, restored: only somebody who joined on the family code
  -- may be responsible for a child. A player cannot claim a team-mate.
  if not exists (
    select 1
      from public.program_members m
      join public.programs pr on pr.id = m.program_id
     where m.user_id = new.guardian_user_id
       and pr.organization_id = new.organization_id
       and m.role = 'parent'
  ) then
    raise exception 'guardians: a guardian must be a family member of this organization'
      using errcode = '23514';
  end if;

  return new;
end;
$$;
