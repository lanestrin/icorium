// Generates the five fictional partner CSVs (deterministic). Run: npm run samples
import { writeFileSync } from 'node:fs';

let seed = 42;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const jit = (x) => (rnd() - 0.5) * 2 * x;
const BLENDS = { r410a: [50, 50], r407c: [23, 25], r134a: [0.5, 0.5] };

function comp(base, j) {
  let a = Math.abs(base[0] + jit(j)), b = Math.abs(base[1] + jit(j)), c = 100 - a - b;
  if (c < 0) { b += c; c = 0; }
  return [a, b, c];
}

// mass(kg) -> cell, pct -> cell, errors: { rowIndex: [columnIndex, badValue] }
function make(file, headers, { id, extra, mass, pct, blend }, errors) {
  const rows = Array.from({ length: 25 }, (_, i) => {
    const kg = 200 + rnd() * 700;
    const cells = [id(i), `2026-01-${String(5 + (i % 20)).padStart(2, '0')}`, extra(i), mass(kg), ...comp(BLENDS[blend(i)], 1.2).map(pct)];
    if (errors[i]) cells[errors[i][0]] = errors[i][1];
    return cells.join(',');
  });
  writeFileSync(new URL(file, import.meta.url), [headers.join(','), ...rows].join('\n') + '\n');
}

const A = { id: (i) => `A-${1001 + i}`, extra: (i) => ['North Depot', 'Harbor Recovery', 'Metro HVAC'][i % 3], mass: (kg) => kg.toFixed(1), pct: (p) => p.toFixed(2), blend: () => 'r410a' };
const B = { id: (i) => `B${7700 + i}`, extra: (i) => ['Site 1', 'Site 2'][i % 2], mass: (kg) => (kg * 2.20462).toFixed(1), pct: (p) => (p / 100).toFixed(4), blend: () => 'r407c' };
const C = { id: (i) => `LOT-C-${300 + i}`, extra: (i) => ['J. Ortiz', 'M. Chen'][i % 2], mass: (kg) => Math.round(kg * 1000), pct: (p) => p.toFixed(1), blend: (i) => ['r410a', 'r407c', 'r134a'][i % 3] };

const HA = ['batch_id', 'received_date', 'supplier', 'mass_kg', 'r32_pct', 'r125_pct', 'r134a_pct'];
const HB = ['BatchNo', 'Date', 'Site', 'Weight_lb', 'R32_frac', 'R125_frac', 'R134a_frac'];
const HC = ['lot_code', 'intake_date', 'operator', 'net_mass_g', 'comp_r32', 'comp_r125', 'comp_r134a'];

make('partner_a_baseline.csv', HA, A, { 4: [5, ''], 11: [4, '55.00'], 18: [3, 'abc'] });
make('partner_a_followup.csv', HA, A, { 7: [4, '-3'], 15: [6, ''], 21: [3, ''] });
make('partner_b_baseline.csv', HB, B, { 3: [5, ''], 9: [4, '0.3100'], 20: [3, 'n/a'] });
make('partner_b_followup.csv', HB, B, { 6: [4, 'abc'], 13: [6, '0.4400'], 22: [6, ''] });
make('partner_c_baseline.csv', HC, C, { 2: [4, ''], 10: [5, '17.0'], 17: [3, '-500'] });
console.log('Wrote 5 sample CSVs');
