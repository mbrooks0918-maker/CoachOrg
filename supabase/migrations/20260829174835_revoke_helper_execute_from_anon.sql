-- Revoke EXECUTE on the RLS helper functions from the anon role.
--
-- Why this is needed
-- ------------------
-- The initial migration did `revoke all on function ... from public`, which
-- was not sufficient. Supabase's default privileges grant EXECUTE explicitly
-- to the anon, authenticated and service_role roles. A grant to PUBLIC and a
-- grant to anon are separate entries in the ACL, so revoking the former left
-- the latter intact and all eight helpers stayed callable without a session.
--
-- Impact of the gap was low -- each helper reports a fact about auth.uid(),
-- which is null for an anonymous caller, so every one returned false (or null
-- for program_role) whatever arguments it was given. Nothing leaked. But the
-- functions were reachable surface that has no reason to be public, so they
-- are closed here.
--
-- authenticated keeps its grant from the initial migration; this file only
-- removes anon.

revoke execute on function public.is_org_admin(uuid)          from anon;
revoke execute on function public.is_org_owner(uuid)          from anon;
revoke execute on function public.is_org_program_member(uuid) from anon;
revoke execute on function public.is_head_coach(uuid)         from anon;
revoke execute on function public.is_program_org_admin(uuid)  from anon;
revoke execute on function public.is_program_member(uuid)     from anon;
revoke execute on function public.is_program_staff(uuid)      from anon;
revoke execute on function public.program_role(uuid)          from anon;

-- Note: public.join_program(text, text, text) deliberately keeps its anon
-- grant. It raises errcode 28000 ('authentication required') when auth.uid()
-- is null, so an anonymous call is already rejected inside the function, and
-- leaving it granted keeps the failure a clean application error rather than
-- a privilege error.
