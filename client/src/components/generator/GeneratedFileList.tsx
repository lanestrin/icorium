import { Download, Eye } from 'lucide-react';
import type { GeneratedFile } from '../../../../shared/types';
import { classNames } from '../../lib/class-names';
import { flaggedRows } from '../../lib/generated-files';
import tables from '../../styles/tables.module.scss';
import styles from './generator.module.scss';

/** A data: link that downloads the file's CSV text under the given name. */
const downloadHref = (file: GeneratedFile) => `data:text/csv;charset=utf-8,${encodeURIComponent(file.text)}`;

/** The generated files: an editable name, rows with errors, and Preview and Download for each. */
export function GeneratedFileList({ files, names, nameOf, onRename, shown, onShow }: {
  files: GeneratedFile[];
  names: string[];
  nameOf: (index: number) => string;
  onRename: (index: number, name: string) => void;
  shown: number;
  onShow: (index: number) => void;
}) {
  return (
    <div className={styles.fileList}>
      <table aria-label="Generated files" className={tables.table}>
        <thead>
          <tr className={tables.headRow}>
            <th>File name</th><th className={tables.numeric}>Rows with errors</th><th className={tables.numeric}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {files.map((file, i) => {
            const isShown = i === shown;
            return (
              <tr key={i} className={classNames(tables.row, isShown && styles.selectedRow)}>
                <td className={styles.nameCell}>
                  <input aria-label={`File name ${i + 1}`} value={names[i] ?? ''} onChange={(e) => onRename(i, e.target.value)} className={styles.nameInput} />
                </td>
                <td className={tables.numeric}>{flaggedRows(file)}</td>
                <td>
                  <div className={styles.rowActions}>
                    <button onClick={() => onShow(i)} aria-pressed={isShown} aria-label={`Preview ${nameOf(i)}`}
                      className={classNames(styles.rowAction, isShown && styles.rowActionPressed)}>
                      <Eye aria-hidden /> Preview
                    </button>
                    <a href={downloadHref(file)} download={nameOf(i)} aria-label={`Download ${nameOf(i)}`} className={styles.rowAction}>
                      <Download aria-hidden /> Download
                    </a>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
