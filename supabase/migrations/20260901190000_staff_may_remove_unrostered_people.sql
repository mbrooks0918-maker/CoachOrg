-- Let staff clean up a person nobody is using.
--
-- people_delete admitted only the owner and the ADs, on the reasoning that
-- deleting a person erases their history across every season. That reasoning
-- holds for somebody who has played -- and not at all for the case this piece
-- creates: a sign-up typed wrong, or the losing half of a duplicate review,
-- sitting in the organization with no roster spot anywhere. Staff could create
-- those and not remove them.
--
-- So the exception is drawn exactly around "has no history": a person on no
-- roster, in any program, in any season. The moment they are placed on a team
-- they fall back under owner-and-AD protection.

create or replace function public.person_has_roster(p_person_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.program_members m where m.person_id = p_person_id
  );
$$;

revoke all     on function public.person_has_roster(uuid) from public;
revoke execute on function public.person_has_roster(uuid) from anon;
grant  execute on function public.person_has_roster(uuid) to authenticated;

drop policy if exists people_delete on public.people;
create policy people_delete
  on public.people
  for delete
  to authenticated
  using (
    public.is_org_owner(organization_id)
    or public.is_org_admin(organization_id)
    or (
      public.staffs_org(organization_id)
      and not public.person_has_roster(id)
    )
  );
