import { useId, useState, type FormEvent } from 'react';
import { ArrowLeft, FilePlus2, LoaderCircle, Network, Wand2 } from 'lucide-react';
import { ADAPTERS, GENERATOR_MAX_FILES, GENERATOR_MAX_ROWS, type GeneratedFile, type GeneratorPartner } from '../../../shared/types';
import { Banner } from '../components/Banner';
import { ChoiceOption } from '../components/generator/ChoiceOption';
import { GeneratedFileList } from '../components/generator/GeneratedFileList';
import { GeneratedFilePreview } from '../components/generator/GeneratedFilePreview';
import { NumberField } from '../components/generator/NumberField';
import styles from '../components/generator/generator.module.css';
import { api } from '../lib/api';
import { classNames } from '../lib/class-names';
import { errorMessage, plural } from '../lib/format';
import { flaggedRows, withCsv } from '../lib/generated-files';
import { AppVersion } from '../components/AppVersion';

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
    <div className="page-shell px-4 pb-10 pt-8 sm:px-6 sm:pt-10">
      <nav aria-label="Pages" className="page-nav">
        <a href="/" className="nav-link"><ArrowLeft className="h-4 w-4" /> Back to CSV Files</a>
        <a href="/architecture" className="nav-link"><Network className="h-4 w-4" /> Architecture</a>
        <AppVersion />
      </nav>
      <div className="mt-3 flex flex-wrap items-baseline gap-4">
        <h1 className="text-3xl font-bold tracking-tight">CSV Generator</h1>
        <p className="text-slate-600">Create synthetic partner CSVs for testing. All values are invented.</p>
      </div>

      <div className={styles.layout}>
        <form onSubmit={generate} className={classNames('card', styles.form)} aria-label="Generate CSV files">
          <fieldset>
            <legend className={styles.legend}>Partner</legend>
            <div className="space-y-2">
              {ADAPTERS.map((adapter) => (
                <ChoiceOption key={adapter.id} layout="card" name={`${ids}-partner`} checked={partner === adapter.id} onSelect={() => setPartner(adapter.id)}>
                  <span>
                    <span className="block font-semibold">{adapter.name}</span>
                    <span className="block text-sm text-slate-500">{adapter.description}</span>
                  </span>
                </ChoiceOption>
              ))}
            </div>
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
            <NumberField id={`${ids}-rows`} label="Rows" value={rows} setValue={setRows} min={1} max={GENERATOR_MAX_ROWS}
              help={`1 to ${GENERATOR_MAX_ROWS.toLocaleString()} data rows in each file.`} />
            <NumberField id={`${ids}-count`} label="Number of files" value={count} setValue={setCount} min={1} max={GENERATOR_MAX_FILES}
              help={`1 to ${GENERATOR_MAX_FILES} files. No two files have the same data.`} />
          </div>

          <fieldset>
            <legend className={styles.legend}>Data quality</legend>
            <div className="flex flex-wrap gap-2">
              <ChoiceOption layout="chip" name={`${ids}-quality`} checked={!withErrors} onSelect={() => setWithErrors(false)}>No errors</ChoiceOption>
              <ChoiceOption layout="chip" name={`${ids}-quality`} checked={withErrors} onSelect={() => setWithErrors(true)}>Include errors</ChoiceOption>
            </div>
            {withErrors && (
              <div className="mt-4">
                <NumberField id={`${ids}-errors`} label="Rows with errors" value={errorRows} setValue={setErrorRows}
                  min={1} max={Number(rows) || GENERATOR_MAX_ROWS} help={ERROR_ROWS_HELP} />
              </div>
            )}
          </fieldset>

          <button type="submit" disabled={!!busy} className="btn btn-primary w-full px-6 py-3">
            {busy === 'generate' ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <Wand2 className="h-5 w-5" />}
            {generateLabel}
          </button>
        </form>

        <section aria-label="Generated files" className={classNames('card', styles.results)}>
          {error && <Banner tone="error" className="mb-4" onDismiss={() => setError(undefined)}>{error}</Banner>}
          {added && <Banner tone="success" className="mb-4">{added} <a href="/" className="font-semibold underline">Open CSV Files</a></Banner>}

          {!file ? (
            <p className="py-16 text-center text-slate-500">Choose a partner, the number of rows and files, and whether to include errors, then click Generate.</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <div>
                  <h2 className="text-lg font-semibold">Generated files</h2>
                  <p className="text-sm text-slate-600">{batchSummary(files)}</p>
                </div>
                <button onClick={addAll} disabled={!!busy} className="btn btn-primary ml-auto px-4 py-2.5">
                  {busy === 'add' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <FilePlus2 className="h-4 w-4" />}
                  {files.length > 1 ? `Add all ${files.length} to CSV Files` : 'Add to CSV Files'}
                </button>
              </div>
              <GeneratedFileList files={files} names={names} nameOf={nameOf} onRename={rename} shown={shown} onShow={setShown} />
              <GeneratedFilePreview file={file} name={nameOf(shown)} />
            </>
          )}
        </section>
      </div>
    </div>
  );
}
