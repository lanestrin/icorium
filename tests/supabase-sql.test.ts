// Static checks on the Supabase SQL (build-plan 17.2a). They read the SQL as text and guard the
// safety rules against accidental edits; they do not run it. No Postgres runs in `npm run verify`,
// so the hosted behaviour (the hook, activation, row-level security) is proven only in 17.7.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/** A SQL file with LF line endings, whatever line endings the checkout uses (core.autocrlf on Windows). */
const readSql = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const MIGRATION = readSql('../supabase/migrations/20261118000000_identity.sql');
const BOOTSTRAP = readSql('../supabase/bootstrap-first-admin.sql');

const HOOK = 'public.hook_before_user_created';
const REJECTION = 'Sign-up is by invitation only. Ask an administrator for an invitation.';

/** The SQL without `--` comments, so a rule mentioned only in a comment does not count. */
const code = (sql: string) => sql.replace(/--.*$/gm, '');

/** Each `create function` statement, up to the end of its `$$` body. */
function functions(sql: string): string[] {
  return [...code(sql).matchAll(/create function[\s\S]*?\$\$[\s\S]*?\$\$/g)].map((m) => m[0]);
}

/**
 * The SQL as Postgres compares it for these checks: lowercase, without identifier quotes and with whitespace
 * collapsed, so `GRANT ... TO "authenticated"` is caught like `grant ... to authenticated`.
 */
