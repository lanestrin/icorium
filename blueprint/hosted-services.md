# Hosted services design (17.1)

Status: **Supabase deployed; validation in progress.** The person reported a
development project on 2026-11-23; what is in place, what failed and what is
still to be checked is under "Hosted status" in `supabase/README.md`. Formal
hosted evidence stays in 17.7. Every further setup step needs the person's
separate authorization. Build-plan items 17.2-17.7 implement this design.

Scope: choose one managed implementation each for identity and sessions,
private file metadata and storage, and invitation and account email, under
the free-only rule in `project-plan.md` sections 8 and 9. All provider facts
come from the official pages cited, read on **2026-11-18**. Free plans
change, so re-check each cited page before 17.2 starts and before 17.7
records evidence.

## 1. Requirements matrix

Each row is a pass/fail criterion. "Not verified" means the official pages
read did not settle it.

| # | Requirement (plan section) | Supabase Free | Firebase Spark | Appwrite Free |
| --- | --- | --- | --- | --- |
| R1 | Free plan with no payment card (8, 9) | Free plan exists; card requirement not stated [S1] | "No payment method needed" [F1] | "100% free"; card requirement not stated [A1] |
| R2 | Email/password and Google sign-in (3, 4) | Both supported; password sign-up and invite emails need custom SMTP [S5] | "Authentication (most options)" free [F1] | OAuth2 providers configurable; Google not named in the pages read [A4] |
| R3 | Invitation-only activation; Google cannot bypass it (4) | "Before User Created" hook on Free can reject unknown emails, including OAuth [S6] | Needs blocking functions: Identity Platform plus Cloud Functions, which needs Blaze (card) [F3][F4] | No invite-only control found; email policies only filter domains [A5] |
| R4 | 30-day invitation expiry, resend, extend, revoke (4) | Built-in invite expiry not stated, so the app stores its own invitation record (see contract 6) [S4] | Not reached (R3 fails) | Not reached (R3 fails) |
| R5 | Email delivery to any invitee, sender setup, recovery email (4, 8) | Built-in sender reaches team members only, 2 per hour, "not meant for production"; custom SMTP required [S5] | Password reset 150/day; invitation email would need own sending [F5] | Custom SMTP available; Free availability not stated [A4] |
| R6 | Private files enforced per owner, owner from session (5) | Storage and tables use RLS policies on `auth.uid()`; no access without a policy [S7][S8] | Cloud Storage unavailable on Spark since 2026-02-03; API returns 402/403 [F2] | File-level permissions exist [A6] |
| R7 | Deactivation blocks an already signed-in session (4) | Ban API exists, but its session effect is not stated; access token lasts up to 1 hour. Met by an RLS "active account" check (contract 7) [S9] | Disabled users are rejected only on a server check with `checkRevoked`, otherwise after up to 1 hour [F6] | Not verified [A6] |
| R8 | Storage and download limits, behavior at them (9) | 1 GB files, 500 MB database, 5 GB egress, 50 MB per file; Free over-quota behavior not stated [S1][S2] | Firestore 1 GiB; product "shut off for the remainder of that month" [F1][F4] | At bandwidth limit "API access will be denied"; at storage limit uploads disabled [A2] |
| R9 | Existing files stay accessible within documented limits (9) | **Conflict:** "Free projects are paused after 1 week of inactivity"; one-click restore within the restore window [S1][S3] | Fails: no file storage on Spark [F2] | **Fails:** bandwidth limit denies all API access [A2] |
| R10 | Upgrade and export paths (8, 9) | Pro from $25/month removes pausing; export with `supabase db dump` and Storage download [S1][S3][S10] | Blaze pay-as-you-go | Pro upgrade; export not verified |
| R11 | Account, domain or card prerequisites (8) | Supabase account; Google OAuth client; SMTP sender (see section 3) | Card needed for Storage and functions | Not verified |
| R12 | Trusted code without client admin credentials (8) | Edge Functions (500,000 invocations on Free); secret key "never" in the browser [S1][S8] | Cloud Functions need Blaze [F4] | Functions on Free, limits not read |
| R13 | Protect the last active Admin (4) | Enforced in the trusted role-change function (contract 5) | Not reached | Not reached |

### Result

- **Firebase Spark fails** R3, R6 and R9 without a card: Storage, Cloud
  Functions and blocking functions all need Blaze.
