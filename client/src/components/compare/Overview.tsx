import { ArrowLeftRight, ChevronRight, Layers, TriangleAlert } from 'lucide-react';
import type { CompareColumn, CompareResult } from '../../../../shared/types';
import { metricLabel, topDifferences } from '../../lib/compare-view';
import { Dot, CARD } from './styles';
import { RowChart } from './RowChart';
import { CategoryChart } from './CategoryChart';
import { SummaryByFile } from './SummaryByFile';

/** The Overview tab: the metric's chart and summary by file, then the comparison at a glance and its top differences. */
export function Overview({ col, result, labels, refIndex, deviation, setDeviation, showRows }: {
  col: CompareColumn; result: CompareResult; labels: string[]; refIndex: number; deviation: boolean;
  setDeviation?: (on: boolean) => void; showRows: () => void;
}) {
  const { files, rows } = result;
  const name = metricLabel(col.name);
  const top = topDifferences(result, col, refIndex);
  const flaggedFiles = files.filter((f) => f.problems.total > 0).length;
  const pct = col.rowsCompared ? Math.round((col.rowsDiffering / col.rowsCompared) * 100) : 0;

  return (
    <section aria-label="Overview" className="mt-4 space-y-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className={CARD}>
          {col.kind === 'numeric'
            ? <RowChart col={col} result={result} labels={labels} deviation={deviation} setDeviation={setDeviation} />
            : <CategoryChart col={col} files={files} labels={labels} />}
        </div>
        <SummaryByFile col={col} result={result} labels={labels} refIndex={refIndex} />
      </div>

      <div className={`${CARD} grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]`}>
        <div>
          <h3 className="mb-3 text-lg font-semibold">Comparison at a glance</h3>
          <dl className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-blue-100 bg-blue-50 p-3">
              <dt className="flex items-center gap-2 text-sm text-slate-600"><Layers className="h-4 w-4 text-blue-600" aria-hidden /> Reference file</dt>
              <dd className="mt-1 truncate font-semibold" title={files[refIndex].name}>{labels[refIndex]}</dd>
            </div>
            <div className="rounded-xl border border-green-100 bg-green-50 p-3">
              <dt className="flex items-center gap-2 text-sm text-slate-600"><ArrowLeftRight className="h-4 w-4 text-green-600" aria-hidden /> Rows differing</dt>
              <dd className="mt-1 font-semibold">{col.rowsDiffering} / {col.rowsCompared} <span className="text-sm font-normal text-slate-500">({pct}%)</span></dd>
            </div>
            <div className="rounded-xl border border-red-100 bg-red-50 p-3">
              <dt className="flex items-center gap-2 text-sm text-slate-600"><TriangleAlert className="h-4 w-4 text-red-500" aria-hidden /> Flagged files</dt>
              <dd className="mt-1 font-semibold text-red-700">{flaggedFiles} / {files.length}</dd>
            </div>
          </dl>
        </div>
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-3">
            <h3 className="text-lg font-semibold">Top differences <span className="text-sm font-normal text-slate-500">({top.length} {top.length === 1 ? 'row' : 'rows'})</span></h3>
            <button onClick={showRows} className="ml-auto flex items-center gap-1 rounded-lg border border-blue-200 px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-50">
              View all row details <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          {top.length ? (
            <div className="overflow-x-auto">
              <table aria-label="Top differences" className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-left [&>th]:whitespace-nowrap [&>th]:px-3 [&>th]:py-2 [&>th]:font-semibold">
                    <th>{result.rowMatch === 'batch_id' ? 'Batch ID' : 'Row'}</th><th>Key difference</th><th>Files affected</th>
                  </tr>
                </thead>
                <tbody>
                  {top.map((d) => (
                    <tr key={d.key} className="border-t border-slate-100 [&>td]:px-3 [&>td]:py-2">
                      <td className="whitespace-nowrap font-medium">{d.label}</td>
                      <td><span className="rounded-md bg-red-50 px-2 py-0.5 text-red-700">{d.text}</span></td>
                      <td>
                        <span className="flex flex-wrap gap-x-3 gap-y-1">
                          {d.files.map((k) => <span key={k} className="flex items-center gap-1.5 whitespace-nowrap"><Dot k={k} />{labels[k]}</span>)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-slate-500">No row differs from the reference file for {name.toLowerCase()}.</p>
          )}
          <p className="mt-2 text-xs text-slate-500">Rows compared: {rows.length}.</p>
        </div>
      </div>
    </section>
  );
}