const normalized = (sql: string) => sql.toLowerCase().replace(/"/g, '').replace(/\s+/g, ' ');

/** Every `grant <privileges> on <object> to <roles>;` statement, normalized, with roles split. */
function grants(sql: string): { privileges: string; object: string; roles: string[] }[] {
  return [...normalized(sql).matchAll(/\bgrant (.+?) on (.+?) to (.+?);/g)].map(([, privileges, object, roles]) => ({
    privileges,
    object: object.replace(/^table /, ''),
    // `with grant option` and `granted by <role>` follow the role list; they are not roles.
    roles: roles.replace(/ (with grant option|granted by \S+)/g, '').split(',').map((role) => role.trim()),
  }));
}

/** The only two policies public.profiles may have: a signed-in user reads, and renames, their own row. */
const PROFILE_POLICIES = [
  'for select to authenticated using ((select auth.uid()) = user_id)',
  'for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)',
];

/** The rule (everything after the table name) of each `create policy` on public.profiles, normalized. */
function profilePolicies(sql: string): string[] {
  // [^;] keeps each match inside one statement, so a later `create index ... on public.profiles` is not read as a rule.
  const statements = normalized(sql).matchAll(/\bcreate policy [^;]+? on (?:public\.)?profiles ([^;]+?);/g);
  return [...statements].map(([, rule]) => rule.trim());
}

/** Every safety rule the migration and bootstrap must keep, as a list of the rules broken. */
function sqlProblems(migration: string, bootstrap: string): string[] {
  const sql = code(migration);
  const problems: string[] = [];

  for (const [, table] of sql.matchAll(/create table (public\.\w+)/g))
    if (!sql.includes(`alter table ${table} enable row level security`)) problems.push(`no row level security on ${table}`);

  if (/disable row level security/.test(normalized(sql))) problems.push('row level security disabled');

  // The profile grants reach every row, so these policies are the only row filter. Policies add up, so an
  // extra or widened policy would expose every user's email and role.
  const policies = profilePolicies(sql);
  if (policies.some((policy) => !PROFILE_POLICIES.includes(policy)) || PROFILE_POLICIES.some((policy) => !policies.includes(policy)))
    problems.push('profile policies are not exactly own-row read and rename');
  // A later alter or drop would change the policies above after they are created.
  if (/\b(alter|drop) policy [^;]* on (public\.)?profiles\b/.test(normalized(sql))) problems.push('a profile policy is altered or dropped');

  if (/grant[^;]*\bto\b[^;]*\banon\b/.test(normalized(sql))) problems.push('something is granted to anon');

  // Broad grants would quietly reach every table or function, including the hook and invitations.
  if (grants(sql).some((grant) => /^all (tables|functions|routines|sequences) in schema /.test(grant.object))) problems.push('a schema-wide grant');
  // The hook may run only as the Auth service role, whatever privilege or role list a grant uses.
  if (grants(sql).some((grant) => grant.object.startsWith(`function ${HOOK}`) && grant.roles.some((role) => role !== 'supabase_auth_admin')))
    problems.push('hook granted to another role');
  // Browser clients (authenticated, or every role through public) get exactly two table privileges.
  const clientGrants = grants(sql)
    .filter((grant) => !grant.object.startsWith('function ') && grant.roles.some((role) => role === 'authenticated' || role === 'public'))
    .map((grant) => `${grant.privileges} on ${grant.object}`);
  if (clientGrants.join(' | ') !== 'select on public.profiles | update (name) on public.profiles') problems.push(`client table grants changed: ${clientGrants.join(' | ')}`);

  for (const fn of functions(migration))
    if (/\bsecurity definer\b/.test(fn) && !fn.includes("set search_path = ''")) problems.push('security definer function without empty search_path');

  if (!sql.includes(`grant execute on function ${HOOK}(jsonb) to supabase_auth_admin;`)) problems.push('hook not granted to supabase_auth_admin');
  if (!sql.includes(`revoke execute on function ${HOOK}(jsonb) from public, anon, authenticated;`)) problems.push('hook not revoked from clients');
  const hook = functions(migration).find((fn) => fn.includes(HOOK));
  if (!hook || /\bsecurity definer\b/.test(hook)) problems.push('hook missing or security definer');
  if (!hook?.includes(`'message', '${REJECTION}'`) || !hook.includes("'http_code', 403")) problems.push('hook rejection is not the generic 403');

  if (!sql.includes("role text not null default 'Member' check (role in ('Admin', 'Member'))")) problems.push('invitation role default or check changed');
  if (!sql.includes("expires_at timestamptz not null default now() + interval '30 days'")) problems.push('invitation expiry is not 30 days');
  if (!sql.includes("role text not null check (role in ('Admin', 'Member'))")) problems.push('profile role check changed');

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
    ['role writable by clients', (s) => s.replace('grant update (name) on table public.profiles', 'grant update (name, role) on table public.profiles'), 'client table grants changed: select on public.profiles | update (name, role) on public.profiles'],
    ['hook granted to clients beside the Auth role', (s) => `${s}\ngrant execute on function ${HOOK}(jsonb) to authenticated, supabase_auth_admin;`, 'hook granted to another role'],
    ['all privileges on the hook', (s) => `${s}\ngrant all on function ${HOOK}(jsonb) to authenticated;`, 'hook granted to another role'],
    ['a schema-wide function grant', (s) => `${s}\ngrant execute on all functions in schema public to authenticated;`, 'a schema-wide grant'],
    ['a schema-wide table grant', (s) => `${s}\ngrant insert on all tables in schema public to authenticated;`, 'a schema-wide grant'],
    ['a client grant without the table keyword', (s) => `${s}\ngrant insert on public.profiles to authenticated;`, 'client table grants changed: select on public.profiles | update (name) on public.profiles | insert on public.profiles'],
    ['a client grant among several roles', (s) => `${s}\ngrant all on table public.profiles to service_role, authenticated;`, 'client table grants changed: select on public.profiles | update (name) on public.profiles | all on public.profiles'],
    ['a grant to every role', (s) => `${s}\ngrant select on table public.invitations to public;`, 'client table grants changed: select on public.profiles | update (name) on public.profiles | select on public.invitations'],
    ['invitations readable by clients', (s) => `${s}\ngrant select on public.invitations to authenticated;`, 'client table grants changed: select on public.profiles | update (name) on public.profiles | select on public.invitations'],
    ['activation trigger removed', (s) => s.replace('after insert or update of email_confirmed_at on auth.users', 'after insert on auth.users'), 'activation trigger missing'],
    ['row level security disabled later', (s) => `${s}\nalter table public.profiles disable row level security;`, 'row level security disabled'],
    ['every profile readable', (s) => s.replace('for select\n  to authenticated\n  using ((select auth.uid()) = user_id)', 'for select\n  to authenticated\n  using (true)'), 'profile policies are not exactly own-row read and rename'],
    ['the read policy given to every role', (s) => s.replace('for select\n  to authenticated', 'for select\n  to public'), 'profile policies are not exactly own-row read and rename'],
    ['the rename check removed', (s) => s.replace('\n  with check ((select auth.uid()) = user_id)', ''), 'profile policies are not exactly own-row read and rename'],
    ['an extra profile policy', (s) => `${s}\ncreate policy "Anyone signed in" on public.profiles for select to authenticated using (true);`, 'profile policies are not exactly own-row read and rename'],
    ['the read policy removed', (s) => s.replace(/create policy "Users can read their own profile"[^;]*;/, ''), 'profile policies are not exactly own-row read and rename'],
    ['an uppercase client grant', (s) => `${s}\nGRANT SELECT ON public.invitations TO authenticated;`, 'client table grants changed: select on public.profiles | update (name) on public.profiles | select on public.invitations'],
    ['a quoted role name', (s) => `${s}\ngrant select on public.invitations to "authenticated";`, 'client table grants changed: select on public.profiles | update (name) on public.profiles | select on public.invitations'],
    ['a grant with grant option', (s) => `${s}\ngrant select on public.invitations to authenticated with grant option;`, 'client table grants changed: select on public.profiles | update (name) on public.profiles | select on public.invitations'],
    ['a grant naming its grantor', (s) => `${s}\ngrant insert on public.profiles to authenticated granted by postgres;`, 'client table grants changed: select on public.profiles | update (name) on public.profiles | insert on public.profiles'],
    ['an uppercase hook grant', (s) => `${s}\nGRANT EXECUTE ON FUNCTION ${HOOK}(jsonb) TO authenticated;`, 'hook granted to another role'],
    ['an uppercase grant to anon', (s) => `${s}\nGRANT SELECT ON public.profiles TO ANON;`, 'something is granted to anon'],
    ['a profile policy widened later', (s) => `${s}\nalter policy "Users can read their own profile" on public.profiles using (true);`, 'a profile policy is altered or dropped'],
    ['a profile policy dropped later', (s) => `${s}\ndrop policy "Users can rename their own profile" on public.profiles;`, 'a profile policy is altered or dropped'],
  ];

  // Harmless later statements on public.profiles must not be read as policies (F-40).
  it.each([
    ['an index', 'create index profiles_name on public.profiles (name);'],
    ['a grant to the service role', 'grant select on public.profiles to service_role;'],
  ])('accepts %s on public.profiles', (_label, statement) => {
    expect(sqlProblems(`${MIGRATION}\n${statement}`, BOOTSTRAP)).toEqual([]);
  });
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

// ---------------------------------------------------------------------------------------------
// Admin access SQL (build-plan 17.3): trusted functions called only by the Admin Edge Function.
// ---------------------------------------------------------------------------------------------
const ADMIN = readSql('../supabase/migrations/20261122000000_admin_access.sql');

/** The name and `(argument types)` of each function the migration creates, for grant matching. */
function adminSignatures(sql: string): { name: string; types: string }[] {
  return [...code(sql).matchAll(/create function public\.(\w+)\(([^)]*)\)/g)].map(([, name, args]) => ({
    name,
    types: args.split(',').map((arg) => arg.trim().split(/\s+/)[1]).join(', '),
  }));
}

