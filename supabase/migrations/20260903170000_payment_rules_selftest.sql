-- A simulated connected account for the scratch organization, and a self-test
-- of the money rules.
--
-- Two things are going on here.
--
-- First, "Riverside Recreation Center" gets an org_payment_accounts row
-- standing in for a test-mode Stripe account. Nothing but the service role may
-- write that table -- every field on it is the processor's answer, not ours --
-- so a fixture has to arrive this way. livemode is false, which is the whole
-- point: it is exactly what a real test-mode account would look like, and the
-- column exists so a test account can never be mistaken for a live one.
--
-- Second, mark_registration_paid() is the webhook's door and EXECUTE is
-- revoked from anon and authenticated, so no browser can assert that money
-- arrived. That is correct, and it means the function cannot be exercised from
-- a signed-in test at all. Rather than loosen the grant to test it -- a grant
-- that would then have to be remembered and removed -- the test runs here,
-- where the migration role can call it, and asserts its way through. A failed
-- assertion fails the migration and rolls the whole thing back.
--
-- The fixture rows this test creates are deleted before it finishes. Matched
-- on organization name, so all of it is a no-op on a database without that
-- scratch organization, including a fresh one.

insert into public.org_payment_accounts (
  organization_id, processor, external_id,
  charges_enabled, payouts_enabled, details_submitted, livemode, connected_at
)
select o.id, 'stripe', 'acct_SIMULATED_TEST_ONLY', true, true, true, false, now()
  from public.organizations o
 where o.name = 'Riverside Recreation Center'
on conflict (organization_id) do update
   set charges_enabled = true, payouts_enabled = true, details_submitted = true,
       livemode = false, last_checked_at = now();

do $selftest$
declare
  v_org     uuid;
  v_program uuid;
  v_season  uuid;
  v_person  uuid;
  v_reg     uuid;
  v_row     public.registrations%rowtype;
  v_result  jsonb;
  v_rostered integer;
begin
  select o.id into v_org from public.organizations o
   where o.name = 'Riverside Recreation Center';
  if v_org is null then
    raise notice 'payment self-test: scratch organization absent, skipping';
    return;
  end if;

  select p.id into v_program from public.programs p
   where p.organization_id = v_org order by p.created_at limit 1;

  -- ---- an organization that is connected can charge ----------------------
  if not public.org_can_take_payments(v_org) then
    raise exception 'self-test: a connected account should be able to take payments';
  end if;
  if public.org_payment_status(v_org) <> 'ready' then
    raise exception 'self-test: expected status ready, got %', public.org_payment_status(v_org);
  end if;

  -- ---- a paid season, one place --------------------------------------------
  insert into public.seasons (
    program_id, name, registration_opens_at, registration_closes_at,
    capacity, fee_cents, currency
  )
  values (
    v_program, 'PAYMENT SELF TEST', now() - interval '1 day', now() + interval '1 day',
    1, 7500, 'usd'
  )
  returning id into v_season;

  v_person := public.person_create_guarded(v_org, 'Selftest Child', '2016-05-05');

  -- ---- a registration that owes money is not on the roster ----------------
  insert into public.registrations (
    organization_id, program_id, season_id, person_id,
    status, payment_status, amount_cents
  )
  values (v_org, v_program, v_season, v_person, 'pending_payment', 'pending', 7500)
  returning id into v_reg;

  select count(*) into v_rostered from public.program_members m
   where m.season_id = v_season and m.person_id = v_person;
  if v_rostered <> 0 then
    raise exception 'self-test: an unpaid registration must not be on the roster';
  end if;

  -- ---- the webhook pays it -------------------------------------------------
  v_result := public.mark_registration_paid(v_reg, 'stripe', 'pi_selftest_123', 7500);

  select * into v_row from public.registrations where id = v_reg;
  if v_row.payment_status <> 'paid' then
    raise exception 'self-test: expected paid, got %', v_row.payment_status;
  end if;
  if v_row.status <> 'confirmed' then
    raise exception 'self-test: paying should confirm, got %', v_row.status;
  end if;
  if v_row.paid_at is null or v_row.payment_ref <> 'pi_selftest_123' then
    raise exception 'self-test: the payment reference should be recorded';
  end if;

  select count(*) into v_rostered from public.program_members m
   where m.season_id = v_season and m.person_id = v_person;
  if v_rostered <> 1 then
    raise exception 'self-test: paying should place the child on the roster';
  end if;

  -- ---- retried webhooks are harmless --------------------------------------
  v_result := public.mark_registration_paid(v_reg, 'stripe', 'pi_selftest_123', 7500);
  if (v_result ->> 'changed')::boolean then
    raise exception 'self-test: a repeated webhook should change nothing';
  end if;

  select count(*) into v_rostered from public.program_members m
   where m.season_id = v_season and m.person_id = v_person;
  if v_rostered <> 1 then
    raise exception 'self-test: a repeated webhook must not duplicate the roster row';
  end if;

  -- ---- a withdrawn registration is not resurrected by a late webhook ------
  update public.registrations set status = 'withdrawn', payment_status = 'pending' where id = v_reg;
  delete from public.program_members where season_id = v_season and person_id = v_person;
  v_result := public.mark_registration_paid(v_reg, 'stripe', 'pi_selftest_456', 7500);
  select * into v_row from public.registrations where id = v_reg;
  if v_row.status <> 'withdrawn' then
    raise exception 'self-test: a late payment must not undo a withdrawal';
  end if;
  select count(*) into v_rostered from public.program_members m
   where m.season_id = v_season and m.person_id = v_person;
  if v_rostered <> 0 then
    raise exception 'self-test: a late payment must not re-roster a withdrawal';
  end if;

  -- ---- clean up -----------------------------------------------------------
  delete from public.registrations where id = v_reg;
  delete from public.program_members where season_id = v_season;
  delete from public.seasons where id = v_season;
  delete from public.people where id = v_person;

  raise notice 'payment self-test: all assertions passed';
end
$selftest$;
