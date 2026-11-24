# Supabase

The database rules for invitation-only accounts (build-plan M17). The design,
its sources and the decisions behind it are in
[`blueprint/hosted-services.md`](../blueprint/hosted-services.md).

**Status: Supabase deployed; validation in progress.** See "Hosted status"
below for what the person has reported. `npm run verify` checks the SQL only as
text (`tests/supabase-sql.test.ts`); formal hosted evidence is recorded in 17.7.
The steps below describe the setup; repeating any of them on a project still
needs the person's authorization.

The app requires sign-in (17.6): the workspace needs an active profile or a
guest demo, and the Admin, Architecture and Generator pages an active Admin.

## Hosted status

Reported by the person on 2026-11-23 and 2026-11-24, not independently checked
here and not 17.7 evidence:

- **In place:** development project `icorium-development` and the test site;
  the three migrations; five tables with row-level security; the private bucket;
  the invite-only hook, seen working; the first Admin; the Admin function with
  JWT verification, listing live records; the site's two public variables.
  Google sign-in and email/password registration work, and active Admin and
  Member accounts were seen in Supabase.
- **Failures, since resolved:** Gmail error 535 blocked email registration, and
  an invitation email returned 502 (the unsent invitation was removed, as
  designed). Invitations have worked since the SMTP fix.
- **Outstanding before 17.6 merges or deploys:** password recovery; cloud
  upload, retrieval and persistence; cross-user file isolation; a Member denied
  Admin operations; deactivation and reactivation; last-active-Admin protection;
  uninvited sign-up refused by both methods; and `allocate_file_id()`,
  `is_active_account()` and `file_storage_has_room()` as a signed-in caller. A
  defect found there is resolved before 17.6 merges. No access-control defect is
  known.
- **Advisor findings:** `file_id_counters` has RLS with no policies on purpose:
  only `allocate_file_id()` uses it. `rls_auto_enable()` is run by the
  `ensure_rls` event trigger to turn RLS on for new `public` tables, and
  PostgreSQL does not let an event-trigger function be called as an ordinary
  function. Keep both. Revoking its unneeded execute privileges is a later
  hardening change.
- **Migration versions:** the hosted versions are deployment timestamps, with
  the original identifiers in the names. Reconcile them before using the CLI to
  run migrations.

## What is here

| File | What it does |
| --- | --- |
| `migrations/20261118000000_identity.sql` | The `invitations` and `profiles` tables, row-level security, the invite-only sign-up hook and the trigger that activates an invited account |
| `migrations/20261122000000_admin_access.sql` | The Admin functions (17.3): list, invite, extend, revoke, change role, activate or deactivate. Only the service role can run them; each checks the caller is an active Admin |
| `migrations/20261123000000_cloud_files.sql` | Cloud files (17.4a): the `files` and `supplier_profiles` tables, the per-owner File ID counter, the private `workspace-files` bucket, owner and active-account policies, the 900 MB capacity check and the processing gate for results |
| `functions/admin/` | The Edge Function the Admin page calls (17.3): `handler.ts` holds the logic, `index.ts` wires the services |
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

## Setup (each step needs authorization)

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

## Sign-in setup (17.2b; each step needs authorization)

The sign-in pages (`/sign-in`, `/activate`, `/reset-password`) are in the app
but stay off on a site without these steps. Use placeholders here; real values
belong only in the dashboards. Dashboard menu names and the Gmail SMTP host
and ports below were not checked against the providers' current pages:
confirm them there before entering anything.

1. **Site URL and redirect URLs** (Authentication > URL Configuration). Set
   the Site URL to the site's own address. Add as redirect URLs the
   production origin with `/**`, Vercel preview URLs if previews should sign
   in, and `http://localhost:5173/**` for local development. The app only ever
   redirects to its own origin plus `/sign-in` or `/reset-password`, and those
   pages show a failed redirect's error.
2. **Google provider** (Authentication > Sign In / Providers > Google).
   Create an OAuth client of type "Web application" in the Google Cloud
   console. Use the callback URL Supabase shows there as the client's
   authorized redirect URI, then paste the client ID and secret into
   Supabase. The secret stays in Supabase; it never goes into this repository
   or the browser.
3. **Email sender** (Authentication > Emails > SMTP settings). Use the Gmail
   choice in `blueprint/hosted-services.md`: turn on 2-Step Verification for
   the sending Google account, create an app password, and enter host
   `smtp.gmail.com`, port 465 (SSL) or 587 (STARTTLS), that account as user
   name, the app password, and that address as sender. The confirmation and
   reset emails use Supabase's default templates.
4. **Vercel build variables.** Set `VITE_SUPABASE_URL` (the project URL) and
   `VITE_SUPABASE_PUBLISHABLE_KEY` (the publishable key, never the secret
   key), as described in `blueprint/vercel-deployment.md`, then redeploy.

Password reset links work only in the browser that asked for them, because
the PKCE flow keeps its code verifier there. The reset page says so.

## Admin setup (17.3; each step needs authorization)