/** Every safety rule the admin migration must keep, as a list of the rules broken. */
function adminProblems(sql: string): string[] {
  const problems: string[] = [];
  const text = code(sql);
  const norm = normalized(sql);
  const signatures = adminSignatures(sql);
  const callable = signatures.filter((fn) => fn.name !== 'admin_assert');

  for (const fn of functions(sql)) {
    if (!/\bsecurity definer\b/.test(fn) || !fn.includes("set search_path = ''")) problems.push('admin function is not security definer with an empty search_path');
  }
  for (const fn of signatures) {
    const target = `function public.${fn.name}(${fn.types})`;
    if (!text.includes(`revoke execute on ${target} from public, anon, authenticated;`)) problems.push(`${fn.name} not revoked from clients`);
  }
  for (const fn of callable)
    if (!text.includes(`grant execute on function public.${fn.name}(${fn.types}) to service_role;`)) problems.push(`${fn.name} not granted to service_role`);
  if (grants(sql).some((grant) => grant.roles.some((role) => role !== 'service_role'))) problems.push('a grant to a role other than service_role');
  if (grants(sql).some((grant) => grant.object.startsWith('function public.admin_assert'))) problems.push('the internal check is granted');
  if (/\b(create|alter|drop) policy\b|\bcreate table\b|\bdisable row level security\b/.test(norm)) problems.push('tables or policies changed');

  // Every callable function starts with the Admin check, before touching any table.
  for (const fn of functions(sql)) {
    if (fn.includes('create function public.admin_assert')) continue;
    const body = fn.slice(fn.indexOf('begin'));
    const check = body.indexOf('public.admin_assert(actor)');
    const firstTable = body.search(/\b(from|insert into|update|delete from) public\./);
    if (check === -1) problems.push('a function skips the Admin check');
    // Role and access changes lock the Admin profiles first; the check still precedes every write.
    else if (firstTable !== -1 && firstTable < check && !/for update;\s*perform public\.admin_assert/.test(body)) problems.push('a function reads a table before the Admin check');
  }
  const assertion = functions(sql).find((fn) => fn.includes('create function public.admin_assert'));
  if (!assertion?.includes("profile.role = 'Admin' and profile.active") || !assertion.includes("raise exception 'not_admin'")) problems.push('the Admin check is not an active Admin test');

  for (const name of ['admin_set_role', 'admin_set_active']) {
    const fn = functions(sql).find((f) => f.includes(`create function public.${name}`)) ?? '';
    if (!fn.includes("profile.role = 'Admin' and profile.active for update") || !fn.includes("raise exception 'last_admin'")) problems.push(`${name} lacks the locked last-Admin guard`);
  }
  const discard = functions(sql).find((f) => f.includes('admin_discard_unsent_invitation')) ?? '';
  if (!/invitation\.accepted_at is null/.test(discard)) problems.push('discard can remove an accepted invitation');
  if (/\bstorage\.|\bfiles\b/.test(text)) problems.push('touches files or storage');
  return problems;
}

