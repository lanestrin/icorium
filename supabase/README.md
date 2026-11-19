# Supabase

The database rules for invitation-only accounts (build-plan M17). The design,
its sources and the decisions behind it are in
[`blueprint/hosted-services.md`](../blueprint/hosted-services.md).

**Status: not applied anywhere.** No Supabase project exists for this app
yet. Every step below is **not done; needs the person's authorization**. The
SQL is checked as text by `tests/supabase-sql.test.ts`, but it has never run
against Postgres. Its hosted behavior is verified in 17.7.

The app does not use any of this yet. Sign-in screens arrive in 17.2b, and
cloud files in 17.4.

## What is here

| File | What it does |
| --- | --- |
| `migrations/20261118000000_identity.sql` | The `invitations` and `profiles` tables, row-level security, the invite-only sign-up hook and the trigger that activates an invited account |
| `bootstrap-first-admin.sql` | The one-time step that makes the project owner the first Admin |

The migration file name follows the Supabase CLI convention, so the folder
can be used with the CLI later. The CLI is not a dependency of this project.

## How the rules work

1. Every new account, whether it signs up with a password or with Google,
   passes through the **Before User Created** hook
   (`public.hook_before_user_created`). It allows the account only when its
   email has a pending invitation: not accepted, not revoked, not expired.
   Every rejection shows the same message, so it never reveals whether an
   address was invited.
2. When the account's email is confirmed, the trigger
   `activate_invited_user` checks the invitation again. It creates the
   profile with the invitation's role, then marks the invitation accepted.
   An invitation that expired or was revoked in the meantime creates no
   profile, and without a profile the account has no access.
3. A signed-in user can read only their own profile and change only its
   name. Browser clients cannot read invitations at all.

## Setup (not done; each step needs authorization)

1. **Apply the migration.** In the project's SQL editor, run
   `migrations/20261118000000_identity.sql` once. It must run before the
   hook is enabled, because the hook calls a function the migration creates.
2. **Enable the hook.** In the dashboard, go to Authentication > Hooks, add
   **Before User Created**, choose **Postgres function** and select
   `public.hook_before_user_created`.
3. **Keep "Confirm email" on** (Authentication > Sign In / Providers >
   Email). Confirmation proves the person owns the invited address. Without
   it, anyone who knew an invited address could claim it with a password.
4. **Keep "Allow new users to sign up" on.** The hook is the gate. With
   sign-ups off, "only existing users can sign in", so invited people could
   not create their account.
5. **Make the first Admin.** Replace `owner@example.com` in
   `bootstrap-first-admin.sql` with the project owner's address in the SQL
   editor (never in this repository), then run it once. The owner then signs
   up with that address and confirms it, using the 17.2b screens.

Google sign-in, the Gmail SMTP sender and redirect URLs are set up with
17.2b.

## Not verified yet (17.7)

These are recorded as assumptions until hosted evidence exists:

- the hook rejects a non-invited password sign-up and a non-invited Google
  sign-up;
- Google sign-ups arrive with `email_confirmed_at` already set, so they
  activate at once;
- the profile is created only after confirmation, and an expired or revoked
  invitation creates none;
- a user can read only their own profile and update only its name;
- the grants `supabase_auth_admin` needs to read `invitations` are complete.

## Sources

- Before User Created hook: https://supabase.com/docs/guides/auth/auth-hooks/before-user-created-hook
- Auth hooks (Postgres functions and grants): https://supabase.com/docs/guides/auth/auth-hooks
- Sign-up setting: https://supabase.com/docs/guides/auth/general-configuration
- Profile trigger pattern: https://supabase.com/docs/guides/auth/managing-user-data
- Row-level security: https://supabase.com/docs/guides/database/postgres/row-level-security
- Column privileges: https://supabase.com/docs/guides/database/postgres/column-level-security