- **Appwrite Free fails** R3 (no invite-only control found) and R9 (reaching
  the bandwidth limit denies access to existing files). Its quota numbers
  were not readable from the pricing page.
- **Supabase Free passes** R1-R8 and R10-R13, with one documented R9
  conflict (inactivity pausing) and one email prerequisite (custom SMTP).
  Both are decisions for the person, recorded in section 2.

## 2. Selected design

Decided by the person on 2026-11-18.

| Responsibility | Implementation |
| --- | --- |
| Identity and sessions | Supabase Auth (Free): email/password, Google, password recovery, "Before User Created" hook for invite-only access |
| Metadata and private files | Supabase Postgres tables and a private Supabase Storage bucket, both behind row-level security |
| Trusted operations | Supabase Edge Functions (invitations, roles, deactivation). Vercel stays a static site with no functions |
| Invitation and account email | Supabase Auth custom SMTP through a Gmail account with an app password |

Why: Supabase is the only candidate that passes the core requirements
without a card. One provider covers identity, storage and trusted code, so
there is a single account and a single export path.

Accepted limits (the plan allows "documented limits"):

- **Inactivity pausing.** A project with no activity for a week pauses
  [S1]. Files are unreachable until it is restored with one click in the
  dashboard [S3]. The restore window is given as one year in the text and
  as 90 days in a screenshot on the same page, so plan for the shorter one. The app shows a clear "workspace temporarily unavailable"
  message when the project cannot be reached, and 17.7's operating guide
  covers restoring it. No keep-alive job is added.
- **No backups on Free** [S1][S10]. The operating guide schedules regular
  exports (section 5).
- **Over-quota behavior on Free is not documented** [S2]. The app enforces
  its own upload capacity check (contract 8) and does not rely on a
  provider signal.
- **Gmail sender.** 500 emails/day [E4]. Supabase's custom SMTP default is
  30 messages per hour [S5]. Google calls app passwords "not recommended",
  and one is revoked when the account password changes [E5]. The
  invitation function reports a failed send as a failure.
- **Vercel Hobby** remains for "personal or non-commercial use" only [V1],
  as it is today. This design adds no Vercel functions.

## 3. Email sender

Supabase's built-in email cannot reach invitees [S5], so any invitation needs
a custom SMTP sender. Options found:

| Option | Free limit | Prerequisite | Risk |
| --- | --- | --- | --- |
| Resend Free | 3,000/month, 100/day, 3 domains [E1] | A **verified domain** to send to anyone; `resend.dev` only reaches the account's own address [E2][E3] | A domain is not free, which conflicts with free-only unless one is already owned |
| Gmail SMTP with an app password | 500 emails/day [E4] | 2-Step Verification on the sending Google account [E5] | Google says app passwords "aren't recommended"; revoked on password change; the sender is a personal address [E5] |

Chosen: **Gmail SMTP with an app password** (the person, 2026-11-18).
Moving to Resend later only changes the SMTP settings, and it needs a
verified domain.

## 4. Contracts

These are logical contracts for 17.2-18.3. Exact SQL, migrations and
function names belong in each feature's spec, and they must keep these
rules.

1. **Owner identity.** The owner key is the Supabase Auth user ID (a UUID,
   the JWT `sub`, `auth.uid()` in policies) [S8]. It always comes from the
   verified session, never from a request field.

2. **File identity (the person, 2026-11-18).**
   - Every stored file has an internal `uuid` primary key. It is used for
     database relationships, Storage object paths and any future sharing,
     and it is never shown to the user or exported.
   - The user-facing File ID keeps today's convention, scoped to each
     owner. Base IDs are six digits counting up from `100001`, and results
     add `-V`, `-M` or `-C`. A per-owner counter allocates base IDs
     atomically in one database operation, so concurrent uploads from two
     devices cannot collide. The counter only increases, so an ID is never
     reused within an owner's workspace, even after deletion (18.1).
   - The database enforces uniqueness on `(owner_id, file_id)`.
   - Re-running a function with `replace: true` updates the existing result
     row, so its File ID and UUID stay the same. Without it, the request
     fails with the existing conflict naming the result.
   - Exports are unchanged: inputs carry `file_id`, and results add
     `result_id` as their first generated column. Both hold the six-digit
     IDs, not the UUID.
   - Uploading a CSV whose `file_id` came from another workspace still gets
     a new ID from the uploader's counter, as today.

