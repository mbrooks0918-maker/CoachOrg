-- ============================================================================
-- Let a Program Admin read what they manage.
--
-- manages_program() got them the WRITE half in the previous migration, because
-- every program-scoped write policy already funnels through it. The read half
-- funnels somewhere else: is_program_org_admin(), which appears in around
-- twenty select policies -- programs, program_members, events, equipment,
-- documents, announcements, seasons, scheduled_tasks, people, guardians,
-- program_codes, program_features. Every one of them means the same thing:
-- "somebody who administers this program from above it may read this."
--
-- A program group admin is exactly that, one level down, so the bridge is
-- widened once rather than twenty policies being retyped. Retyping twenty
-- security rules to add one clause each is the kind of change where a single
-- transcription slip is a permission bug, and the policies are not the thing
-- that needs to change -- the definition of "administers this from above" is.
--
-- The name now under-describes what the function does. Renaming it across
-- every policy that calls it is worth doing, and is deliberately not bundled
-- into a migration whose job is granting access.
--
-- Scope is unchanged for everyone else: is_program_group_admin() is false for
-- an ungrouped program, false for a group you do not administer, and there is
-- no group at all outside the one demo group. Albertville and Riverside are
-- untouched by construction.
-- ============================================================================

create or replace function public.is_program_org_admin(p_program_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
      from public.programs p
      join public.org_admins a on a.organization_id = p.organization_id
     where p.id = p_program_id
       and a.user_id = (select auth.uid())
  )
  or public.is_program_group_admin(p_program_id);
$$;

comment on function public.is_program_org_admin(uuid) is
  'Administers this program from above it: an org-wide athletic director, or '
  'a program group admin over the group this program belongs to. Named for '
  'the first of those because roughly twenty policies already call it.';
