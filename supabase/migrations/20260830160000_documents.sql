-- Document storage.
--
-- Two separate things that deliberately share no schema:
--
--   program_documents -- one shared library per program. Waivers, the code of
--                        conduct, forms everybody needs. Staff manage, the
--                        whole roster reads.
--   player_documents  -- paperwork belonging to one player. A physical, an
--                        emergency contact form. Visible only to staff, that
--                        player, and that player's linked guardians.
--
-- Keeping them apart is the point: they have different audiences, different
-- lifetimes and different privacy. Folding them into one table with a nullable
-- player column would put "is this row private?" into every single query.
--
-- Files live in Storage; these tables hold the metadata and the path. Both
-- buckets are private, so every read goes through a signed URL and is subject
-- to the storage policies at the bottom of this file.

-- ============================================================================
-- Helpers
-- ============================================================================

-- Storage paths are text. A malformed first segment would otherwise abort the
-- whole policy evaluation with a cast error rather than simply denying.
create or replace function public.safe_uuid(p_text text)
returns uuid
language plpgsql
immutable
as $$
begin
  return p_text::uuid;
exception
  when others then return null;
end;
$$;

revoke all     on function public.safe_uuid(text) from public;
grant  execute on function public.safe_uuid(text) to authenticated;

-- "Am I one of this player's guardians?" Reads the existing player_guardians
-- links; security definer so the policy is not filtered by that table's own
-- RLS. Does not change how linking works -- only asks.
create or replace function public.is_guardian_of(p_player_member_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.player_guardians g
    join public.program_members m on m.id = g.guardian_member_id
    where g.player_member_id = p_player_member_id
      and m.user_id = (select auth.uid())
  );
$$;

revoke all     on function public.is_guardian_of(uuid) from public;
revoke execute on function public.is_guardian_of(uuid) from anon;
grant  execute on function public.is_guardian_of(uuid) to authenticated;

-- "May I see this player's paperwork?" Staff, the player, or a linked guardian.
create or replace function public.can_see_player_docs(p_player_member_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.program_members m
    where m.id = p_player_member_id
      and (
        public.manages_program(m.program_id)
        or public.is_program_org_admin(m.program_id)
        or m.user_id = (select auth.uid())
        or public.is_guardian_of(p_player_member_id)
      )
  );
$$;

-- "May I add or remove this player's paperwork?" Staff and linked guardians.
-- Not the player: a student should not be able to delete their own physical.
create or replace function public.can_manage_player_docs(p_player_member_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.program_members m
    where m.id = p_player_member_id
      and (
        public.manages_program(m.program_id)
        or public.is_guardian_of(p_player_member_id)
      )
  );
$$;

revoke all     on function public.can_see_player_docs(uuid)    from public;
revoke execute on function public.can_see_player_docs(uuid)    from anon;
grant  execute on function public.can_see_player_docs(uuid)    to authenticated;
revoke all     on function public.can_manage_player_docs(uuid) from public;
revoke execute on function public.can_manage_player_docs(uuid) from anon;
grant  execute on function public.can_manage_player_docs(uuid) to authenticated;

-- ============================================================================
-- Tables
-- ============================================================================

create table if not exists public.program_documents (
  id           uuid        primary key default gen_random_uuid(),
  program_id   uuid        not null references public.programs (id) on delete cascade,
  title        text        not null,
  category     text        not null,
  description  text,
  storage_path text        not null unique,
  file_name    text        not null,
  mime_type    text,
  size_bytes   bigint,
  uploaded_by  uuid        not null references auth.users (id) on delete set null,
  created_at   timestamptz not null default now()
);

comment on table public.program_documents is
  'Shared document library for a program. Staff manage, the whole roster reads.';

create index if not exists program_documents_program_idx
  on public.program_documents (program_id, category, title);

create table if not exists public.player_documents (
  id               uuid        primary key default gen_random_uuid(),
  program_id       uuid        not null references public.programs (id)        on delete cascade,
  player_member_id uuid        not null references public.program_members (id) on delete cascade,
  doc_type         text        not null,
  storage_path     text        not null unique,
  file_name        text        not null,
  mime_type        text,
  size_bytes       bigint,
  uploaded_by      uuid        not null references auth.users (id) on delete set null,
  created_at       timestamptz not null default now(),

  -- One document per type per player. Replacing means removing and adding,
  -- which keeps "has this player got a physical on file?" a yes or no.
  constraint player_documents_type_key unique (player_member_id, doc_type)
);

