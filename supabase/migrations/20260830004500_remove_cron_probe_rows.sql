-- Removes the two probe reminders queued while proving the repaired cron job
-- fires. They are marked sent, and the delete policy deliberately refuses to
-- remove sent rows through the app, so they have to go from here.
--
-- Scoped to these exact ids rather than to a title pattern, so this cannot
-- take a real reminder with it.

delete from public.scheduled_tasks
where id in (
  '544e1eb1-7565-4c95-ad50-7d32cf7b9daa',  -- "Cron probe"
  'e6282b69-0aee-42fc-b96a-d3db551cf814'   -- "Final check"
);
