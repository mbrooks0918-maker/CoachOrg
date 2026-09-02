-- Seed: put the demo park on the registration plan from the start.
--
-- "Sand Mountain Park" is a demo organization built for showing the product:
-- four programs, a season each, and families signed up through the real public
-- form. It needs the registration feature from the moment it exists rather
-- than being switched on later, so a demo never shows the half-configured
-- state.
--
-- org_plans is service-role only by design -- no signed-in account may put
-- itself on a paid plan -- so this is the only way to grant it from a
-- migration. Matched on name rather than id, so it is a no-op on any database
-- without that demo organization, including a fresh one.

insert into public.org_plans (organization_id, plan, note)
select o.id, 'registration', 'Demo park for showing registration end to end'
  from public.organizations o
 where o.name = 'Sand Mountain Park'
on conflict (organization_id) do update set plan = 'registration';
