-- Repair the one display name that was never actually asked for.
--
-- The create-org form collected an organization, a program and a sport, but
-- never the coach's own name, so it fell back to the local part of their email
-- address. Albertville's head coach has therefore appeared on their own roster
-- as "headcoach" since the first week. Every other path -- join_program,
-- submit_registration, claim_person, register_person -- asks a human for a
-- name, which is why exactly one row in the whole database is affected.
--
-- The form now asks, so no new row can be created this way.
--
-- This does NOT invent a name. Nobody here knows who is behind that address,
-- and guessing at a real person's name would be worse than the bug. "Head
-- Coach" is a true statement of their role and reads as deliberate rather than
-- broken; the person themselves, or Matt, can set the real one.
--
-- Matched on the exact broken value, so it is a no-op anywhere else and cannot
-- touch a name somebody actually chose.

update public.people
   set full_name = 'Head Coach',
       updated_at = now()
 where full_name = 'headcoach';
