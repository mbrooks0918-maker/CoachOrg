create or replace function public.cron_diagnostics()
returns jsonb
language plpgsql
security definer
set search_path = public, cron, net, extensions
as $$
declare
  jobs jsonb := '[]'::jsonb;
begin
  if to_regclass('cron.job') is null then
    return jsonb_build_object('cron_extension', false);
  end if;

  select coalesce(jsonb_agg(to_jsonb(j)), '[]'::jsonb) into jobs
  from (
    select
      jobid, jobname, schedule, active,
      -- Structure only. Every credential-shaped run of characters is masked so
      -- the CRON_SECRET and the service key never leave the database.
      regexp_replace(
        regexp_replace(
          regexp_replace(command, 'eyJ[A-Za-z0-9_.-]{20,}', '<JWT-REDACTED>', 'g'),
          'sb_(secret|publishable)_[A-Za-z0-9_-]{6,}', '<SB-KEY-REDACTED>', 'g'),
        '[0-9a-f]{32,}', '<HEX-SECRET-REDACTED>', 'g') as command_redacted
    from cron.job order by jobid
  ) j;

  return jsonb_build_object('cron_extension', true, 'jobs', jobs);
end;
$$;
