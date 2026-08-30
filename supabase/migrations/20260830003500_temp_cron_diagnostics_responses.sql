-- Restores the HTTP-response half of the temporary diagnostic so the repaired
-- cron job's actual replies can be read once. Dropped by the next migration.

create or replace function public.cron_diagnostics()
returns jsonb
language plpgsql
security definer
set search_path = public, cron, net, extensions
as $$
declare
  responses jsonb := '[]'::jsonb;
begin
  if to_regclass('net._http_response') is not null then
    select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) into responses
    from (
      select id, status_code, timed_out, error_msg,
             left(coalesce(content, ''), 500) as content, created
      from net._http_response order by created desc limit 6
    ) x;
  end if;
  return jsonb_build_object('recent_http_responses', responses);
end;
$$;
