-- Admin account access (build-plan 17.3).
-- Design: blueprint/hosted-services.md (contracts 6 and 7). Apply after 20261118000000_identity.sql.
--
-- These functions are called only by the Admin Edge Function (supabase/functions/admin), which runs
-- with the secret key (the service_role). Browsers cannot execute them: execute is revoked from
-- public, anon and authenticated. The function passes `actor`, the user ID it verified from the
-- caller's access token; every function first checks that the actor is an active Admin.
-- Nothing here reads file tables or Storage. Admins see account and invitation details only.
--
-- Invitation state is derived, as in 17.2a (first match wins): revoked, accepted, expired, pending.
-- "Open" means not accepted and not revoked; at most one open invitation exists per email.

-- ---------------------------------------------------------------------------
-- The Admin check
-- ---------------------------------------------------------------------------
-- Internal: called by the functions below, never granted to anyone.
create function public.admin_assert(actor uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if actor is null or not exists (
    select 1
    from public.profiles profile
    where profile.user_id = actor and profile.role = 'Admin' and profile.active
  ) then
    raise exception 'not_admin';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- List accounts and invitations
-- ---------------------------------------------------------------------------
create function public.admin_list(actor uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.admin_assert(actor);
  return jsonb_build_object(
    'accounts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id', profile.user_id, 'email', profile.email, 'name', profile.name,
        'role', profile.role, 'active', profile.active, 'created_at', profile.created_at
      ) order by profile.created_at)
      from public.profiles profile
    ), '[]'::jsonb),
    'invitations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', invitation.id, 'email', invitation.email, 'role', invitation.role,
        'state', case
          when invitation.revoked_at is not null then 'revoked'
          when invitation.accepted_at is not null then 'accepted'
          when invitation.expires_at <= now() then 'expired'
          else 'pending' end,
        'created_at', invitation.created_at, 'expires_at', invitation.expires_at,
        'accepted_at', invitation.accepted_at, 'revoked_at', invitation.revoked_at
      ) order by invitation.created_at desc)
      from public.invitations invitation
    ), '[]'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Invitations
-- ---------------------------------------------------------------------------
create function public.admin_create_invitation(actor uuid, target_email text, target_role text default 'Member')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  clean_email text := lower(btrim(coalesce(target_email, '')));
  clean_role text := coalesce(target_role, 'Member');
  created public.invitations;
begin
  perform public.admin_assert(actor);
  -- One address only: no whitespace, control characters, list separators, quotes or angle brackets.
  if char_length(clean_email) > 254
     or clean_email !~ '^[^@[:space:][:cntrl:],;<>"()\\]+@[^@[:space:][:cntrl:],;<>"()\\]+\.[^@[:space:][:cntrl:],;<>"()\\]+$' then
    raise exception 'invalid_email';
  end if;
  if clean_role not in ('Admin', 'Member') then
    raise exception 'invalid_role';
  end if;
  if exists (select 1 from public.profiles profile where profile.email = clean_email) then
    raise exception 'account_exists';
  end if;
  if exists (
    select 1 from public.invitations invitation
    where invitation.email = clean_email and invitation.accepted_at is null and invitation.revoked_at is null
  ) then
    raise exception 'invitation_exists';
  end if;

  insert into public.invitations (email, role, invited_by)
  values (clean_email, clean_role, actor)
  returning * into created;

  return jsonb_build_object('id', created.id, 'email', created.email, 'role', created.role,
    'state', 'pending', 'created_at', created.created_at, 'expires_at', created.expires_at);
exception
  when unique_violation then
    raise exception 'invitation_exists';
end;
$$;

