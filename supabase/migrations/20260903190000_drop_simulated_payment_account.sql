-- Remove the simulated payment account fixture.
--
-- Last session there were no Stripe credentials, so a fixture row stood in for
-- a connected account to prove the money rules. Real test-mode accounts are
-- possible now, and a row claiming charges_enabled against
-- 'acct_SIMULATED_TEST_ONLY' has gone from useful to dangerous: it tells the
-- app an organization can be paid, and any checkout against it would fail at
-- Stripe with an account that does not exist.
--
-- Matched on the fake account id, so this removes the fixture and nothing else
-- -- a real connected account is never touched.

delete from public.org_payment_accounts
 where external_id = 'acct_SIMULATED_TEST_ONLY';
