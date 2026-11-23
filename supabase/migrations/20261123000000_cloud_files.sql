-- Cloud files (build-plan 17.4a).
-- Design: blueprint/hosted-services.md (contracts 1-4, 7 and 8). Apply after 20261122000000_admin_access.sql.
--
-- Every row and object belongs to the signed-in user (auth.uid(), never a value the browser supplies)
-- and is reachable only while that user's profile is active. No policy gives an Admin, or any other
-- user, access to someone else's files. The admin Edge Function never touches these tables.
-- There is no delete grant on files: permanent deletion arrives in 18.1.

-- ---------------------------------------------------------------------------
-- Active-account check
-- ---------------------------------------------------------------------------
-- Every policy below calls this, so deactivation takes effect on the next request (contract 7).
create function public.is_active_account()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles profile
    where profile.user_id = (select auth.uid()) and profile.active
  );
$$;

revoke execute on function public.is_active_account() from public, anon, authenticated;
grant execute on function public.is_active_account() to authenticated;

-- ---------------------------------------------------------------------------
-- Capacity (contract 8)
-- ---------------------------------------------------------------------------
-- True while the stored files of every user together are under 900 MB (900000000 bytes), leaving room
-- below the 1 GB Free limit for the object being written (at most 50 MB). It returns only a boolean.
create function public.file_storage_has_room()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum((object.metadata ->> 'size')::bigint), 0) < 900000000
  from storage.objects object
  where object.bucket_id = 'workspace-files';
$$;

revoke execute on function public.file_storage_has_room() from public, anon, authenticated;
grant execute on function public.file_storage_has_room() to authenticated;

-- ---------------------------------------------------------------------------
-- File ID counter (contract 2)
-- ---------------------------------------------------------------------------
create table public.file_id_counters (
  owner_id uuid primary key references auth.users (id),
  last_base integer not null check (last_base between 100001 and 999999)
);

alter table public.file_id_counters enable row level security;
-- Only allocate_file_id() touches the counter.
revoke all on table public.file_id_counters from public, anon, authenticated;

-- The caller's next six-digit base ID. One statement, so two devices never receive the same number.
-- A number is never reused, even when the upload that asked for it fails.
create function public.allocate_file_id()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  allocated integer;
begin
  if not public.is_active_account() then
    raise exception 'not_active';
  end if;
  if not public.file_storage_has_room() then
    raise exception 'storage_full';
  end if;
  insert into public.file_id_counters as counter (owner_id, last_base)
  values ((select auth.uid()), 100001)
  on conflict (owner_id) do update set last_base = counter.last_base + 1
  returning counter.last_base into allocated;
  return allocated::text;
exception
  when check_violation then
    raise exception 'file_ids_exhausted';
end;
$$;

revoke execute on function public.allocate_file_id() from public, anon, authenticated;
grant execute on function public.allocate_file_id() to authenticated;

-- ---------------------------------------------------------------------------
-- Files
-- ---------------------------------------------------------------------------
-- id is internal (Storage object names, relationships) and is never shown or exported; file_id is the
-- File ID people see, unique within one owner. meta holds the other FileMeta fields as the client's JSON.
create table public.files (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id),
  file_id text not null check (file_id ~ '^[1-9][0-9]{5}(-[VMC])?$' and left(file_id, 6)::integer >= 100001),
  source_id uuid,
  uploaded_at timestamptz not null default now(),
  meta jsonb not null check (
    jsonb_typeof(meta) = 'object'
    -- coalesce: a CHECK passes on NULL, so a missing key would otherwise be accepted.
    and coalesce(jsonb_typeof(meta -> 'name') = 'string', false)
    and coalesce(meta ->> 'status' in ('Ready', 'Needs Review', 'Needs Mapping', 'Processed'), false)
    and octet_length(meta::text) <= 1048576
  ),
  unique (owner_id, file_id),
  unique (owner_id, id),
  -- A result can link only to a file of the same owner.
  foreign key (owner_id, source_id) references public.files (owner_id, id)
);

alter table public.files enable row level security;
revoke all on table public.files from public, anon, authenticated;
grant select, insert on table public.files to authenticated;
-- id, owner_id and file_id never change; a re-run replaces a result's metadata under the same ID.
grant update (meta, source_id, uploaded_at) on table public.files to authenticated;

create policy "Owners read their files"
  on public.files for select
  to authenticated
  using (owner_id = (select auth.uid()) and (select public.is_active_account()));