-- Used only when the first invitation email could not be sent. Never removes an accepted invitation.
create function public.admin_discard_unsent_invitation(actor uuid, target_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.admin_assert(actor);
  delete from public.invitations invitation
  where invitation.id = target_id and invitation.accepted_at is null;
end;
$$;

-- The invitation to email again: only a pending one (not expired, revoked or accepted).
create function public.admin_pending_invitation(actor uuid, target_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  pending public.invitations;
begin
  perform public.admin_assert(actor);
  select * into pending
  from public.invitations invitation
  where invitation.id = target_id
    and invitation.accepted_at is null and invitation.revoked_at is null and invitation.expires_at > now();
  if pending.id is null then
    raise exception 'invitation_not_pending';
  end if;
  return jsonb_build_object('id', pending.id, 'email', pending.email, 'role', pending.role,
    'state', 'pending', 'created_at', pending.created_at, 'expires_at', pending.expires_at);
end;
$$;

-- A new 30 days from now, for a pending or expired invitation.
create function public.admin_extend_invitation(actor uuid, target_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed public.invitations;
begin
  perform public.admin_assert(actor);
  update public.invitations invitation
  set expires_at = now() + interval '30 days'
  where invitation.id = target_id and invitation.accepted_at is null and invitation.revoked_at is null
  returning * into changed;
  if changed.id is null then
    raise exception 'invitation_closed';
  end if;
  return jsonb_build_object('id', changed.id, 'email', changed.email, 'role', changed.role,
    'state', 'pending', 'created_at', changed.created_at, 'expires_at', changed.expires_at);
end;
$$;

-- Prevents acceptance. For a pending or expired invitation.
create function public.admin_revoke_invitation(actor uuid, target_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed public.invitations;
begin
  perform public.admin_assert(actor);
  update public.invitations invitation
  set revoked_at = now()
  where invitation.id = target_id and invitation.accepted_at is null and invitation.revoked_at is null
  returning * into changed;
  if changed.id is null then
    raise exception 'invitation_closed';
  end if;
  return jsonb_build_object('id', changed.id, 'email', changed.email, 'role', changed.role,
    'state', 'revoked', 'created_at', changed.created_at, 'expires_at', changed.expires_at,
    'revoked_at', changed.revoked_at);
end;
$$;

-- ---------------------------------------------------------------------------
-- Roles and account access
-- ---------------------------------------------------------------------------
-- Both lock every active Admin profile before checking, so two Admins changing each other at the same
-- moment run one after the other and the second sees the first's result. A change that would leave
-- no active Admin raises last_admin; the check and the update are one transaction.
create function public.admin_set_role(actor uuid, target_user uuid, target_role text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.profiles;
begin
  perform 1 from public.profiles profile where profile.role = 'Admin' and profile.active for update;
  perform public.admin_assert(actor);
  if target_role is null or target_role not in ('Admin', 'Member') then
    raise exception 'invalid_role';
  end if;
  select * into target from public.profiles profile where profile.user_id = target_user for update;
  if target.user_id is null then
    raise exception 'account_not_found';
  end if;
  if target.role = 'Admin' and target.active and target_role <> 'Admin'
     and not exists (
       select 1 from public.profiles other
       where other.role = 'Admin' and other.active and other.user_id <> target.user_id
     ) then
    raise exception 'last_admin';
  end if;
  update public.profiles profile set role = target_role where profile.user_id = target.user_id
  returning * into target;
  return jsonb_build_object('user_id', target.user_id, 'email', target.email, 'name', target.name,
    'role', target.role, 'active', target.active, 'created_at', target.created_at);
end;
$$;

-- Deactivation blocks data access on the caller's next request (the active check). The Edge Function
-- then bans the user in Auth so sessions cannot refresh. Files are kept.
create function public.admin_set_active(actor uuid, target_user uuid, target_active boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.profiles;
begin
  perform 1 from public.profiles profile where profile.role = 'Admin' and profile.active for update;
  perform public.admin_assert(actor);
  if target_active is null then
    raise exception 'invalid_active';
  end if;
  select * into target from public.profiles profile where profile.user_id = target_user for update;
  if target.user_id is null then
    raise exception 'account_not_found';
  end if;
  if target.role = 'Admin' and target.active and not target_active
     and not exists (
       select 1 from public.profiles other
       where other.role = 'Admin' and other.active and other.user_id <> target.user_id
     ) then
    raise exception 'last_admin';
  end if;
  update public.profiles profile set active = target_active where profile.user_id = target.user_id
  returning * into target;
  return jsonb_build_object('user_id', target.user_id, 'email', target.email, 'name', target.name,
    'role', target.role, 'active', target.active, 'created_at', target.created_at);
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges: only the service role (the Edge Function) may execute these
-- ---------------------------------------------------------------------------
revoke execute on function public.admin_assert(uuid) from public, anon, authenticated;
revoke execute on function public.admin_list(uuid) from public, anon, authenticated;
revoke execute on function public.admin_create_invitation(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.admin_discard_unsent_invitation(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.admin_pending_invitation(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.admin_extend_invitation(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.admin_revoke_invitation(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.admin_set_role(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.admin_set_active(uuid, uuid, boolean) from public, anon, authenticated;

grant execute on function public.admin_list(uuid) to service_role;
grant execute on function public.admin_create_invitation(uuid, text, text) to service_role;
grant execute on function public.admin_discard_unsent_invitation(uuid, uuid) to service_role;
grant execute on function public.admin_pending_invitation(uuid, uuid) to service_role;
grant execute on function public.admin_extend_invitation(uuid, uuid) to service_role;
grant execute on function public.admin_revoke_invitation(uuid, uuid) to service_role;
grant execute on function public.admin_set_role(uuid, uuid, text) to service_role;
grant execute on function public.admin_set_active(uuid, uuid, boolean) to service_role;