3. **Imported results.** A result's embedded `file_id` is looked up only in
   the uploader's own workspace. If it names an input there and the original
   columns and values match exactly (generated columns excluded, column
   order ignored), the result is linked: it stores that input's UUID as its
   source. Otherwise it stores the embedded ID as `importedFrom` provenance,
   with no source UUID, and is never shown as linked. An ID from another
   user's export can never link, because the lookup is owner-scoped.

4. **Ownership enforcement.** Row-level security on every file table allows
   only rows where `owner_id = auth.uid()` and the account is active.
   Storage objects sit in one private bucket at
   `<owner uuid>/<file uuid>.csv`, with policies that match the owner
   [S7][S8]. This covers list, metadata, upload, preview, download, process
   or replace, compare, archive or restore, correction (18.3) and deletion
   (18.1). No policy grants an Admin access to other owners' files. Edge
   Functions use the secret key only for account operations and never read
   file tables or Storage; the key never reaches the browser [S8].

5. **Initial Admin bootstrap (the person, 2026-11-18).** A one-time,
   documented step in the Supabase SQL editor inserts a pending invitation
   with role Admin for the project owner's email. The owner then accepts it
   through the normal invitation flow. No application code path creates an
   Admin without an existing active Admin.

6. **Invitations, roles and account state.**
   - Invitations live in an app table: email, role (`Admin` or `Member`,
     default `Member`), created, `expires_at` (30 days), and revoked and
     accepted markers. Pending, accepted, expired and revoked are derived
     from these.
   - Supabase's own invite-link expiry is not documented [S4], so this
     table, not the provider link, decides validity.
   - Profiles hold user ID, name, role and `active`.
   - Only Admin-checked Edge Functions change invitations, roles or
     `active`.
   - The "Before User Created" hook rejects any new user, password or
     Google, whose email has no pending, unexpired, unrevoked invitation
     [S6]. Accepting an invitation marks it accepted, so it cannot create a
     second account.
   - 17.3 decisions (the person, 2026-11-22). The Admin function sends the
     invitation email through Gmail SMTP, linking to `/activate?email=...`.
     It carries no token: the invitation record, the hook and email
     confirmation (or Google) bind it to the address. Resend emails a
     pending invitation and keeps its expiry. Extend sets `expires_at` to
     now plus 30 days for a pending or expired invitation and sends
     nothing. Revoke works on pending or expired invitations; accepted and
     revoked ones never change. If the first email fails, the new
     invitation is discarded and the failure reported.
   - Role changes and deactivations that would leave no active Admin are
     refused inside the same transaction.

7. **Deactivation.** Setting `active = false` takes effect on the next
   request, because every row-level security policy requires an active
   account, whatever the remaining access-token lifetime (up to one hour
   [S9]). The deactivation function then bans the user with
   `auth.admin.updateUserById` (`ban_duration`), so refresh stops (the person,
   2026-11-22; the admin sign-out API [S11] needs the user's own access
   token, so it cannot be called with only a user ID). Reactivation sets `active = true` and lifts the ban.
   Files are kept throughout.

8. **Capacity.**
   - Free limits: 1 GB file storage, 500 MB database, 5 GB egress and 50 MB
     per file, shared across all users of the project [S1].
   - The app's existing limits stay as they are (for example 20 MB per
     converted source file).
   - Because Free over-quota behavior is undocumented, uploads are refused
     with an actionable message when stored bytes reach an app threshold
     below 1 GB. 17.4a defines it: new files, objects and File IDs are
     refused once stored objects total 900,000,000 bytes, checked in
     `file_storage_has_room()`. Replacing a stored object is refused at
     capacity too (decided 2026-11-23, so overwriting cannot grow storage).
     Mapping, archive and supplier profiles still work. Existing files
     stay readable.
   - Invitations are refused, and the failure reported, when email sending
     fails or is rate-limited.
   - A paused project is shown as temporarily unavailable, not as missing
     data.

**To confirm in 17.2 against the non-production project:** whether users
created through an invitation also pass through the "Before User Created"
hook, and how the "Allow new users to sign up" setting [S6] interacts with
invitations and first-time Google sign-in. The docs read do not say.

**Constraint for future sharing or transfers.** UUIDs keep relationships
stable, but per-owner File IDs mean a moved file may already have its File
ID in use in the receiving workspace. A future sharing or transfer spec must
decide how that is displayed, without changing the existing File IDs of
either owner's files.

