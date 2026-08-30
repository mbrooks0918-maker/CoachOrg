-- TEMPORARY diagnostic, dropped by the migration that follows it.
--
-- Scheduled reminders were not going out after the cron job was created, and
-- nothing outside the database can see whether pg_cron is firing or what the
-- edge function replied. This exposes just enough to tell those apart.
--
-- Deliberately omits every `command` column: the cron job's command string
-- embeds the CRON_SECRET, and this function is callable by any signed-in user
-- while it exists.

create or replace function public.cron_diagnostics()
returns jsonb
language plpgsql
security definer
set search_path = public, cron, net, extensions
as $$
declare
  jobs      jsonb := '[]'::jsonb;
  runs      jsonb := '[]'::jsonb;
  responses jsonb := '[]'::jsonb;
begin
  if to_regclass('cron.job') is null then
    return jsonb_build_object('cron_extension', false);
  end if;

  select coalesce(jsonb_agg(to_jsonb(j)), '[]'::jsonb) into jobs
  from (
    select jobid, jobname, schedule, active, username
    from cron.job order by jobid
  ) j;

  select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) into runs
  from (
    select jobid, status, return_message, start_time, end_time
    from cron.job_run_details order by start_time desc limit 10
  ) r;

  if to_regclass('net._http_response') is not null then
    select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) into responses
    from (
      select id, status_code, timed_out, error_msg,
             left(coalesce(content, ''), 300) as content, created
      from net._http_response order by created desc limit 10
    ) x;
  end if;

  return jsonb_build_object(
    'cron_extension', true,
    'jobs', jobs,
    'recent_runs', runs,
    'recent_http_responses', responses
  );
end;
$$;

grant execute on function public.cron_diagnostics() to authenticated;
