// Static checks on the Supabase SQL (build-plan 17.2a). They read the SQL as text and guard the
// safety rules against accidental edits; they do not run it. No Postgres runs in `npm run verify`,
// so the hosted behaviour (the hook, activation, row-level security) is proven only in 17.7.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const MIGRATION = readFileSync(new URL('../supabase/migrations/20261118000000_identity.sql', import.meta.url), 'utf8');
const BOOTSTRAP = readFileSync(new URL('../supabase/bootstrap-first-admin.sql', import.meta.url), 'utf8');

const HOOK = 'public.hook_before_user_created';
const REJECTION = 'Sign-up is by invitation only. Ask an administrator for an invitation.';

/** The SQL without `--` comments, so a rule mentioned only in a comment does not count. */
const code = (sql: string) => sql.replace(/--.*$/gm, '');

/** Each `create function` statement, up to the end of its `$$` body. */
function functions(sql: string): string[] {
  return [...code(sql).matchAll(/create function[\s\S]*?\$\$[\s\S]*?\$\$/g)].map((m) => m[0]);
}

/** Every safety rule the migration and bootstrap must keep, as a list of the rules broken. */
function sqlProblems(migration: string, bootstrap: string): string[] {
  const sql = code(migration);
  const problems: string[] = [];

  for (const [, table] of sql.matchAll(/create table (public\.\w+)/g))
    if (!sql.includes(`alter table ${table} enable row level security`)) problems.push(`no row level security on ${table}`);

  if (/grant[^;]*\bto\b[^;]*\banon\b/.test(sql)) problems.push('something is granted to anon');

  for (const fn of functions(migration))
    if (/\bsecurity definer\b/.test(fn) && !fn.includes("set search_path = ''")) problems.push('security definer function without empty search_path');

  if (!sql.includes(`grant execute on function ${HOOK}(jsonb) to supabase_auth_admin;`)) problems.push('hook not granted to supabase_auth_admin');
  if (!sql.includes(`revoke execute on function ${HOOK}(jsonb) from public, anon, authenticated;`)) problems.push('hook not revoked from clients');
  if (new RegExp(`grant execute on function ${HOOK}[^;]*\\bto\\b(?![^;]*supabase_auth_admin;)`).test(sql)) problems.push('hook granted to another role');
  const hook = functions(migration).find((fn) => fn.includes(HOOK));
  if (!hook || /\bsecurity definer\b/.test(hook)) problems.push('hook missing or security definer');
  if (!hook?.includes(`'message', '${REJECTION}'`) || !hook.includes("'http_code', 403")) problems.push('hook rejection is not the generic 403');

  if (!sql.includes("role text not null default 'Member' check (role in ('Admin', 'Member'))")) problems.push('invitation role default or check changed');
  if (!sql.includes("expires_at timestamptz not null default now() + interval '30 days'")) problems.push('invitation expiry is not 30 days');
  if (!sql.includes("role text not null check (role in ('Admin', 'Member'))")) problems.push('profile role check changed');

  const clientGrants = [...sql.matchAll(/grant ([^;]*?) on table (public\.\w+) to authenticated;/g)].map((m) => `${m[1]} on ${m[2]}`);
  if (clientGrants.join(' | ') !== 'select on public.profiles | update (name) on public.profiles') problems.push(`authenticated grants changed: ${clientGrants.join(' | ')}`);

  if (!sql.includes('revoke execute on function public.activate_invited_user() from public, anon, authenticated;')) problems.push('activation function not revoked from clients');
  if (!sql.includes('after insert or update of email_confirmed_at on auth.users')) problems.push('activation trigger missing');

  const inserts = [...code(bootstrap).matchAll(/insert into public\.invitations \(email, role\) values \('([^']*)', '(\w+)'\);/g)];
  if (inserts.length !== 1 || inserts[0][1] !== 'owner@example.com' || inserts[0][2] !== 'Admin') problems.push('bootstrap is not one placeholder Admin invitation');

  return problems;
}

describe('Supabase identity SQL', () => {
  it('keeps every safety rule', () => {
    expect(sqlProblems(MIGRATION, BOOTSTRAP)).toEqual([]);
  });

  // Each rule must actually fail when it is broken, or the check above proves nothing.
  const broken: [string, (sql: string) => string, string][] = [
    ['row level security removed', (s) => s.replace('alter table public.profiles enable row level security;', ''), 'no row level security on public.profiles'],
    ['a grant to anon', (s) => `${s}\ngrant select on table public.profiles to anon;`, 'something is granted to anon'],
    ['empty search_path removed', (s) => s.replace("security definer\nset search_path = ''", 'security definer'), 'security definer function without empty search_path'],
    ['hook granted to clients', (s) => `${s}\ngrant execute on function ${HOOK}(jsonb) to authenticated;`, 'hook granted to another role'],
    ['hook revoke removed', (s) => s.replace(`revoke execute on function ${HOOK}(jsonb) from public, anon, authenticated;`, ''), 'hook not revoked from clients'],
    ['hook made security definer', (s) => s.replace("returns jsonb\nlanguage plpgsql\n", 'returns jsonb\nlanguage plpgsql\nsecurity definer\n'), 'hook missing or security definer'],
    ['hook message reveals invitations', (s) => s.replace(REJECTION, 'This address has not been invited.'), 'hook rejection is not the generic 403'],
    ['default role changed', (s) => s.replace("default 'Member'", "default 'Admin'"), 'invitation role default or check changed'],
    ['expiry changed', (s) => s.replace("interval '30 days'", "interval '90 days'"), 'invitation expiry is not 30 days'],
    ['role writable by clients', (s) => s.replace('grant update (name) on table public.profiles', 'grant update (name, role) on table public.profiles'), 'authenticated grants changed: select on public.profiles | update (name, role) on public.profiles'],
    ['activation trigger removed', (s) => s.replace('after insert or update of email_confirmed_at on auth.users', 'after insert on auth.users'), 'activation trigger missing'],
  ];
  it.each(broken)('fails when %s', (_label, breakIt, problem) => {
    const changed = breakIt(MIGRATION);
    expect(changed).not.toBe(MIGRATION);
    expect(sqlProblems(changed, BOOTSTRAP)).toContain(problem);
  });

  it('fails when the bootstrap holds a real address or another role', () => {
    expect(sqlProblems(MIGRATION, BOOTSTRAP.replaceAll('owner@example.com', 'someone@gmail.com'))).toContain('bootstrap is not one placeholder Admin invitation');
    expect(sqlProblems(MIGRATION, BOOTSTRAP.replace("'Admin')", "'Member')"))).toContain('bootstrap is not one placeholder Admin invitation');
  });

  it('ignores rules that appear only in comments', () => {
    const commentedOut = MIGRATION.replace('alter table public.invitations enable row level security;', '-- alter table public.invitations enable row level security;');
    expect(sqlProblems(commentedOut, BOOTSTRAP)).toContain('no row level security on public.invitations');
  });
});
