import { ADAPTERS, ADAPTER_FIELDS, adapterUnit, FIELD_ALIASES, type StatedUnit } from './types';
import { blockingIssue, type CanonicalField, type FieldMapping, type IssueCode, type MappingOrigin, type ValidationIssue } from './ingestion';

// Header matching (build-plan 19.2): which source column holds each field. Levels, best first:
//   exact      the columns of one partner schema (approved)
//   normalized a partner column written with other case, spacing or separators
//   alias      a known other name (FIELD_ALIASES in shared/types.ts)
//   manual     a column the person chose
// Every suggestion except an exact partner match still needs approval (19.4). Two columns for one field, or one
// column for two fields, is reported, never resolved by taking the first. Nothing here reads values or checks units.

export type Adapter = (typeof ADAPTERS)[number];

/** Lower case, with each run of spaces, underscores, hyphens and dots as one space. Unit words (kg, lb, g, %, pct, fraction) are kept. */
export const normalizeHeader = (name: string) => name.trim().toLowerCase().replace(/[\s_.-]+/g, ' ').trim();

export type PartnerMatch =
  | { kind: 'partner'; adapter: Adapter }
  | { kind: 'several'; names: string[] }
  | { kind: 'duplicate'; column: string }
  | null;

/**
 * The exact rule: which partner schema has all six columns among the headers. `duplicates` names headers that
 * appeared more than once. Two schemas, or a duplicated column of the one match, is reported, never first-wins.
 */
export function matchPartner(headers: readonly string[], duplicates: readonly string[] = []): PartnerMatch {
  const matches = ADAPTERS.filter((a) => a.columns.every((c) => headers.includes(c)));
  if (!matches.length) return null;
  if (matches.length > 1) return { kind: 'several', names: matches.map((a) => a.name) };
  const column = matches[0].columns.find((c) => duplicates.includes(c));
  return column ? { kind: 'duplicate', column } : { kind: 'partner', adapter: matches[0] };
}

/** The message for a match upload and conversion refuse, or undefined when the match is usable or absent. */
export function partnerMatchProblem(match: PartnerMatch): string | undefined {
  if (match?.kind === 'several') return `This file has the columns of more than one partner format (${match.names.join(', ')}); keep one set of columns.`;
  if (match?.kind === 'duplicate') return `The column ${match.column} appears more than once; keep one.`;
  return undefined;
}

export interface MappingSuggestion {
  /** The adapter name, set only for an exact partner match. */
  partner?: string;
  mappings: { mapping: FieldMapping; statedUnit?: StatedUnit }[];
  /** All blocking. A field with an issue has no mapping. */
  issues: ValidationIssue[];
  /** Headers no mapping uses, in header order. */
  unusedColumns: string[];
}

const LABEL: Record<CanonicalField, string> = { batchId: 'batch ID', sampleDate: 'sample date', massKg: 'mass', r32: 'R-32', r125: 'R-125', r134a: 'R-134a' };

const quoted = (names: string[]) => {
  const q = names.map((n) => `"${n}"`);
  return q.length < 3 ? q.join(' and ') : `${q.slice(0, -1).join(', ')} and ${q[q.length - 1]}`;
};

interface Pick { column: string; origin: MappingOrigin; statedUnit?: StatedUnit }

/** Every header that could hold the field, by a normalized partner column or an alias. */
function candidatesFor(field: CanonicalField, headers: readonly string[]): Pick[] {
  const position = ADAPTER_FIELDS.indexOf(field as (typeof ADAPTER_FIELDS)[number]);
  const aliases = FIELD_ALIASES.filter((a) => a.field === field);
  const picks: Pick[] = [];
  for (const column of headers) {
    const n = normalizeHeader(column);
    const partner = ADAPTERS.find((a) => normalizeHeader(a.columns[position]) === n);
    if (partner) {
      picks.push({ column, origin: 'normalized', statedUnit: adapterUnit(partner, field) });
      continue;
    }
    const alias = aliases.find((a) => normalizeHeader(a.name) === n);
    if (alias) picks.push({ column, origin: 'alias', statedUnit: alias.unit });
  }
  return picks;
}

/**
 * Suggests a column for each of the six fields. `duplicates` names headers that appeared more than once (such a
 * column cannot be mapped). `manual` is the person's choice per field and replaces the suggestion for that field.
 */
export function suggestMapping(
  headers: readonly string[],
  options: { duplicates?: readonly string[]; manual?: Partial<Record<CanonicalField, string>> } = {},
): MappingSuggestion {
  const duplicates = options.duplicates ?? [];
  const exact = matchPartner(headers, duplicates);
  const adapter = exact?.kind === 'partner' ? exact.adapter : undefined;
  const issues: ValidationIssue[] = [];
  const issue = (code: IssueCode, field: CanonicalField, why: string) => issues.push(blockingIssue(code, `${LABEL[field]}: ${why}`, field));
  const picks = new Map<CanonicalField, Pick>();

  ADAPTER_FIELDS.forEach((field, i) => {
    const chosen = options.manual?.[field];
    if (chosen !== undefined) {
      if (!headers.includes(chosen)) issue('mapping_unknown_column', field, `there is no column "${chosen}"`);
      else if (duplicates.includes(chosen)) issue('header_duplicate', field, `column "${chosen}" appears more than once; keep one`);
      else picks.set(field, { column: chosen, origin: 'manual' });
      return;
    }
    if (adapter) {
      picks.set(field, { column: adapter.columns[i], origin: 'exact', statedUnit: adapterUnit(adapter, field) });
      return;
    }
    const all = candidatesFor(field, headers);
    const usable = all.filter((c) => !duplicates.includes(c.column));
    if (usable.length > 1) issue('mapping_ambiguous', field, `columns ${quoted(usable.map((c) => c.column))} both match; choose one`);
    else if (usable.length === 1) picks.set(field, usable[0]);
    else if (all.length) issue('header_duplicate', field, `column ${quoted(all.map((c) => c.column))} appears more than once; keep one`);
    else issue('mapping_missing', field, 'no column matches; choose one');
  });

  // One column cannot hold two fields: drop every mapping that shares a column.
  const chosen = new Map(picks); // judge every field against the same picks, then drop them all
  for (const [field, { column }] of chosen) {
    const sharing = ADAPTER_FIELDS.filter((f) => chosen.get(f)?.column === column);
    if (sharing.length < 2) continue;
    issue('mapping_collision', field, `column "${column}" is chosen for ${sharing.map((f) => LABEL[f]).join(' and ')}; each field needs its own column`);
    picks.delete(field);
  }

  const mappings = ADAPTER_FIELDS.flatMap((field) => {
    const pick = picks.get(field);
    if (!pick) return [];
    const mapping: FieldMapping = { field, sourceColumn: pick.column, origin: pick.origin, approved: pick.origin === 'exact' };
    return [pick.statedUnit ? { mapping, statedUnit: pick.statedUnit } : { mapping }];
  });
  const used = new Set(mappings.map((m) => m.mapping.sourceColumn));
  return { ...(adapter ? { partner: adapter.name } : {}), mappings, issues, unusedColumns: headers.filter((h) => !used.has(h)) };
}
