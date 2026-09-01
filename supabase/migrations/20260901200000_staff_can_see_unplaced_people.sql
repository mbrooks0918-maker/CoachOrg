-- Staff can see a person they registered but have not placed on a team yet.
--
-- Second finding from the permission audit. register_person() succeeded, filed
-- its duplicate review, and returned an id -- and then the staff member who
-- called it could read neither the person nor the review, because
-- manages_person() only recognised somebody already sitting on a roster of a
-- program that person manages. A newly registered child sits on no roster by
-- definition, so the duplicate-review workflow was invisible to the only
-- people who could resolve it.
--
-- The fix is drawn as narrowly as the equivalent one on people_delete: org
-- staff reach a person who is on NO roster anywhere. That is the unplaced
-- registration and nothing else. The moment the child is placed on a team,
-- ordinary rules resume and a coach sees only their own team again -- this
-- does not become a way for the coach of one team to read the medical notes of
-- a child on another.

create or replace function public.manages_person(p_person_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.people p
     where p.id = p_person_id
       and (public.is_org_owner(p.organization_id) or public.is_org_admin(p.organization_id))
  )
  or exists (
    select 1 from public.program_members m
     where m.person_id = p_person_id
       and public.manages_program(m.program_id)
  )
  or exists (
    select 1 from public.people p
     where p.id = p_person_id
       and public.staffs_org(p.organization_id)
       and not public.person_has_roster(p_person_id)
  );
$$;
