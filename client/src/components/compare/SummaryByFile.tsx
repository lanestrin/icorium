import type { CompareColumn, CompareResult } from '../../../../shared/types';
import { deltas, deltaUnit, differsFromRef, fmtDelta, fmtValue } from '../../lib/compare-view';
import { Dot, CARD } from './styles';

/** Each file's total or mean (or rows differing), its change from the reference file, and its flagged rows. */
export function SummaryByFile({ col, result, labels, refIndex }: { col: CompareColumn; result: CompareResult; labels: string[]; refIndex: number }) {
  const { files, rows } = result;
  const numeric = col.kind === 'numeric';
  const summary = col.summary ?? [];
  const delta = deltas(summary, refIndex);
  const valueHeader = `${col.measure === 'total' ? 'Total' : 'Mean'}${col.unit ? ` (${col.unit})` : ''}`;
  const differing = files.map((_, k) => rows.filter((_, r) => differsFromRef(col, r, k, refIndex)).length);
  const flagged = (n: number) => (
    <span className={`inline-block min-w-7 rounded-md px-2 py-0.5 text-center font-medium ${n ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>{n}</span>
  );
  return (
    <div className={CARD}>
      <h3 className="mb-3 text-lg font-semibold">Summary by file</h3>
      <div className="overflow-x-auto">
        <table aria-label="Summary by file" className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 text-left [&>th]:whitespace-nowrap [&>th]:px-3 [&>th]:py-2 [&>th]:font-semibold">
              <th>File</th>
              {numeric ? <><th className="text-right">{valueHeader}</th><th className="text-right">Δ vs ref.</th></> : <th className="text-right">Rows differing from ref.</th>}
              <th className="text-right">Flagged rows</th>
            </tr>
          </thead>
          <tbody>
            {files.map((f, k) => (
              <tr key={f.id} className={`border-t border-slate-100 [&>td]:px-3 [&>td]:py-2 ${k === refIndex ? 'bg-blue-50/60' : ''}`}>
                <td className="font-medium">
                  <span className="flex items-center gap-2" title={f.name}>
                    <Dot k={k} />{labels[k]}{k === refIndex && <span className="font-normal text-slate-500">(ref)</span>}
                  </span>
                </td>
                {numeric
                  ? <><td className="text-right">{fmtValue(summary[k], col.unit === '%' ? undefined : col.unit)}</td><td className="text-right">{fmtDelta(delta[k], deltaUnit(col))}</td></>
                  : <td className="text-right">{k === refIndex ? '—' : differing[k]}</td>}
                <td className="text-right">{flagged(f.problems.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {numeric && col.unit === '%' && <p className="mt-2 text-xs text-slate-500">Δ is measured against the reference file. pp = percentage points.</p>}
    </div>
  );
}
