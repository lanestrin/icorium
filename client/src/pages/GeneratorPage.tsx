import { useId, useState, type FormEvent } from 'react';
import { FilePlus2, Wand2 } from 'lucide-react';
import { ADAPTERS, GENERATOR_MAX_FILES, GENERATOR_MAX_ROWS, type GeneratedFile, type GeneratorPartner } from '../../../shared/types';
import { Banner } from '../components/Banner';
import { ChoiceOption } from '../components/generator/ChoiceOption';
import { GeneratedFileList } from '../components/generator/GeneratedFileList';
import { GeneratedFilePreview } from '../components/generator/GeneratedFilePreview';
import { NumberField } from '../components/generator/NumberField';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import styles from '../components/generator/generator.module.scss';
import page from '../styles/page.module.scss';
import { api } from '../lib/api';
import { errorMessage, plural } from '../lib/format';
import { flaggedRows, withCsv } from '../lib/generated-files';
import { AppShell } from '../components/layout/AppShell';
import { useAccount } from '../hooks/useAccount';

const ERROR_ROWS_HELP = 'In each file. Each of these rows fails Composition Validation: missing or non-numeric mass, a negative percentage, '
  + 'a composition total off by 15 points, a missing batch ID, or a duplicate batch ID (which marks two rows).';

/** "1 file · Partner A · 25 rows each · 2 rows with errors each" for the generated batch. */
function batchSummary(files: GeneratedFile[]) {
  const first = files[0];
  const sameErrorCount = files.every((f) => flaggedRows(f) === flaggedRows(first));
  const errors = !sameErrorCount ? 'rows with errors vary'
    : flaggedRows(first) ? `${plural(flaggedRows(first), 'row')} with errors each`
    : 'no errors';
  return `${plural(files.length, 'file')} · Partner ${first.partner} · ${plural(first.rows, 'row')} each · ${errors}`;
}

