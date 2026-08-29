-- Cancelling a queued reminder.
--
-- The original push migration deliberately left DELETE unpoliced, so nobody
-- could remove a scheduled_tasks row. That made the coach-facing composer a
-- one-way door: a reminder typed with the wrong time or sent to the wrong
-- group could not be taken back.
--
-- Deletes are allowed only while the task is still queued. Once the worker has
-- marked it sent the row is a delivery record, and letting a coach erase it
-- would hide what people actually received.

drop policy if exists scheduled_tasks_delete on public.scheduled_tasks;
create policy scheduled_tasks_delete
  on public.scheduled_tasks
  for delete
  to authenticated
  using (
    sent = false
    and (
      public.is_head_coach(program_id)
      or public.is_program_staff(program_id)
    )
  );
