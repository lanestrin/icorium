import { useMemo, useState } from 'react';
import { CircleCheck, TriangleAlert } from 'lucide-react';
import { PROCESSORS, type CompareColumn, type CompareResult } from '../../../../shared/types';
import { fileLabels, metricLabel } from '../../lib/compare-view';
import { Modal } from '../Modals';
import { Dot, PILL } from './styles';
import { Overview } from './Overview';
import { RowDifferences } from './RowDifferences';

const canShowDeviation = (col: CompareColumn) => col.kind === 'numeric' && col.unit === '%' && col.name.includes('total');
const processorLabel = (id: string) => PROCESSORS.find((p) => p.id === id)?.label ?? id;

type View = 'overview' | 'rows';

/** The comparison dialog: the compared files, reference and metric pickers, and the Overview or Row differences tab. */
export function CompareWorkspace({ result, onClose }: { result: CompareResult; onClose: () => void }) {
  const { files, rows, columns } = result;
  const labels = useMemo(() => fileLabels(files, result.processor), [files, result.processor]);
  const [metric, setMetric] = useState(0);
  const [view, setView] = useState<View>('overview');
  const [ref, setRef] = useState(0);
  const [deviation, setDeviation] = useState(false);
  const [onlyDiffering, setOnlyDiffering] = useState(true);
  const col = columns[metric];
  const matched = result.rowMatch === 'batch_id'
    ? 'Rows matched by batch ID.'
    : 'Rows matched by position: these files share no batch IDs, so row 1 is compared with row 1, and so on.';

  return (
    <Modal full title="Compare Files" subtitle={`${files.length} files · ${processorLabel(result.processor)}`} onClose={onClose}>
      <div className="mt-4 flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 px-4 py-3">
        <h3 className="mr-2 font-semibold">Selected files ({files.length})</h3>
        <ul aria-label="Compared files" className="flex flex-wrap gap-2">
          {files.map((f, k) => (
            <li key={f.id} title={f.name} className="flex min-w-0 items-center gap-2 rounded-full border border-slate-200 px-3 py-1.5 text-sm">
              <Dot k={k} />
              <span className="truncate">{labels[k]}</span>
              <span className="shrink-0 tabular-nums text-slate-500">{f.id}</span>
              {f.problems.total
                ? <TriangleAlert className="h-4 w-4 shrink-0 text-red-500" aria-label={`${f.problems.total} flagged`} />
                : <CircleCheck className="h-4 w-4 shrink-0 text-green-600" aria-label="0 flagged" />}
            </li>
          ))}
        </ul>
        <p className="w-full text-sm text-slate-500">{matched}</p>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3">
        <label className="flex items-center gap-3">
          <span className="font-semibold">Reference file</span>
          <select value={ref} onChange={(e) => setRef(Number(e.target.value))} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm">
            {files.map((f, k) => <option key={f.id} value={k}>{`${labels[k]} · ${f.id}`}</option>)}
          </select>
        </label>
        <div role="group" aria-label="Metric" className="flex flex-wrap items-center gap-2">
          <span className="mr-1 font-semibold" aria-hidden>Metric</span>
          {columns.map((c, k) => (
            <button key={c.name} aria-pressed={k === metric} onClick={() => { setMetric(k); setDeviation(false); }} className={PILL(k === metric)}>
              {metricLabel(c.name)}
            </button>
          ))}
        </div>
        <div role="group" aria-label="View" className="flex gap-1 rounded-full bg-slate-100 p-1 lg:ml-auto">
          {(['overview', 'rows'] as const).map((v) => (
            <button key={v} aria-pressed={view === v} onClick={() => setView(v)} className={PILL(view === v)}>
              {v === 'overview' ? 'Overview' : 'Row differences'}
            </button>
          ))}
        </div>
      </div>

      {col && view === 'overview' && (
        <Overview col={col} result={result} labels={labels} refIndex={ref} deviation={deviation && canShowDeviation(col)}
          setDeviation={canShowDeviation(col) ? setDeviation : undefined} showRows={() => setView('rows')} />
      )}
      {col && view === 'rows' && (
        <RowDifferences col={col} result={result} labels={labels} refIndex={ref} onlyDiffering={onlyDiffering} setOnlyDiffering={setOnlyDiffering} />
      )}
    </Modal>
  );
}
