import { Download, Eye } from 'lucide-react';
import type { GeneratedFile } from '../../../../shared/types';
import { classNames } from '../../lib/class-names';
import { flaggedRows } from '../../lib/generated-files';
import styles from './generator.module.css';

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
    <div className="mt-4 overflow-x-auto">
      <table aria-label="Generated files" className="w-full text-sm">
        <thead>
          <tr className="table-head-row">
            <th>File name</th><th className="text-right">Rows with errors</th><th className="text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {files.map((file, i) => {
            const isShown = i === shown;
            return (
              <tr key={i} className={classNames('table-row', isShown && styles.selectedRow)}>
                <td className="min-w-56">
                  <input aria-label={`File name ${i + 1}`} value={names[i] ?? ''} onChange={(e) => onRename(i, e.target.value)} className={styles.nameInput} />
                </td>
                <td className="text-right">{flaggedRows(file)}</td>
                <td>
                  <div className="flex justify-end gap-2">
                    <button onClick={() => onShow(i)} aria-pressed={isShown} aria-label={`Preview ${nameOf(i)}`}
                      className={classNames(styles.rowAction, isShown && styles.rowActionPressed)}>
                      <Eye className="h-4 w-4" /> Preview
                    </button>
                    <a href={downloadHref(file)} download={nameOf(i)} aria-label={`Download ${nameOf(i)}`} className={styles.rowAction}>
                      <Download className="h-4 w-4" /> Download
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