/** The CSV Generator (/generator): make synthetic partner CSVs, preview and download them, or add them to CSV Files. */
export function GeneratorPage() {
  const account = useAccount();
  const [partner, setPartner] = useState<GeneratorPartner>('A');
  const [rows, setRows] = useState('25');
  const [count, setCount] = useState('1');
  const [withErrors, setWithErrors] = useState(false);
  const [errorRows, setErrorRows] = useState('2');
  const [files, setFiles] = useState<GeneratedFile[]>([]);
  const [names, setNames] = useState<string[]>([]);
  const [shown, setShown] = useState(0);
  const [busy, setBusy] = useState<'generate' | 'add'>();
  const [error, setError] = useState<string>();
  const [added, setAdded] = useState<string>();
  const ids = useId();

  async function generate(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy('generate');
    setError(undefined);
    setAdded(undefined);
    try {
      const made = await api.generate({ partner, rows: Number(rows), errorRows: withErrors ? Number(errorRows) : 0, files: Number(count) });
      setFiles(made.files);
      setNames(made.files.map((f) => f.name));
      setShown(0);
    } catch (err) {
      setError(`Could not generate: ${errorMessage(err)}`);
    }
    setBusy(undefined);
  }

  /** Uploads every generated file in turn, like choosing them in the file picker, and reports any that fail. */
  async function addAll() {
    if (!files.length || busy) return;
    setBusy('add');
    setError(undefined);
    setAdded(undefined);
    const done: string[] = [];
    const failed: string[] = [];
    for (const [i, f] of files.entries()) {
      const fileName = nameOf(i);
      try {
        await api.upload(new File([f.text], fileName, { type: 'text/csv' }));
        done.push(fileName);
      } catch (err) {
        failed.push(`${fileName}: ${errorMessage(err)}`);
      }
    }
    if (done.length) setAdded(done.length === 1 ? `Added ${done[0]} to CSV Files.` : `Added ${done.length} files to CSV Files.`);
    if (failed.length) setError(`Could not add to CSV Files\n${failed.join('\n')}`);
    setBusy(undefined);
  }

  /** The name a file is downloaded or added under: the edited name (or the generated one), ending in .csv. */
  const nameOf = (i: number) => withCsv(names[i] || files[i].name);
  const rename = (index: number, name: string) => setNames((current) => current.map((n, k) => (k === index ? name : n)));
  const file = files[shown];
  const generateLabel = busy === 'generate' ? 'Generating…' : Number(count) > 1 ? `Generate ${count} CSV files` : 'Generate CSV';

  return (
    <AppShell account={account}>
    <div className={styles.page}>
      <div className={page.titleRow}>
        <h1 className={page.title}>CSV Generator</h1>
        <p className={page.intro}>Create synthetic partner CSVs for testing. All values are invented.</p>
      </div>

      <div className={styles.layout}>
        <Card as="form" onSubmit={generate} className={styles.form} aria-label="Generate CSV files">
          <fieldset>
            <legend className={styles.legend}>Partner</legend>
            <div className={styles.choiceList}>
              {ADAPTERS.map((adapter) => (
                <ChoiceOption key={adapter.id} layout="card" name={`${ids}-partner`} checked={partner === adapter.id} onSelect={() => setPartner(adapter.id)}>
                  <span>
                    <span className={styles.choiceTitle}>{adapter.name}</span>
                    <span className={styles.choiceDescription}>{adapter.description}</span>
                  </span>
                </ChoiceOption>
              ))}
            </div>
          </fieldset>

          <div className={styles.numberFields}>
            <NumberField id={`${ids}-rows`} label="Rows" value={rows} setValue={setRows} min={1} max={GENERATOR_MAX_ROWS}
              help={`1 to ${GENERATOR_MAX_ROWS.toLocaleString()} data rows in each file.`} />
            <NumberField id={`${ids}-count`} label="Number of files" value={count} setValue={setCount} min={1} max={GENERATOR_MAX_FILES}
              help={`1 to ${GENERATOR_MAX_FILES} files. No two files have the same data.`} />
          </div>

          <fieldset>
            <legend className={styles.legend}>Data quality</legend>
            <div className={styles.chips}>
              <ChoiceOption layout="chip" name={`${ids}-quality`} checked={!withErrors} onSelect={() => setWithErrors(false)}>No errors</ChoiceOption>
              <ChoiceOption layout="chip" name={`${ids}-quality`} checked={withErrors} onSelect={() => setWithErrors(true)}>Include errors</ChoiceOption>
            </div>
            {withErrors && (
              <div className={styles.errorRowsField}>
                <NumberField id={`${ids}-errors`} label="Rows with errors" value={errorRows} setValue={setErrorRows}
                  min={1} max={Number(rows) || GENERATOR_MAX_ROWS} help={ERROR_ROWS_HELP} />
              </div>
            )}
          </fieldset>

          <Button type="submit" size="lg" className={styles.generateButton} disabled={!!busy} loading={busy === 'generate'} icon={<Wand2 />}>
            {generateLabel}
          </Button>
        </Card>

        <Card as="section" aria-label="Generated files" className={styles.results}>
          {error && <Banner tone="error" className={styles.banner} onDismiss={() => setError(undefined)}>{error}</Banner>}
          {added && <Banner tone="success" className={styles.banner}>{added} <a href="/" className={styles.bannerLink}>Open CSV Files</a></Banner>}

          {!file ? (
            <p className={styles.empty}>Choose a partner, the number of rows and files, and whether to include errors, then click Generate.</p>
          ) : (
            <>
              <div className={styles.resultsHeader}>
                <div>
                  <h2 className={styles.resultsTitle}>Generated files</h2>
                  <p className={styles.resultsSummary}>{batchSummary(files)}</p>
                </div>
                <Button onClick={addAll} className={styles.addButton} disabled={!!busy} loading={busy === 'add'} icon={<FilePlus2 />}>
                  {files.length > 1 ? `Add all ${files.length} to CSV Files` : 'Add to CSV Files'}
                </Button>
              </div>
              <GeneratedFileList files={files} names={names} nameOf={nameOf} onRename={rename} shown={shown} onShow={setShown} />
              <GeneratedFilePreview file={file} name={nameOf(shown)} />
            </>
          )}
        </Card>
      </div>
    </div>
    </AppShell>
  );
}
