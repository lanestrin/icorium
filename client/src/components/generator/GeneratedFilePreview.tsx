import type { GeneratedFile } from '../../../../shared/types';
import { classNames } from '../../lib/class-names';
import { splitCsv } from '../../lib/generated-files';
import styles from './generator.module.css';

const PREVIEW_ROWS = 10;
const ERRORS_SHOWN = 20;

/** The chosen file's planted errors and its first rows, with the rows that have planted errors highlighted. */
export function GeneratedFilePreview({ file, name }: { file: GeneratedFile; name: string }) {
  const [headers, ...dataRows] = splitCsv(file.text);
  const flaggedRowNumbers = new Set(file.errors.map((e) => e.row));
  const hiddenErrors = file.errors.length - ERRORS_SHOWN;

  return (
    <>
      <h3 className="mt-6 font-semibold">{name}</h3>
      {file.errors.length > 0 && (
        <ul aria-label="Planted errors" className={styles.plantedErrors}>
          {file.errors.slice(0, ERRORS_SHOWN).map((e) => <li key={`${e.row}-${e.kind}`}><span className="font-semibold">Row {e.row}</span> · {e.kind}</li>)}
          {hiddenErrors > 0 && <li className="opacity-75">…and {hiddenErrors} more</li>}
        </ul>
      )}
      <p className="mt-2 text-sm text-slate-500">
        First {Math.min(PREVIEW_ROWS, file.rows)} of {file.rows.toLocaleString()} rows. Rows with planted errors are highlighted.
      </p>
      <div className="mt-2 overflow-x-auto">
        <table aria-label="Preview" className="w-full text-sm">
          <thead>
            <tr className="table-head-row">
              <th>Row</th>{headers?.map((h) => <th key={h}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {dataRows.slice(0, PREVIEW_ROWS).map((cells, i) => (
              <tr key={i} className={classNames(styles.previewRow, flaggedRowNumbers.has(i + 1) && styles.flaggedRow)}>
                <td className="text-slate-500">{i + 1}</td>{cells.map((cell, k) => <td key={k}>{cell}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