-- Adding a file is refused at capacity.
create policy "Owners add their files"
  on public.files for insert
  to authenticated
  with check (owner_id = (select auth.uid()) and (select public.is_active_account()) and (select public.file_storage_has_room()));

-- Replacing a result, confirming a mapping and archiving still work at capacity.
create policy "Owners update their files"
  on public.files for update
  to authenticated
  using (owner_id = (select auth.uid()) and (select public.is_active_account()))
  with check (owner_id = (select auth.uid()) and (select public.is_active_account()));

-- ---------------------------------------------------------------------------
-- The processing gate, trusted part
-- ---------------------------------------------------------------------------
-- A calculated result (a File ID with a function code, not imported) must come from the same owner's
-- input with that base ID which is Ready or Needs Review and not archived. Runs as the caller, so
-- the owner policies apply to the lookup. The mapping itself is still checked against the CSV in
-- shared/file-service.ts; this trigger relies on the input's stored status. Limit: meta is written by the
-- browser, so a modified client can mark a result imported (a real JSON true) and skip this check; it
-- guards against mistakes and stale lists, not against someone editing the app's own code.
create function public.check_processing_gate()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if length(new.file_id) > 6 and not coalesce(new.meta -> 'imported' = 'true'::jsonb, false) then
    if new.source_id is null or not exists (
      select 1
      from public.files input
      where input.id = new.source_id
        and input.owner_id = new.owner_id
        and input.file_id = left(new.file_id, 6)
        and input.meta ->> 'status' in ('Ready', 'Needs Review')
        and coalesce((input.meta ->> 'archived')::boolean, false) = false
    ) then
      raise exception 'processing_not_allowed';
    end if;
  end if;
  return new;
end;
$$;

create trigger files_processing_gate
  before insert or update of source_id, meta on public.files
  for each row execute function public.check_processing_gate();

-- ---------------------------------------------------------------------------
-- Supplier profiles
-- ---------------------------------------------------------------------------
create table public.supplier_profiles (
  owner_id uuid not null default auth.uid() references auth.users (id),
  key text not null check (char_length(key) between 1 and 10000),
  profile jsonb not null check (jsonb_typeof(profile) = 'object' and octet_length(profile::text) <= 65536),
  saved_at timestamptz not null default now(),
  primary key (owner_id, key)
);

alter table public.supplier_profiles enable row level security;
revoke all on table public.supplier_profiles from public, anon, authenticated;
grant select, insert on table public.supplier_profiles to authenticated;
grant update (profile, saved_at) on table public.supplier_profiles to authenticated;

create policy "Owners read their supplier profiles"
  on public.supplier_profiles for select
  to authenticated
  using (owner_id = (select auth.uid()) and (select public.is_active_account()));

create policy "Owners add their supplier profiles"
  on public.supplier_profiles for insert
  to authenticated
  with check (owner_id = (select auth.uid()) and (select public.is_active_account()));

create policy "Owners update their supplier profiles"
  on public.supplier_profiles for update
  to authenticated
  using (owner_id = (select auth.uid()) and (select public.is_active_account()))
  with check (owner_id = (select auth.uid()) and (select public.is_active_account()));

-- ---------------------------------------------------------------------------
-- Private bucket and object policies (contract 4)
-- ---------------------------------------------------------------------------
-- Objects are <owner uuid>/<file uuid>.csv, .original or .source.json. 52428800 is the 50 MB Free limit.
insert into storage.buckets (id, name, public, file_size_limit)
values ('workspace-files', 'workspace-files', false, 52428800);

create policy "Owners read their file objects"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'workspace-files'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(csv|original|source\.json)$'
    and (select public.is_active_account())
  );

-- Adding an object is refused at capacity.
create policy "Owners add their file objects"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'workspace-files'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(csv|original|source\.json)$'
    and (select public.is_active_account())
    and (select public.file_storage_has_room())
  );

-- Replacing an object (a re-run result) still works at capacity.
create policy "Owners replace their file objects"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'workspace-files'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select public.is_active_account())
  )
  with check (
    bucket_id = 'workspace-files'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(csv|original|source\.json)$'
    and (select public.is_active_account())
  );

-- Only so the app can remove objects left by a failed save; deleting files is a later feature (18.1).
create policy "Owners remove their file objects"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'workspace-files'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select public.is_active_account())
  );
