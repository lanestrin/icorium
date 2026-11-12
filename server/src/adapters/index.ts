import type { Row } from '../../../shared/types';
import { httpError } from '../lib/csv';

/** Canonical record every processor works on. null = missing, NaN = not a number. Percentages 0–100. */
export interface Normalized {
  batchId: string;
  sampleDate: string;
  source: string; // which partner adapter read the row
  massKg: number | null;
  r32: number | null;
  r125: number | null;
  r134a: number | null;
}

interface Adapter {
  name: string;
  columns: [id: string, date: string, mass: string, r32: string, r125: string, r134a: string];
  massFactor: number; // source unit -> kg
  pctFactor: number; // source unit -> %
}

// To support a new partner schema, add one entry here.
export const ADAPTERS: Adapter[] = [
  { name: 'Partner A', columns: ['batch_id', 'sample_date', 'feed_mass_kg', 'r32_pct', 'r125_pct', 'r134a_pct'], massFactor: 1, pctFactor: 1 },
  { name: 'Partner B', columns: ['lot_number', 'collected_on', 'weight_lb', 'hfc32_percent', 'hfc125_percent', 'hfc134a_percent'], massFactor: 0.45359237, pctFactor: 1 },
  { name: 'Partner C', columns: ['material_ref', 'collection_date', 'quantity_g', 'R32_fraction', 'R125_fraction', 'R134a_fraction'], massFactor: 0.001, pctFactor: 100 },
];

const num = (v: string | undefined, factor: number) => {
  if (v == null || v.trim() === '') return null;
  return Number(v) * factor; // NaN if not numeric
};

export function getAdapter(headers: string[]) {
  const a = ADAPTERS.find((a) => a.columns.every((c) => headers.includes(c)));
  if (!a) throw httpError(400, `Unrecognized CSV schema. Expected columns for one of: ${ADAPTERS.map((a) => `${a.name} (${a.columns.join(', ')})`).join('; ')}`);
  const [id, date, mass, r32, r125, r134a] = a.columns;
  return {
    name: a.name,
    normalize: (row: Row): Normalized => ({
      batchId: (row[id] ?? '').trim(),
      sampleDate: (row[date] ?? '').trim(),
      source: a.name,
      massKg: num(row[mass], a.massFactor),
      r32: num(row[r32], a.pctFactor),
      r125: num(row[r125], a.pctFactor),
      r134a: num(row[r134a], a.pctFactor),
    }),
  };
}
