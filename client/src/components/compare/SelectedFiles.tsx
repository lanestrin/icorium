import { CircleCheck, TriangleAlert } from 'lucide-react';
import type { CompareFile, CompareResult } from '../../../../shared/types';
import { Dot } from './fileColors';
import styles from './compare.module.css';

/** The compared files as coloured chips, each with its File ID and whether it has flagged rows, and how rows were matched. */
export function SelectedFiles({ files, labels, rowMatch }: {
  files: CompareFile[];
  labels: string[];
  rowMatch: CompareResult['rowMatch'];
}) {
  const matchNote = rowMatch === 'batch_id'
    ? 'Rows matched by batch ID.'
    : 'Rows matched by position: these files share no batch IDs, so row 1 is compared with row 1, and so on.';

  return (
    <div className={styles.selectedFiles}>
      <h3 className={styles.selectedFilesTitle}>Selected files ({files.length})</h3>
      <ul aria-label="Compared files" className="flex flex-wrap gap-2">
        {files.map((file, k) => (
          <li key={file.id} title={file.name} className={styles.fileChip}>
            <Dot k={k} />
            <span className="truncate">{labels[k]}</span>
            <span className={styles.fileId}>{file.id}</span>
            {file.problems.total
              ? <TriangleAlert className={styles.flaggedIcon} aria-label={`${file.problems.total} flagged`} />
              : <CircleCheck className={styles.cleanIcon} aria-label="0 flagged" />}
          </li>
        ))}
      </ul>
      <p className={styles.matchNote}>{matchNote}</p>
    </div>
  );
}