1. **Apply the migration.** Run `migrations/20261122000000_admin_access.sql` once in the SQL editor, after the identity migration.
2. **Set the function's secrets** (Edge Functions > Secrets). Supabase provides `SUPABASE_URL` and the service-role key to every function; confirm the key's name in the dashboard, because `index.ts` reads `SUPABASE_SERVICE_ROLE_KEY`. Add `SITE_URL` (the site's address, no path), `SMTP_USER` (the Gmail account), `SMTP_PASSWORD` (its app password) and `SMTP_FROM` (the sender address). Real values go only in the dashboard, never in this repository or the browser.
3. **Deploy the function** named `admin` from `functions/admin/`. Keep the default setting that checks a JWT, and confirm that a signed-in browser's call passes the gateway.
4. Open `/admin` from the navigation while signed in as an Admin; the page opens for nobody else.

How it works: the page sends the signed-in person's access token to the function. The function verifies it, passes that user's ID to the SQL functions as `actor`, and they refuse anyone who is not an active Admin. An invitation email holds a link to `/activate?email=...` and no secret: the invitation record, the sign-up hook and email confirmation (or Google) bind the invitation to the address. Deactivating an account sets `active = false`, which row-level checks read on the next request, and then bans the user in Auth so their sessions cannot refresh. Reactivating reverses both. Files are kept.

## Cloud files setup (17.4a; each step needs authorization)

1. **Apply the migration.** Run `migrations/20261123000000_cloud_files.sql` once in the SQL editor, after the identity and admin migrations. It creates the private `workspace-files` bucket (50 MB per object).

How it works: every file row and Storage object belongs to the signed-in user (`auth.uid()`), and every policy also requires an active profile, so deactivation applies on the next request. Nobody else, Admins included, can read them, and the admin function never touches these tables. `allocate_file_id()` returns the caller's next six-digit base ID (first `100001`, never reused) in one atomic statement. A calculated result (a File ID with a function code, not imported) must name the same owner's input that is Ready or Needs Review and not archived. The full mapping check still runs in `shared/file-service.ts`, and this database check is not a defence against a modified copy of the app: `meta` is written by the browser, so a result marked `imported` (a real JSON `true`) skips it. Adding a file or object is refused once all stored files reach 900,000,000 bytes; mapping, archive and restore, and supplier profiles still work, and replacing a result's metadata does too. Replacing a stored object is refused at capacity as well, so a re-run of a result is refused once storage is full. The processing check is skipped when an update changes only `archived` or `archivedAt`, so archiving or restoring a result always works. The capacity check reads the bytes already stored, so one object written just below the threshold can overshoot it; the number of `files` rows per owner is not capped, which only invited, active accounts can use (finding F-63). Files cannot be deleted yet (18.1); Storage delete exists only to clean up a failed save.

For 17.4b: allocate the ID, upload the objects (`<owner uuid>/<file uuid>.csv`, `.original`, `.source.json`), insert the `files` row last (delete the objects if it fails), replace a result with Storage `update` rather than upsert (upsert needs the insert policy as well), and map `storage_full`, an RLS refusal on a Storage write at capacity, `not_active`, `file_ids_exhausted` and `processing_not_allowed` errors to messages.

17.4b (`client/src/lib/cloud-storage.ts`) follows that order. It also: pages every list (the API returns at most 1000 rows at a time); saves a supplier profile with update-then-insert, because upsert would also write `key`, which has no update grant; and, when the database refuses a write with a row-level security error, calls `file_storage_has_room()` to tell a full workspace (capacity message) from an inactive account (inactive message). The app opens a cloud workspace only after `is_active_account()` returns true, and a network error or a 5xx response is shown as "temporarily unavailable", never as an empty workspace. An empty list is checked with `is_active_account()` too (17.6), so an account deactivated mid-session sees the inactive message. Cloud workspaces start empty (no samples), and Clear my data is not offered there until 18.1 adds deletion. Replacing a result and archiving or mapping from two devices at once are last-write-wins, and a replace that fails after the CSV was replaced leaves new text with the old metadata until the replace is confirmed again.

## Not verified yet (17.7)

These are recorded as assumptions until hosted evidence exists:

- the hook rejects a non-invited password sign-up and a non-invited Google
  sign-up;
- Google sign-ups arrive with `email_confirmed_at` already set, so they
  activate at once;
- the profile is created only after confirmation, and an expired or revoked
  invitation creates none;
- a user can read only their own profile and update only its name;
- the grants `supabase_auth_admin` needs to read `invitations` are complete;
- the admin function on a real project: its gateway JWT check, the service-role key name, CORS from the site, and the service role's execute rights on the SQL functions;
- that Gmail SMTP on port 465 is reachable from an Edge Function and that nodemailer runs there;
- that a ban stops an already signed-in user's token refresh, and that sign-in then reports "user_banned";
- cloud files (17.4a): Storage sets `metadata.size` on each object; the capacity function can sum every user's objects despite their row-level security; Storage `update` is checked only against the update policy; the policies, the counter, the metadata value checks, the processing gate (advisory against a modified client) and the 900 MB refusal behave as the SQL describes;
- the cloud workspace in the app (17.4b): the calls in `cloud-storage.ts` against real Postgres and Storage (the order of writes, cleanup after a failed save, Storage `update`, the capacity-versus-inactive check, 1000-row pages) and how a paused project looks from the browser. The tests use a fake client;
- the sign-in pages against a real project: password and Google sign-in, the
  confirmation and reset emails, and the PKCE redirects back to the site.

## Sources

- Before User Created hook: https://supabase.com/docs/guides/auth/auth-hooks/before-user-created-hook
- Auth hooks (Postgres functions and grants): https://supabase.com/docs/guides/auth/auth-hooks
- Sign-up setting: https://supabase.com/docs/guides/auth/general-configuration
- Profile trigger pattern: https://supabase.com/docs/guides/auth/managing-user-data
- Row-level security: https://supabase.com/docs/guides/database/postgres/row-level-security
- Column privileges: https://supabase.com/docs/guides/database/postgres/column-level-security
