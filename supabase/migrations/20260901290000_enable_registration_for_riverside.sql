-- Seed: switch the sample recreation centre onto the registration plan.
--
-- Registration is gated on org_plans, which nothing but the service role may
-- write -- so without this there is no organization anywhere that can reach
-- the feature, and no way to try it or test the gate. "Riverside Recreation
-- Center" is sample data created alongside this piece, deliberately separate
-- from Albertville High School so that one organization has the feature and
-- one does not.
--
-- Matched on name rather than id so this is a no-op on any database that does
-- not have that sample organization, including a fresh one. Delete the sample
-- org and this row goes with it.

insert into public.org_plans (organization_id, plan, note)
select o.id, 'registration', 'Sample rec centre for trying registration'
  from public.organizations o
 where o.name = 'Riverside Recreation Center'
on conflict (organization_id) do update set plan = 'registration';