describe('Supabase admin access SQL', () => {
  it('keeps every safety rule', () => {
    expect(adminProblems(ADMIN)).toEqual([]);
  });

  it('lists the nine functions', () => {
    expect(adminSignatures(ADMIN).map((fn) => fn.name)).toEqual([
      'admin_assert', 'admin_list', 'admin_create_invitation', 'admin_discard_unsent_invitation', 'admin_pending_invitation',
      'admin_extend_invitation', 'admin_revoke_invitation', 'admin_set_role', 'admin_set_active',
    ]);
  });

  const broken: [string, (sql: string) => string, string][] = [
    ['empty search_path removed', (s) => s.replace("security definer\nset search_path = ''", 'security definer'), 'admin function is not security definer with an empty search_path'],
    ['a function granted to clients', (s) => `${s}\ngrant execute on function public.admin_list(uuid) to authenticated;`, 'a grant to a role other than service_role'],
    ['the internal check granted', (s) => `${s}\ngrant execute on function public.admin_assert(uuid) to service_role;`, 'the internal check is granted'],
    ['a revoke removed', (s) => s.replace('revoke execute on function public.admin_list(uuid) from public, anon, authenticated;', ''), 'admin_list not revoked from clients'],
    ['service_role grant removed', (s) => s.replace('grant execute on function public.admin_set_role(uuid, uuid, text) to service_role;', ''), 'admin_set_role not granted to service_role'],
    ['the Admin check skipped', (s) => s.replace(/(create function public\.admin_list[\s\S]*?)perform public\.admin_assert\(actor\);/, '$1'), 'a function skips the Admin check'],
    ['the Admin check ignores active', (s) => s.replace("profile.role = 'Admin' and profile.active\n", "profile.role = 'Admin'\n"), 'the Admin check is not an active Admin test'],
    ['the last-Admin guard removed', (s) => s.replace(/(create function public\.admin_set_active[\s\S]*?)raise exception 'last_admin';/, "$1raise exception 'other';"), 'admin_set_active lacks the locked last-Admin guard'],
    ['the Admin lock removed', (s) => s.replace(/(create function public\.admin_set_role[\s\S]*?profile\.active) for update;/, '$1;'), 'admin_set_role lacks the locked last-Admin guard'],
    ['discard of accepted invitations', (s) => s.replace('where invitation.id = target_id and invitation.accepted_at is null;', 'where invitation.id = target_id;'), 'discard can remove an accepted invitation'],
    ['a policy added', (s) => `${s}\ncreate policy "Admins read" on public.profiles for select to authenticated using (true);`, 'tables or policies changed'],
    ['a function reading Storage', (s) => `${s}\n-- x\ncreate function public.peek() returns void language sql as $$ select 1 from storage.objects $$;`, 'touches files or storage'],
  ];
  it.each(broken)('fails when %s', (_label, breakIt, problem) => {
    const changed = breakIt(ADMIN);
    expect(changed).not.toBe(ADMIN);
    expect(adminProblems(changed)).toContain(problem);
  });
});
