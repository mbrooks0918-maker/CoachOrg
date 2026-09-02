-- A person can see the row they just inserted for themselves.
--
-- Creating an organization has been broken since people arrived, and nothing
-- caught it because create-org is the only screen that inserts a person from
-- the client and it was never run again afterwards. Building registration ran
-- the same path and hit the wall immediately.
--
-- The cause is a subtlety worth writing down. people_select identified the
-- self case as is_person_me(id), which re-queries public.people by id. It is
-- STABLE, so inside a single statement it sees the snapshot from before that
-- statement ran -- and the row being inserted is not in it. PostgREST asks for
-- the new row back (INSERT ... RETURNING), the SELECT policy is applied to it,
-- every branch re-reads a table that cannot yet see it, and the insert is
-- refused as an RLS violation.
--
-- The fix is not a new permission. "user_id = auth.uid()" is exactly what
-- is_person_me(id) computes, expressed against the row in hand instead of
-- fetched again, so it is true at the moment the row is checked. Nobody can
-- see anything they could not see a moment ago; the helper stays for every
-- other caller that passes an id rather than sitting on the row.
--
-- Staff inserting somebody ELSE and asking for the row back would still trip
-- the same snapshot problem, and deliberately is not patched here: the path
-- for that is register_person(), which runs as definer and carries the
-- duplicate guard. Adding an organization-wide branch to make a bare insert
-- work would hand every coach every person in the organization, which is a
-- real widening to fix a path nothing should be using.

drop policy if exists people_select on public.people;
create policy people_select
  on public.people
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or public.manages_person(id)
    or public.is_person_me(id)
    or public.is_guardian_of_person(id)
    or public.person_in_my_program(id)
  );

-- Diagnostics from the previous migration have served their purpose.
drop function if exists public.temp_people_policies();
