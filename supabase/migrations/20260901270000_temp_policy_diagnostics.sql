-- Temporary. Reads back the policies on public.people so a refused insert can
-- be diagnosed from the client. Dropped in the next migration.
create or replace function public.temp_people_policies()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_agg(jsonb_build_object(
           'policy', policyname, 'cmd', cmd, 'permissive', permissive,
           'roles', roles::text, 'using', qual, 'check', with_check
         ))
    from pg_policies
   where schemaname = 'public' and tablename = 'people';
$$;
grant execute on function public.temp_people_policies() to authenticated;
