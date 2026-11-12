import { useState } from 'react';
import { PROCESSORS, type CompareColumn, type CompareResult } from '../../../../shared/types';
import { fileLabels } from '../../lib/compare-view';
import { Modal } from '../modals/Modal';
import { CompareToolbar, type CompareView } from './CompareToolbar';
import { Overview } from './Overview';
import { RowDifferences } from './RowDifferences';
import { SelectedFiles } from './SelectedFiles';

/** "Deviation from 100%" only makes sense for a composition total in percent. */
const canShowDeviation = (column: CompareColumn) => column.kind === 'numeric' && column.unit === '%' && column.name.includes('total');
const processorLabel = (id: string) => PROCESSORS.find((p) => p.id === id)?.label ?? id;

/** The comparison dialog: the compared files, the controls, and the Overview or Row differences tab. */
export function CompareWorkspace({ result, onClose }: { result: CompareResult; onClose: () => void }) {
  const { files, columns } = result;
  const labels = fileLabels(files, result.processor);
  const [metric, setMetric] = useState(0);
  const [view, setView] = useState<CompareView>('overview');
  const [refIndex, setRefIndex] = useState(0);
  const [deviation, setDeviation] = useState(false);
  const [onlyDiffering, setOnlyDiffering] = useState(true);
  const column = columns[metric];

  function selectMetric(index: number) {
    setMetric(index);
    setDeviation(false); // the deviation view belongs to the metric it was turned on for
  }

  return (
    <Modal full title="Compare Files" subtitle={`${files.length} files · ${processorLabel(result.processor)}`} onClose={onClose}>
      <SelectedFiles files={files} labels={labels} rowMatch={result.rowMatch} />
      <CompareToolbar
        files={files} labels={labels} columns={columns}
        refIndex={refIndex} onRefChange={setRefIndex}
        metric={metric} onMetricChange={selectMetric}
        view={view} onViewChange={setView}
      />

      {column && view === 'overview' && (
        <Overview
          col={column} result={result} labels={labels} refIndex={refIndex}
          deviation={deviation && canShowDeviation(column)}
          setDeviation={canShowDeviation(column) ? setDeviation : undefined}
          showRows={() => setView('rows')}
        />
      )}
      {column && view === 'rows' && (
        <RowDifferences col={column} result={result} labels={labels} refIndex={refIndex} onlyDiffering={onlyDiffering} setOnlyDiffering={setOnlyDiffering} />
      )}
    </Modal>
  );
}
