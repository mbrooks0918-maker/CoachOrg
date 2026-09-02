-- An organization-level view, for the people who run the organization.
--
-- Everything in CoachOrg so far is scoped to one program: the shell loads a
-- program, the navigation is that program's sections, and every policy asks a
-- question about a program. That is right for a coach. It is not enough for
-- the person who runs a park with four of them and wants one number.
--
-- The role distinction this gates on already existed and is not invented here:
--
--   is_org_owner()   -- organizations.created_by, the person who set it up
--   is_org_admin()   -- a row in org_admins, the "athletic director" concept
--   manages_program()-- head coach, assistant coach or team manager of ONE team
--
-- The first two are organization-wide and the third is not, which is exactly
-- the line this page needs. is_org_leader() just names the pair so a policy or
-- a function can ask for it in one call instead of remembering both halves.
--
-- Worth knowing about the gap between them: is_program_org_admin(), which
-- several existing policies use to grant organization-wide read, checks
-- org_admins ONLY -- not created_by. So an owner who never joined one of their
-- own programs cannot read that program's events or equipment through the
-- normal policies. Nobody is in that position today, because creating an
-- organization also makes you head coach of its first program, and org_admins
-- is empty everywhere. This migration deliberately does NOT widen that: doing
-- so would change who can read events and equipment across every organization,
-- which is a decision to take on purpose rather than as a side effect of
-- adding a dashboard. org_overview() sidesteps it by running as definer and
-- checking is_org_leader() itself.

create or replace function public.is_org_leader(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_org_owner(p_organization_id)
      or public.is_org_admin(p_organization_id);
$$;

revoke all     on function public.is_org_leader(uuid) from public;
revoke execute on function public.is_org_leader(uuid) from anon;
grant  execute on function public.is_org_leader(uuid) to authenticated;

-- ============================================================================
-- org_overview()
--
-- One round trip for a screen that would otherwise be a dozen, and one place
-- the permission is checked. Definer, so it can read across every program in
-- the organization without depending on the caller holding a membership in
-- each -- which is the whole point of an organization-level view.
-- ============================================================================

create or replace function public.org_overview(p_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org public.organizations%rowtype;
begin
  if not public.is_org_leader(p_organization_id) then
    raise exception 'org_overview: not permitted for this organization'
      using errcode = '42501';
  end if;

  select * into v_org from public.organizations o where o.id = p_organization_id;
  if not found then
    raise exception 'org_overview: no such organization' using errcode = '22023';
  end if;

  return jsonb_build_object(
    'organization', jsonb_build_object('id', v_org.id, 'name', v_org.name),

    -- 'children' counts a person once however many sports they play;
    -- 'signups' counts every sign-up. The pair is the multi-sport story: at
    -- the park in the demo data it reads twelve children, twenty sign-ups.
    'totals', jsonb_build_object(
      'programs',   (select count(*) from public.programs pr
                      where pr.organization_id = p_organization_id),
      'children',   (select count(distinct r.person_id) from public.registrations r
                      where r.organization_id = p_organization_id and r.status <> 'withdrawn'),
      'signups',    (select count(*) from public.registrations r
                      where r.organization_id = p_organization_id and r.status <> 'withdrawn'),
      'confirmed',  (select count(*) from public.registrations r
                      where r.organization_id = p_organization_id and r.status = 'confirmed'),
      'waitlisted', (select count(*) from public.registrations r
                      where r.organization_id = p_organization_id and r.status = 'waitlisted'),
      'families',   (select count(distinct g.guardian_user_id) from public.guardians g
                      where g.organization_id = p_organization_id)
    ),

    'programs', coalesce((
      select jsonb_agg(q.row order by q.nm)
        from (
          select pr.name as nm,
                 jsonb_build_object(
                   'id',    pr.id,
                   'name',  pr.name,
                   'sport', pr.sport,
                   'players', (select count(*) from public.program_members m
                                where m.program_id = pr.id and m.role = 'player'),
                   'confirmed', (select count(*) from public.registrations r
                                  where r.program_id = pr.id and r.status = 'confirmed'),
                   'waitlisted', (select count(*) from public.registrations r
                                   where r.program_id = pr.id and r.status = 'waitlisted'),
                   'season', (
                     select jsonb_build_object(
                              'name', s.name,
                              'capacity', s.capacity,
                              'spots_remaining',
                                case when s.capacity is null then null
                                     else greatest(s.capacity - (
                                       select count(*) from public.registrations r2
                                        where r2.season_id = s.id and r2.status = 'confirmed'), 0)
                                end,
                              'closes_at', s.registration_closes_at,
                              'open_now', s.registration_opens_at is not null
                                          and s.registration_closes_at is not null
                                          and now() between s.registration_opens_at
                                                        and s.registration_closes_at,
                              'public_token', s.public_token
                            )
                       from public.seasons s
                      where s.program_id = pr.id
                      order by s.starts_on desc nulls last, s.created_at desc
                      limit 1
                   )
                 ) as row
            from public.programs pr
           where pr.organization_id = p_organization_id
        ) q
    ), '[]'::jsonb),

    -- Every program's fixtures on one list, which is the thing a park director
    -- cannot get anywhere else in the app.
    'upcoming_events', coalesce((
      select jsonb_agg(q.row order by q.ord)
        from (
          select e.starts_at as ord,
                 jsonb_build_object(
                   'id', e.id, 'program_id', e.program_id, 'program_name', pr.name,
                   'name', e.name, 'starts_at', e.starts_at,
                   'location', e.location, 'opponent', e.opponent
                 ) as row
            from public.events e
            join public.programs pr on pr.id = e.program_id
           where pr.organization_id = p_organization_id
             and e.starts_at >= now()
           order by e.starts_at
           limit 20
        ) q
    ), '[]'::jsonb),

    'equipment', jsonb_build_object(
      'items', (select count(*) from public.equipment_items i
                 join public.programs pr on pr.id = i.program_id
                where pr.organization_id = p_organization_id),
      'total_quantity', (select coalesce(sum(i.total_quantity), 0) from public.equipment_items i
                          join public.programs pr on pr.id = i.program_id
                         where pr.organization_id = p_organization_id),
      'checked_out', (select coalesce(sum(co.quantity), 0)
                        from public.equipment_checkouts co
                        join public.equipment_items i on i.id = co.equipment_item_id
                        join public.programs pr on pr.id = i.program_id
                       where pr.organization_id = p_organization_id
                         and co.returned_at is null)
    )
  );
end;
$$;

revoke all     on function public.org_overview(uuid) from public;
revoke execute on function public.org_overview(uuid) from anon;
grant  execute on function public.org_overview(uuid) to authenticated;
