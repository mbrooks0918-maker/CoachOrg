-- One answer for every unusable code.
--
-- redeem_code() checked whether the string was a claim code before trying it,
-- which meant an unrecognised string came back "join_program: invalid code"
-- while a real-but-expired child code came back "claim_person: invalid code".
-- Both refuse, but the prefix tells a caller which table their guess landed
-- in -- so the endpoint could be walked to discover that a code exists even
-- though it cannot be used. Small, given the codes are random, and exactly the
-- oracle join_program was written to avoid in the first place.
--
-- Restructured so there is no pre-check: try the claim path, and let anything
-- that comes back "invalid code" fall through to the team-code path, whose own
-- refusal is then the single message every failure produces. Errors that are
-- genuinely worth showing -- a name needed, a child not yet on a team -- carry
-- different codes and are re-raised untouched.
--
-- Safe to fall through: claim_person() rejects a bad code before it writes
-- anything, so nothing is half-created on the way past.

create or replace function public.redeem_code(
  code         text,
  display_name text default null,
  phone_number text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member public.program_members%rowtype;
begin
  begin
    return public.claim_person(redeem_code.code, redeem_code.display_name, redeem_code.phone_number);
  exception
    when sqlstate '22023' then
      -- Only "that is not a usable child code" falls through. Anything else
      -- raised with this code is a message the caller needs to read.
      if position('invalid code' in sqlerrm) = 0 then
        raise;
      end if;
  end;

  if btrim(coalesce(redeem_code.display_name, '')) = '' then
    raise exception 'redeem_code: a name is required' using errcode = '22023';
  end if;

  v_member := public.join_program(
    redeem_code.code, btrim(redeem_code.display_name), redeem_code.phone_number
  );

  return jsonb_build_object(
    'kind',       'program',
    'member_id',  v_member.id,
    'program_id', v_member.program_id,
    'role',       v_member.role
  );
end;
$$;