## 5. Verification, setup and exit

### Verification approach

- **Unit and component tests** (`npm run verify`) cover the logic against a
  fake implementation of the existing `Storage` interface
  (`shared/storage.ts`), plus mocked auth responses: ID allocation rules,
  owner scoping in the file service, invitation states, last-Admin
  protection, capacity refusals, and failed sends. Mocks prove none of the
  hosted behavior.
- **Hosted evidence (17.7)** runs against a separate non-production
  Supabase project and records real results for:
  - invitation email delivery and acceptance, including expired and revoked
    invitations;
  - password and Google sign-in, and a Google sign-in by a non-invited
    email being rejected;
  - a file uploaded on one device appearing on another;
  - one user being unable to read another user's file by ID or by Storage
    path;
  - deactivating a signed-in user blocking their next request;
  - the capacity refusal.

  Each result is recorded with its date. Nothing is claimed without its
  evidence.

### Setup checklist (reported done for the development project; repeating a step needs authorization)

1. Create a Supabase account and one Free project for non-production
   verification (and, later, the prototype project).
2. Create a Google OAuth client and add it to Supabase Auth.
3. Turn on 2-Step Verification on the sending Google account, create an app
   password, and enter it in Supabase's custom SMTP settings.
4. Run the one-time Admin bootstrap SQL (contract 5).
5. Add the Supabase project URL and publishable key to the Vercel build.
   These are public values; the secret key goes only into Edge Function
   secrets.

The card requirement for Supabase Free is not stated on the pages read
[S1]. Confirm it at sign-up before entering anything.

### Export and upgrade path

- **Export:** `supabase db dump` for tables, and Storage objects downloaded
  from the dashboard [S10][S3]. Run this regularly, because Free has no
  backups.
- **Upgrade:** Supabase Pro (from $25/month) raises quotas and stops
  inactivity pausing [S1]. That needs a plan change and the person's
  approval; it is not authorized here.
- **Replace a provider:** export the data above, then put the same
  contracts on a new implementation of the `Storage` interface. No
  alternative is built in advance.

## Sources (read 2026-11-18)

- [S1] https://supabase.com/pricing
- [S2] https://supabase.com/docs/guides/platform/billing-on-supabase
- [S3] https://supabase.com/docs/guides/platform/upgrading
- [S4] https://supabase.com/docs/reference/javascript/auth-admin-inviteuserbyemail
- [S5] https://supabase.com/docs/guides/auth/auth-smtp and https://supabase.com/docs/guides/auth/rate-limits
- [S6] https://supabase.com/docs/guides/auth/auth-hooks/before-user-created-hook and https://supabase.com/docs/guides/auth/general-configuration
- [S7] https://supabase.com/docs/guides/storage/security/access-control
- [S8] https://supabase.com/docs/guides/database/postgres/row-level-security
- [S9] https://supabase.com/docs/guides/auth/sessions and https://supabase.com/docs/reference/javascript/auth-admin-updateuserbyid
- [S10] https://supabase.com/docs/guides/platform/backups
- [S11] https://supabase.com/docs/reference/javascript/auth-admin-signout
- [F1] https://firebase.google.com/pricing
- [F2] https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024
- [F3] https://firebase.google.com/docs/auth/extend-with-blocking-functions
- [F4] https://firebase.google.com/docs/projects/billing/firebase-pricing-plans
- [F5] https://firebase.google.com/docs/auth/limits
- [F6] https://firebase.google.com/docs/auth/admin/manage-sessions
- [A1] https://appwrite.io/pricing
- [A2] https://appwrite.io/docs/advanced/billing/free
- [A4] https://appwrite.io/docs/products/auth/oauth2 and https://appwrite.io/docs/products/messaging/smtp
- [A5] https://appwrite.io/docs/products/auth/security and https://appwrite.io/docs/products/auth/team-invites
- [A6] https://appwrite.io/docs/products/storage/permissions and https://appwrite.io/docs/products/auth/users
- [E1] https://resend.com/pricing
- [E2] https://resend.com/docs/dashboard/domains/introduction
- [E3] https://resend.com/docs/knowledge-base/403-error-resend-dev-domain
- [E4] https://support.google.com/mail/answer/22839
- [E5] https://support.google.com/accounts/answer/185833
- [V1] https://vercel.com/legal/terms (section 4, Hobby plan)
