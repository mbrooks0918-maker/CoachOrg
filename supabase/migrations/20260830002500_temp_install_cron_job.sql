-- TEMPORARY installer, dropped by the migration that follows it.
--
-- The cron job created through the dashboard posted to the edge function with
-- an empty header object and a 1000 ms timeout, so every run either timed out
-- or came back 401. This rebuilds the job correctly.
--
-- The secret arrives as an argument rather than being written into this file,
-- because migrations are committed to a public repository. It is stored in
-- Vault, and the scheduled command reads it from there at run time, so the
-- plaintext secret never lands in cron.job.command either.

create or replace function public.install_send_reminders_cron(p_secret text)
returns jsonb
language plpgsql
security definer
set search_path = public, cron, net, vault, extensions
as $$
declare
  v_existing uuid;
  v_jobid    bigint;
  v_command  text;
begin
  -- Only program staff may run this, for the short time it exists.
  if not exists (
    select 1 from public.program_members
    where user_id = (select auth.uid())
      and role in ('head_coach', 'assistant_coach')
  ) then
    raise exception 'not authorised';
  end if;

  if coalesce(p_secret, '') = '' then
    raise exception 'secret must not be empty';
  end if;

  select id into v_existing from vault.secrets where name = 'coachorg_cron_secret';
  if v_existing is null then
    perform vault.create_secret(p_secret, 'coachorg_cron_secret',
                                'Shared secret for the send-scheduled-notifications cron job');
  else
    perform vault.update_secret(v_existing, p_secret, 'coachorg_cron_secret',
                                'Shared secret for the send-scheduled-notifications cron job');
  end if;

  -- The URL is fixed here rather than passed in, so this cannot be turned into
  -- a way to make the database post credentials to an arbitrary host.
  v_command := $cmd$
select net.http_post(
  url := 'https://slsdjtukdlmuukpzshlv.supabase.co/functions/v1/send-scheduled-notifications',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets
                       where name = 'coachorg_cron_secret')
  ),
  timeout_milliseconds := 20000
);
$cmd$;

  perform cron.unschedule('send-scheduled-notifications')
  where exists (select 1 from cron.job where jobname = 'send-scheduled-notifications');

  v_jobid := cron.schedule('send-scheduled-notifications', '* * * * *', v_command);

  return jsonb_build_object('jobid', v_jobid, 'secret_in_vault', true);
end;
$$;

grant execute on function public.install_send_reminders_cron(text) to authenticated;
