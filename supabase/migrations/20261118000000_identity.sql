-- Identity rules for invitation-only accounts (build-plan 17.2a).
-- Design and sources: blueprint/hosted-services.md (contracts 1, 5, 6). Apply with supabase/README.md.
--
-- Two tables:
--   public.invitations  who may create an account, with which role, until when
--   public.profiles     one row per activated account: name, trusted role, active flag
-- An account only gets a profile once its email is confirmed and a valid invitation matches it.
-- Without a profile an account has no access to anything in the app.

-- ---------------------------------------------------------------------------
-- Invitations
-- ---------------------------------------------------------------------------
-- State is derived, never stored (first match wins): revoked if revoked_at is set, accepted if
-- accepted_at is set, expired if now() >= expires_at, otherwise pending. Only pending is valid.
create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null check (email = lower(email) and position('@' in email) > 1),
  role text not null default 'Member' check (role in ('Admin', 'Member')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days',
  revoked_at timestamptz,
  accepted_at timestamptz,
  accepted_user_id uuid references auth.users (id),
  invited_by uuid references auth.users (id) -- null for the first-Admin bootstrap invitation
);

-- At most one open (not accepted, not revoked) invitation per email address.
create unique index invitations_one_open_per_email
  on public.invitations (email)
  where accepted_at is null and revoked_at is null;

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------
-- Role and active are trusted: copied from the invitation at activation and changed only by
-- Admin-checked server functions (17.3). Clients may change their own name, nothing else.
create table public.profiles (
  user_id uuid primary key references auth.users (id),
  email text not null,
  name text check (name is null or char_length(name) between 1 and 100),
  role text not null check (role in ('Admin', 'Member')),
  active boolean not null default true,
  invitation_id uuid not null unique references public.invitations (id),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Row-level security and privileges
-- ---------------------------------------------------------------------------
alter table public.invitations enable row level security;
alter table public.profiles enable row level security;

-- Browser clients never touch invitations; Admin actions arrive through trusted functions (17.3).
revoke all on table public.invitations from public, anon, authenticated;

-- A signed-in user may read their own profile (active or not, so the app can explain a
-- deactivated account) and change only its name.
revoke all on table public.profiles from public, anon, authenticated;
grant select on table public.profiles to authenticated;
grant update (name) on table public.profiles to authenticated;

create policy "Users can read their own profile"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can rename their own profile"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- Invite-only sign-up: the "Before User Created" Auth hook
-- ---------------------------------------------------------------------------
-- Supabase Auth calls this before creating any user, for password and Google sign-ups alike.
-- It allows creation only for an email with a pending invitation. Every rejection uses the same
-- message, so the answer never reveals whether an address was invited.
-- Not security definer, as the Auth hooks docs recommend: supabase_auth_admin gets exactly the
-- grants it needs below.
create function public.hook_before_user_created(event jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  signup_email text := lower(btrim(coalesce(event -> 'user' ->> 'email', '')));
begin
  if signup_email <> '' and exists (
    select 1
    from public.invitations invitation
    where invitation.email = signup_email
      and invitation.accepted_at is null
      and invitation.revoked_at is null
      and invitation.expires_at > now()
  ) then
    return '{}'::jsonb;
  end if;

  return jsonb_build_object(
    'error', jsonb_build_object(
      'http_code', 403,
      'message', 'Sign-up is by invitation only. Ask an administrator for an invitation.'
    )
  );
end;
$$;

grant usage on schema public to supabase_auth_admin;
grant execute on function public.hook_before_user_created(jsonb) to supabase_auth_admin;
revoke execute on function public.hook_before_user_created(jsonb) from public, anon, authenticated;

-- The hook reads invitations, which has row-level security on.
grant select on table public.invitations to supabase_auth_admin;
create policy "Auth hook can read invitations"
  on public.invitations for select
  to supabase_auth_admin
  using (true);

-- ---------------------------------------------------------------------------
-- Activation: create the profile once the email is confirmed
-- ---------------------------------------------------------------------------
-- Password sign-ups confirm their address through the confirmation email; that proves the person
-- owns the invited address. The invitation is checked again here because it may have expired or
-- been revoked between sign-up and confirmation; then no profile is created and the account has
-- no access. This runs inside the Auth transaction, so it never raises on purpose: the Supabase
-- docs warn that a failing trigger blocks sign-ups.
create function public.activate_invited_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  user_email text := lower(btrim(coalesce(new.email, '')));
  invitation_id uuid;
  invitation_role text;
  given_name text := coalesce(
    nullif(btrim(left(btrim(coalesce(new.raw_user_meta_data ->> 'name', '')), 100)), ''),
    nullif(btrim(left(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), 100)), '')
  );
begin
  if new.email_confirmed_at is null or user_email = '' then
    return new;
  end if;
  if exists (select 1 from public.profiles profile where profile.user_id = new.id) then
    return new;
  end if;

  select invitation.id, invitation.role
    into invitation_id, invitation_role
  from public.invitations invitation
  where invitation.email = user_email
    and invitation.accepted_at is null
    and invitation.revoked_at is null
    and invitation.expires_at > now()
  for update;

  if invitation_id is null then
    return new;
  end if;

  insert into public.profiles (user_id, email, name, role, invitation_id)
  values (new.id, user_email, given_name, invitation_role, invitation_id);

  update public.invitations
  set accepted_at = now(), accepted_user_id = new.id
  where id = invitation_id;

  return new;
end;
$$;

revoke execute on function public.activate_invited_user() from public, anon, authenticated;

create trigger activate_invited_user
  after insert or update of email_confirmed_at on auth.users
  for each row
  execute function public.activate_invited_user();
