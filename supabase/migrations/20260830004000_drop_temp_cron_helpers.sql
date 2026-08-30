-- Removes the temporary helpers added while repairing the cron job.
--
-- What they were for: the job created through the dashboard posted to the edge
-- function with `headers:='{}'` and `timeout_milliseconds:=1000`, so every run
-- either timed out after a second or came back 401. Nothing outside the
-- database could see that, hence the short-lived diagnostic.
--
-- The repaired job (`send-scheduled-notifications`, every minute) now sends an
-- x-cron-secret header read from Vault under the name `coachorg_cron_secret`,
-- with a 20 s timeout. The plaintext secret is in neither this repository nor
-- cron.job.command.
--
-- If CRON_SECRET is ever rotated on the edge function, the Vault entry has to
-- be updated to the same value or the job will start coming back 401 again.

drop function if exists public.install_send_reminders_cron(text);
drop function if exists public.cron_diagnostics();
