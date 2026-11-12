import type { CompareColumn, CompareResult } from '../../../../shared/types';
import { differsFromRef, fmtValue, metricLabel } from '../../lib/compare-view';
import { FILE_COLORS, CARD } from './styles';

/** The Row differences tab: each row's value in every file, highlighting values that differ from the reference. */
export function RowDifferences({ col, result, labels, refIndex, onlyDiffering, setOnlyDiffering }: {
  col: CompareColumn; result: CompareResult; labels: string[]; refIndex: number;
  onlyDiffering: boolean; setOnlyDiffering: (on: boolean) => void;
}) {
  const { files, rows } = result;
  const numeric = col.kind === 'numeric';
  const rowDiffers = (r: number) => files.some((_, k) => differsFromRef(col, r, k, refIndex)) || rows[r].rowNumbers.some((n) => n === null);
  const indexes = rows.map((_, r) => r).filter((r) => !onlyDiffering || rowDiffers(r));

  const cell = (r: number, k: number) => {
    if (rows[r].rowNumbers[k] === null) return 'not in file';
    const v = col.values[r][k];
    if (typeof v === 'number') return fmtValue(v, col.unit);
    return v === null || v === '' ? '—' : v;
  };

  return (
    <section aria-label="Row differences" className={`${CARD} mt-4`}>
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="text-lg font-semibold">{metricLabel(col.name)}: row differences</h3>
        <p className="text-sm text-slate-500">
          {col.rowsDiffering} of {col.rowsCompared} rows differ between files. Highlighted cells differ from the reference file.
        </p>
        <label className="ml-auto flex items-center gap-2 text-sm">
          <input type="checkbox" checked={onlyDiffering} onChange={(e) => setOnlyDiffering(e.target.checked)} className="h-4 w-4 accent-blue-600" />
          Only rows that differ
        </label>
      </div>
      <div className="mt-3 max-h-128 overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left [&>th]:sticky [&>th]:top-0 [&>th]:whitespace-nowrap [&>th]:bg-slate-50 [&>th]:px-3 [&>th]:py-2 [&>th]:font-semibold">
              <th>{result.rowMatch === 'batch_id' ? 'Batch ID' : 'Row'}</th>
              {files.map((f, k) => (
                <th key={f.id} className={numeric ? 'text-right' : ''}>
                  <span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ background: FILE_COLORS[k] }} aria-hidden />
                  {labels[k]}{k === refIndex && ' (ref)'}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {indexes.map((r) => (
              <tr key={rows[r].key} className="border-t border-slate-100 [&>td]:px-3 [&>td]:py-1.5">
                <th scope="row" className="whitespace-nowrap px-3 text-left font-medium">{rows[r].label}</th>
                {files.map((f, k) => {
                  const differs = differsFromRef(col, r, k, refIndex);
                  return (
                    <td key={f.id} data-differs={differs || undefined}
                      className={`${numeric ? 'text-right' : ''} ${differs ? 'bg-amber-50 text-amber-900' : ''} ${rows[r].rowNumbers[k] === null ? 'italic text-slate-400' : ''}`}>
                      {cell(r, k)}
                    </td>
                  );
                })}
              </tr>
            ))}
            {!indexes.length && (
              <tr><td colSpan={files.length + 1} className="py-8 text-center text-slate-500">No rows differ for this metric.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
