import { randomInt } from 'node:crypto';
import { ADAPTERS } from '../adapters';
import { httpError, toCsv } from './csv';
import type { GeneratedError, GeneratedFile, GeneratorPartner } from '../../../shared/types';

/** Largest file the generator makes; enough for demos without slowing the synchronous API. */
export const GENERATOR_MAX_ROWS = 5000;
/** Most files one request makes. */
export const GENERATOR_MAX_FILES = 10;

/** How each partner writes its numbers, matching the sample files: A kg/% , B lb/%, C g/fractions. */
const DIGITS: Record<GeneratorPartner, { mass: number; pct: number }> = {
  A: { mass: 3, pct: 2 },
  B: { mass: 3, pct: 2 },
  C: { mass: 0, pct: 5 },
};

/** Small seeded random generator (mulberry32), so a seed always gives the same file. */
function random(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** "partnerA-11092026-001.csv": partner, the day it was made (MMDDYYYY, server time) and its number in the batch. */
export function generatedName(partner: GeneratorPartner, number: number, made: Date) {
  const mmddyyyy = `${String(made.getMonth() + 1).padStart(2, '0')}${String(made.getDate()).padStart(2, '0')}${made.getFullYear()}`;
  return `partner${partner}-${mmddyyyy}-${String(number).padStart(3, '0')}.csv`;
}

/** Error kinds that each make exactly one row fail Composition Validation. */
const SINGLE_ERRORS: GeneratedError['kind'][] = ['mass missing', 'mass not a number', 'negative percentage', 'composition total off', 'batch ID missing'];

/**
 * Builds a partner CSV in that partner's own columns and units. Clean rows always pass Composition
 * Validation; with errorRows > 0, exactly that many rows fail it. A duplicate batch ID makes two rows
 * fail, so it is only planted when at least two error rows remain.
 */
export function generateCsv(partner: GeneratorPartner, rows: number, errorRows: number, seed = randomInt(2 ** 31), name = generatedName(partner, 1, new Date())): GeneratedFile {
  if (!Number.isInteger(rows) || rows < 1 || rows > GENERATOR_MAX_ROWS) throw httpError(400, `Rows must be a whole number from 1 to ${GENERATOR_MAX_ROWS}.`);
  if (!Number.isInteger(errorRows) || errorRows < 0 || errorRows > rows) throw httpError(400, 'Rows with errors must be a whole number from 0 to the number of rows.');
  const adapter = ADAPTERS.find((a) => a.name === `Partner ${partner}`);
  if (!adapter) throw httpError(400, `Unknown partner ${partner}.`);

  const rand = random(seed);
  const between = (lo: number, hi: number) => lo + rand() * (hi - lo);
  const digits = DIGITS[partner];
  const fixed = (v: number, d: number) => v.toFixed(d);
  const [idCol, dateCol, massCol, r32Col, r125Col, r134aCol] = adapter.columns;
  const width = Math.max(3, String(rows).length);
  const pctTotal = 100 / adapter.pctFactor; // 100 for percentages, 1 for fractions

  const out = Array.from({ length: rows }, (_, i) => {
    const day = new Date(Date.UTC(2026, 8, 1 + i)).toISOString().slice(0, 10);
    const massKg = between(110, 140);
    // Two components at random, the third makes up the rest, so the total is exactly 100% after rounding.
    const r32 = Number(fixed(between(33, 40) / adapter.pctFactor, digits.pct));
    const r125 = Number(fixed(between(26, 33) / adapter.pctFactor, digits.pct));
    return {
      [idCol]: `${partner}-${String(i + 1).padStart(width, '0')}`,
      [dateCol]: day,
      [massCol]: fixed(massKg / adapter.massFactor, digits.mass),
      [r32Col]: fixed(r32, digits.pct),
      [r125Col]: fixed(r125, digits.pct),
      [r134aCol]: fixed(pctTotal - r32 - r125, digits.pct),
    };
  });

  // Pick the rows to break, in random order, then plant one error kind per row (or a duplicate pair).
  const order = out.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  const pool = order.slice(0, errorRows).sort((a, b) => a - b);
  const errors: GeneratedError[] = [];
  while (pool.length) {
    if (pool.length >= 2 && rand() < 1 / (SINGLE_ERRORS.length + 1)) {
      const [first, second] = [pool.shift()!, pool.shift()!];
      out[second][idCol] = out[first][idCol];
      errors.push({ row: first + 1, kind: 'duplicate batch ID' }, { row: second + 1, kind: 'duplicate batch ID' });
      continue;
    }
    const r = pool.shift()!;
    const kind = SINGLE_ERRORS[Math.floor(rand() * SINGLE_ERRORS.length)];
    const row = out[r];
    if (kind === 'mass missing') row[massCol] = '';
    if (kind === 'mass not a number') row[massCol] = 'n/a';
    if (kind === 'negative percentage') row[r125Col] = `-${row[r125Col]}`;
    if (kind === 'composition total off') row[r134aCol] = fixed(Number(row[r134aCol]) - 15 / adapter.pctFactor, digits.pct);
    if (kind === 'batch ID missing') row[idCol] = '';
    errors.push({ row: r + 1, kind });
  }
  errors.sort((a, b) => a.row - b.row);

  return { name, partner, rows, text: toCsv([...adapter.columns], out), errors };
}

/**
 * Makes `count` files with the same settings and different data, named partnerA-MMDDYYYY-001.csv, -002 and so on.
 * Each gets its own seed; a file whose content matches one already made is regenerated with the next
 * seed, so no two files in a batch are the same.
 */
export function generateFiles(partner: GeneratorPartner, rows: number, errorRows: number, count: number, seed = randomInt(2 ** 31), made = new Date()): GeneratedFile[] {
  if (!Number.isInteger(count) || count < 1 || count > GENERATOR_MAX_FILES) throw httpError(400, `Number of files must be a whole number from 1 to ${GENERATOR_MAX_FILES}.`);
  const files: GeneratedFile[] = [];
  const seen = new Set<string>();
  let next = seed;
  while (files.length < count) {
    const file = generateCsv(partner, rows, errorRows, next++, generatedName(partner, files.length + 1, made));
    if (seen.has(file.text)) continue;
    seen.add(file.text);
    files.push(file);
  }
  return files;
}
