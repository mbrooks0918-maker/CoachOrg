-- Piece 4, part one: the money rules, with no processor attached yet.
--
-- Everything here is what has to be true whichever payment company is on the
-- other end, and all of it is testable without one: a season can charge, an
-- organization can be connected or not, and a registration that owes money is
-- not on the roster until that money has actually arrived.
--
-- The Stripe half -- onboarding links, Checkout, the webhook -- is NOT in this
-- migration. It cannot be written honestly yet: there is no Stripe account
-- behind this project and no test keys, so none of it could be run even once.
-- Payment code that has never executed is the one thing we agreed not to ship,
-- so the rules land first and the plumbing follows when there are keys to
-- test it against.
--
-- The processor is a column rather than an assumption. Stripe is the decision
-- and nothing here reaches for anything else, but "which company took this
-- money" is a fact about a payment, not a constant, and a schema that cannot
-- express it has to be migrated rather than configured if that ever changes.

-- ============================================================================
-- 1. An organization's payment account
-- ============================================================================

create table if not exists public.org_payment_accounts (
  organization_id   uuid        primary key references public.organizations (id) on delete cascade,
  processor         text        not null default 'stripe' check (processor in ('stripe')),
  -- The processor's own id for the account, e.g. Stripe's acct_...
  external_id       text,

  -- Mirrored from the processor, never inferred from "they clicked the button".
  -- An organization can finish onboarding and still be unable to take money,
  -- which is why these are three separate facts rather than one boolean.
  charges_enabled   boolean     not null default false,
  payouts_enabled   boolean     not null default false,
  details_submitted boolean     not null default false,
  -- Whose money is real. Guards against a test-mode account quietly being
  -- treated as live, which is the expensive direction to get wrong.
  livemode          boolean     not null default false,
  -- Whatever the processor said was outstanding, kept verbatim for display.
  requirements      jsonb,

  last_checked_at   timestamptz,
  connected_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table public.org_payment_accounts is
  'An organization''s connected payment account. Status is mirrored from the processor, not assumed from onboarding having been started.';

-- Status as a question about the processor's answers rather than a column that
-- can disagree with them.
create or replace function public.org_payment_status(p_organization_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
           when a.organization_id is null            then 'not_connected'
           when a.charges_enabled and a.payouts_enabled then 'ready'
           when a.charges_enabled                    then 'charges_only'
           when a.external_id is not null            then 'pending'
           else 'not_connected'
         end
    from public.organizations o
    left join public.org_payment_accounts a on a.organization_id = o.id
   where o.id = p_organization_id;
$$;

-- "Can this organization actually be paid?" The only question the sign-up flow
-- needs, and deliberately stricter than "has an account": an account that
-- cannot take charges is not a way to collect a registration fee.
create or replace function public.org_can_take_payments(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select a.charges_enabled
      from public.org_payment_accounts a
     where a.organization_id = p_organization_id
  ), false);
$$;

revoke all     on function public.org_payment_status(uuid)     from public;
revoke execute on function public.org_payment_status(uuid)     from anon;
grant  execute on function public.org_payment_status(uuid)     to authenticated;
revoke all     on function public.org_can_take_payments(uuid)  from public;
revoke execute on function public.org_can_take_payments(uuid)  from anon;
grant  execute on function public.org_can_take_payments(uuid)  to authenticated;

-- ============================================================================
-- 2. A season can charge
-- ============================================================================

alter table public.seasons
  add column if not exists fee_cents integer check (fee_cents is null or fee_cents >= 0),
  add column if not exists currency  text not null default 'usd';

comment on column public.seasons.fee_cents is
  'Null or zero means free. Minor units, so 7500 is $75.00 -- never a float, because money in a float is a rounding error waiting to be somebody''s place on a team.';

alter table public.registrations
  add column if not exists amount_cents integer check (amount_cents is null or amount_cents >= 0),
  add column if not exists processor    text check (processor is null or processor in ('stripe')),
  -- The processor's reference for this payment, kept so a row on a bank
  -- statement can be traced back to a child on a roster.
  add column if not exists payment_ref  text,
  add column if not exists paid_at      timestamptz;

create index if not exists registrations_payment_ref_idx
  on public.registrations (payment_ref) where payment_ref is not null;

-- ============================================================================
-- 3. Placing somebody on the roster
--
-- The effect of confirming, split away from the permission check that guards
-- it, so the two callers can each bring their own authority: a staff member
-- promoting from the waiting list, and the webhook, which has no session at
-- all and must not be made to fake one. Same pattern as person_create_guarded.
--
-- EXECUTE is revoked from every client role: reachable only from inside
-- another definer function.
-- ============================================================================

create or replace function public.registration_place_on_roster(p_registration_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reg public.registrations%rowtype;
begin
  select * into v_reg from public.registrations r where r.id = p_registration_id;

  update public.registrations set status = 'confirmed' where id = v_reg.id;

  insert into public.program_members (program_id, person_id, role, season_id)
  values (v_reg.program_id, v_reg.person_id, 'player', v_reg.season_id)
  on conflict do nothing;
end;
$$;

revoke all on function public.registration_place_on_roster(uuid) from public;
revoke all on function public.registration_place_on_roster(uuid) from anon;
revoke all on function public.registration_place_on_roster(uuid) from authenticated;

-- ============================================================================
-- 4. confirm_registration(), now gated on payment
--
-- This was written in piece three as the single place a registration becomes
-- confirmed, precisely so that payment would have one place to gate. This is
-- that condition arriving.
-- ============================================================================

create or replace function public.confirm_registration(p_registration_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reg    public.registrations%rowtype;
  v_season public.seasons%rowtype;
  v_taken  integer;
begin
  select * into v_reg from public.registrations r where r.id = p_registration_id;
  if not found then
    raise exception 'confirm_registration: no such registration' using errcode = '22023';
  end if;

  if not (public.manages_person(v_reg.person_id) or public.staffs_org(v_reg.organization_id)) then
    raise exception 'confirm_registration: not permitted' using errcode = '42501';
  end if;

  if v_reg.status = 'confirmed' then
    return jsonb_build_object('registration_id', v_reg.id, 'status', 'confirmed', 'changed', false);
  end if;

  select * into v_season from public.seasons s where s.id = v_reg.season_id for update;

  -- The gate. A place on a paid team is not staff's to give away before the
  -- family has paid for it, however well meant.
  if coalesce(v_season.fee_cents, 0) > 0 and v_reg.payment_status <> 'paid' then
    raise exception 'confirm_registration: % has not been paid for yet', v_season.name
      using errcode = '42501';
  end if;

  -- Anything holding a place counts, including registrations part-way through
  -- paying. Counting only the confirmed ones would sell the same place twice.
  select count(*) into v_taken
    from public.registrations r
   where r.season_id = v_reg.season_id
     and r.status in ('confirmed', 'pending_payment');

  if v_season.capacity is not null and v_taken >= v_season.capacity then
    raise exception 'confirm_registration: % is full at % -- raise the cap first',
      v_season.name, v_season.capacity using errcode = '23514';
  end if;

  perform public.registration_place_on_roster(v_reg.id);

  return jsonb_build_object('registration_id', v_reg.id, 'status', 'confirmed', 'changed', true);
end;
$$;

revoke all on function public.confirm_registration(uuid) from public;
revoke all on function public.confirm_registration(uuid) from anon;
grant execute on function public.confirm_registration(uuid) to authenticated;

-- ============================================================================
-- 5. mark_registration_paid() -- the webhook's door
--
-- Called by the payment webhook with the service key and by nothing else:
-- EXECUTE is revoked from anon and authenticated, so no browser can claim a
-- registration has been paid for. It records the payment and places the child
-- on the roster in one transaction, because a payment that took the money and
-- did not give the place is the worst outcome available.
--
-- Idempotent. Processors retry webhooks, and they are entitled to.
-- ============================================================================

create or replace function public.mark_registration_paid(
  p_registration_id uuid,
  p_processor       text,
  p_payment_ref     text,
  p_amount_cents    integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reg public.registrations%rowtype;
begin
  select * into v_reg from public.registrations r where r.id = p_registration_id for update;
  if not found then
    raise exception 'mark_registration_paid: no such registration' using errcode = '22023';
  end if;

  if v_reg.payment_status = 'paid' then
    return jsonb_build_object('registration_id', v_reg.id, 'status', v_reg.status, 'changed', false);
  end if;

  update public.registrations
     set payment_status = 'paid',
         paid_at        = now(),
         processor      = p_processor,
         payment_ref    = p_payment_ref,
         amount_cents   = coalesce(p_amount_cents, amount_cents)
   where id = v_reg.id;

  -- A withdrawn registration that somehow gets paid is recorded as paid and
  -- left withdrawn: putting somebody back on a roster they left, because a
  -- retried webhook arrived, would be worse than a refund conversation.
  if v_reg.status = 'pending_payment' then
    perform public.registration_place_on_roster(v_reg.id);
    return jsonb_build_object('registration_id', v_reg.id, 'status', 'confirmed', 'changed', true);
  end if;

  return jsonb_build_object('registration_id', v_reg.id, 'status', v_reg.status, 'changed', true);
end;
$$;

revoke all on function public.mark_registration_paid(uuid, text, text, integer) from public;
revoke all on function public.mark_registration_paid(uuid, text, text, integer) from anon;
revoke all on function public.mark_registration_paid(uuid, text, text, integer) from authenticated;

-- ============================================================================
-- 6. Row Level Security
-- ============================================================================

alter table public.org_payment_accounts enable row level security;

grant select on public.org_payment_accounts to authenticated;

-- Readable by whoever runs the organization; written only by the service role,
-- because every field on it is the processor's answer and not ours to invent.
drop policy if exists org_payment_accounts_select on public.org_payment_accounts;
create policy org_payment_accounts_select
  on public.org_payment_accounts
  for select
  to authenticated
  using (public.is_org_leader(organization_id));