comment on table public.player_documents is
  'Paperwork for one player. Visible to staff, the player, and their linked guardians only.';

create index if not exists player_documents_player_idx
  on public.player_documents (player_member_id);
create index if not exists player_documents_program_idx
  on public.player_documents (program_id);

-- ============================================================================
-- Row Level Security
-- ============================================================================

alter table public.program_documents enable row level security;
alter table public.player_documents  enable row level security;

grant select, insert, update, delete on public.program_documents to authenticated;
grant select, insert, delete         on public.player_documents  to authenticated;

-- ---- program library ------------------------------------------------------
drop policy if exists program_documents_select on public.program_documents;
create policy program_documents_select on public.program_documents for select to authenticated
  using (public.is_program_member(program_id) or public.is_program_org_admin(program_id));

drop policy if exists program_documents_insert on public.program_documents;
create policy program_documents_insert on public.program_documents for insert to authenticated
  with check (uploaded_by = (select auth.uid()) and public.manages_program(program_id));

drop policy if exists program_documents_update on public.program_documents;
create policy program_documents_update on public.program_documents for update to authenticated
  using (public.manages_program(program_id)) with check (public.manages_program(program_id));

drop policy if exists program_documents_delete on public.program_documents;
create policy program_documents_delete on public.program_documents for delete to authenticated
  using (public.manages_program(program_id));

-- ---- player paperwork -----------------------------------------------------
drop policy if exists player_documents_select on public.player_documents;
create policy player_documents_select on public.player_documents for select to authenticated
  using (public.can_see_player_docs(player_member_id));

drop policy if exists player_documents_insert on public.player_documents;
create policy player_documents_insert on public.player_documents for insert to authenticated
  with check (
    uploaded_by = (select auth.uid())
    and public.can_manage_player_docs(player_member_id)
  );

drop policy if exists player_documents_delete on public.player_documents;
create policy player_documents_delete on public.player_documents for delete to authenticated
  using (public.can_manage_player_docs(player_member_id));

-- No UPDATE: a document is replaced by removing it and uploading again, which
-- keeps the row and the file in Storage from drifting apart.

-- ============================================================================
-- Storage
-- ============================================================================

-- Both private. Nothing is served straight from a public URL; the app mints a
-- short-lived signed URL per download, which re-checks the policies below.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'program-documents', 'program-documents', false, 10485760,
  array[
    'application/pdf',
    'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
    'text/plain', 'text/csv',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'player-documents', 'player-documents', false, 10485760,
  array[
    'application/pdf',
    'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
    'text/plain', 'text/csv',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
on conflict (id) do nothing;

-- Paths carry the authorisation:
--   program-documents/<program_id>/<file>
--   player-documents/<program_id>/<player_member_id>/<file>
-- so a policy can decide from the object name alone.

drop policy if exists program_docs_read   on storage.objects;
create policy program_docs_read on storage.objects for select to authenticated
  using (
    bucket_id = 'program-documents'
    and public.is_program_member(public.safe_uuid((storage.foldername(name))[1]))
  );

drop policy if exists program_docs_write  on storage.objects;
create policy program_docs_write on storage.objects for insert to authenticated
  with check (
    bucket_id = 'program-documents'
    and public.manages_program(public.safe_uuid((storage.foldername(name))[1]))
  );

drop policy if exists program_docs_remove on storage.objects;
create policy program_docs_remove on storage.objects for delete to authenticated
  using (
    bucket_id = 'program-documents'
    and public.manages_program(public.safe_uuid((storage.foldername(name))[1]))
  );

drop policy if exists player_docs_read   on storage.objects;
create policy player_docs_read on storage.objects for select to authenticated
  using (
    bucket_id = 'player-documents'
    and public.can_see_player_docs(public.safe_uuid((storage.foldername(name))[2]))
  );

drop policy if exists player_docs_write  on storage.objects;
create policy player_docs_write on storage.objects for insert to authenticated
  with check (
    bucket_id = 'player-documents'
    and public.can_manage_player_docs(public.safe_uuid((storage.foldername(name))[2]))
  );

drop policy if exists player_docs_remove on storage.objects;
create policy player_docs_remove on storage.objects for delete to authenticated
  using (
    bucket_id = 'player-documents'
    and public.can_manage_player_docs(public.safe_uuid((storage.foldername(name))[2]))
  );
