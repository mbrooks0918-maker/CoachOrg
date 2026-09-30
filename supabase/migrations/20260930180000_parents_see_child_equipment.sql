-- ============================================================================
-- A parent can see the gear their child is holding.
--
-- The equipment page answered "what is checked out to your member row", which
-- for a parent is almost always nothing. The question a parent actually has is
-- what their family owes the club -- they are the one who finds the flag belts
-- in the boot of the car on Sunday night and has to bring them back.
--
-- Read only. Handing gear out and taking it back stay staff acts, untouched
-- below: a parent still cannot check something out, and still cannot mark it
-- returned, because "who still has a helmet" must not be clearable by the
-- household holding it.
-- ============================================================================

-- The item side of the same question. has_equipment_claim() answers "am I
-- holding this", which is what lets a player read the name of their own
-- helmet without opening the cupboard; this is the guardian's version of it.
-- Definer for the same reason: it must not be filtered by the checkout policy
-- it exists to inform.
--
-- is_guardian_of() scopes to (select auth.uid()) internally, so this can only
-- ever answer for the caller's own children.
create or replace function public.guards_equipment_claim(p_item_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.equipment_checkouts c
     where c.equipment_item_id = p_item_id
       and public.is_guardian_of(c.member_id)
  );
$$;

revoke all     on function public.guards_equipment_claim(uuid) from public;
revoke execute on function public.guards_equipment_claim(uuid) from anon;
grant  execute on function public.guards_equipment_claim(uuid) to authenticated;

-- Checkouts: staff see everything, a member sees their own, and now a
-- guardian sees their children's. Nothing else widens -- another family's
-- rows still fail every branch.
drop policy if exists equipment_checkouts_select on public.equipment_checkouts;
create policy equipment_checkouts_select on public.equipment_checkouts for select to authenticated
  using (
    public.manages_program(program_id)
    or public.is_program_org_admin(program_id)
    or public.owns_member_row(member_id)
    or public.is_guardian_of(member_id)
  );

-- Items: a parent may read the name of a thing their child is holding, and
-- nothing more of the inventory. Browsing what the program owns is still
-- staff-only.
drop policy if exists equipment_items_select on public.equipment_items;
create policy equipment_items_select on public.equipment_items for select to authenticated
  using (
    public.manages_program(program_id)
    or public.is_program_org_admin(program_id)
    or public.has_equipment_claim(id)
    or public.guards_equipment_claim(id)
  );
