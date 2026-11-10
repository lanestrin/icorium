import { useId, useState, type FormEvent } from 'react';
import { ArrowLeft, Check, Network, CircleAlert, Download, Eye, FilePlus2, LoaderCircle, Wand2, X } from 'lucide-react';
import { GENERATOR_PARTNERS, type GeneratedFile, type GeneratorPartner } from '../../../shared/types';
import { api } from '../api';

/** Kept in step with GENERATOR_MAX_ROWS and GENERATOR_MAX_FILES on the server, which has the final say. */
const MAX_ROWS = 5000;
const MAX_FILES = 10;
const PREVIEW_ROWS = 10;
const ERRORS_SHOWN = 20;

const PARTNERS: Record<GeneratorPartner, string> = {
  A: 'Kilograms and percentages',
  B: 'Pounds and percentages',
  C: 'Grams and fractions (0–1)',
};

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));
/** Generated values never contain commas or quotes, so a plain split is enough for the preview. */
const splitCsv = (text: string) => text.split(/\r?\n/).filter(Boolean).map((line) => line.split(','));
const withCsv = (name: string) => (name.trim().toLowerCase().endsWith('.csv') ? name.trim() : `${name.trim()}.csv`);
const plural = (n: number, word: string) => `${n.toLocaleString()} ${word}${n === 1 ? '' : 's'}`;
/** Rows a file's planted errors flag (a duplicate batch ID is listed on both of its rows). */
const flaggedRows = (f: GeneratedFile) => new Set(f.errors.map((x) => x.row)).size;

const CARD = 'rounded-2xl border border-slate-200 bg-white p-5 shadow-sm';
const INPUT = 'w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 shadow-sm outline-none focus:border-blue-400 disabled:bg-slate-50 disabled:text-slate-400';

/** A whole-number field with its help text linked as a description, not as part of its name. */
function NumberField({ id, label, value, setValue, min, max, help }: {
  id: string; label: string; value: string; setValue: (v: string) => void; min: number; max: number; help: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block font-semibold">{label}</label>
      <input id={id} type="number" inputMode="numeric" min={min} max={max} step={1} required value={value}
        onChange={(e) => setValue(e.target.value)} aria-describedby={`${id}-help`} className={INPUT} />
      <p id={`${id}-help`} className="mt-1 text-sm text-slate-500">{help}</p>
    </div>
  );
}

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
      setError(`Could not generate: ${msg(err)}`);
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
      const fileName = withCsv(names[i] || f.name);
      try {
        await api.upload(new File([f.text], fileName, { type: 'text/csv' }));
        done.push(fileName);
      } catch (err) {
        failed.push(`${fileName}: ${msg(err)}`);
      }
    }
    if (done.length) setAdded(done.length === 1 ? `Added ${done[0]} to CSV Files.` : `Added ${done.length} files to CSV Files.`);
    if (failed.length) setError(`Could not add to CSV Files\n${failed.join('\n')}`);
    setBusy(undefined);
  }

  const file = files[shown];
  const table = file ? splitCsv(file.text) : [];
  const errorRowSet = new Set(file?.errors.map((x) => x.row));
  const nameOf = (i: number) => withCsv(names[i] || files[i].name);
  const sameErrors = files.every((f) => flaggedRows(f) === flaggedRows(files[0]));

  return (
    <div className="min-h-screen overflow-x-clip px-4 pb-10 pt-8 text-slate-900 sm:px-6 sm:pt-10">
      <nav aria-label="Pages" className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm font-medium">
        <a href="/" className="inline-flex items-center gap-2 text-blue-700 hover:underline">
          <ArrowLeft className="h-4 w-4" /> Back to CSV Files
        </a>
        <a href="/architecture" className="inline-flex items-center gap-2 text-blue-700 hover:underline">
          <Network className="h-4 w-4" /> Architecture
        </a>
      </nav>
      <div className="mt-3 flex flex-wrap items-baseline gap-4">
        <h1 className="text-3xl font-bold tracking-tight">CSV Generator</h1>
        <p className="text-slate-600">Create synthetic partner CSVs for testing. All values are invented.</p>
      </div>

      <div className="mt-6 flex flex-col gap-6 lg:flex-row lg:items-start">
        <form onSubmit={generate} className={`${CARD} w-full space-y-6 lg:w-[24rem] lg:shrink-0`} aria-label="Generate CSV files">
          <fieldset>
            <legend className="mb-3 text-lg font-semibold">Partner</legend>
            <div className="space-y-2">
              {GENERATOR_PARTNERS.map((p) => (
                <label key={p} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${partner === p ? 'border-blue-300 bg-blue-50' : 'border-slate-200 hover:bg-slate-50'}`}>
                  <input type="radio" name={`${ids}-partner`} checked={partner === p} onChange={() => setPartner(p)} className="mt-1 h-4 w-4 accent-blue-600" />
                  <span>
                    <span className="block font-semibold">Partner {p}</span>
                    <span className="block text-sm text-slate-500">{PARTNERS[p]}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
            <NumberField id={`${ids}-rows`} label="Rows" value={rows} setValue={setRows} min={1} max={MAX_ROWS}
              help={`1 to ${MAX_ROWS.toLocaleString()} data rows in each file.`} />
            <NumberField id={`${ids}-count`} label="Number of files" value={count} setValue={setCount} min={1} max={MAX_FILES}
              help={`1 to ${MAX_FILES} files. No two files have the same data.`} />
          </div>

          <fieldset>
            <legend className="mb-3 text-lg font-semibold">Data quality</legend>
            <div className="flex flex-wrap gap-2">
              {[false, true].map((on) => (
                <label key={String(on)} className={`flex cursor-pointer items-center gap-2 rounded-xl border px-4 py-2 transition ${withErrors === on ? 'border-blue-300 bg-blue-50' : 'border-slate-200 hover:bg-slate-50'}`}>
                  <input type="radio" name={`${ids}-quality`} checked={withErrors === on} onChange={() => setWithErrors(on)} className="h-4 w-4 accent-blue-600" />
                  {on ? 'Include errors' : 'No errors'}
                </label>
              ))}
            </div>
            {withErrors && (
              <div className="mt-4">
                <NumberField id={`${ids}-errors`} label="Rows with errors" value={errorRows} setValue={setErrorRows} min={1} max={Number(rows) || MAX_ROWS}
                  help="In each file. Each of these rows fails Composition Validation: missing or non-numeric mass, a negative percentage, a composition total off by 15 points, a missing batch ID, or a duplicate batch ID (which marks two rows)." />
              </div>
            )}
          </fieldset>

          <button type="submit" disabled={!!busy}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3 font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">
            {busy === 'generate' ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <Wand2 className="h-5 w-5" />}
            {busy === 'generate' ? 'Generating…' : Number(count) > 1 ? `Generate ${count} CSV files` : 'Generate CSV'}
          </button>
        </form>

        <section aria-label="Generated files" className={`${CARD} min-w-0 flex-1`}>
          {error && (
            <div role="alert" className="mb-4 flex items-start gap-3 whitespace-pre-line rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="flex-1">{error}</span>
              <button onClick={() => setError(undefined)} aria-label="Dismiss"><X className="h-4 w-4" /></button>
            </div>
          )}
          {added && (
            <div role="status" className="mb-4 flex items-start gap-3 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
              <Check className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="flex-1">{added} <a href="/" className="font-semibold underline">Open CSV Files</a></span>
            </div>
          )}

          {!file ? (
            <p className="py-16 text-center text-slate-500">Choose a partner, the number of rows and files, and whether to include errors, then click Generate.</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <div>
                  <h2 className="text-lg font-semibold">Generated files</h2>
                  <p className="text-sm text-slate-600">
                    {plural(files.length, 'file')} · Partner {file.partner} · {plural(file.rows, 'row')} each ·{' '}
                    {sameErrors ? (flaggedRows(file) ? `${plural(flaggedRows(file), 'row')} with errors each` : 'no errors') : 'rows with errors vary'}
                  </p>
                </div>
                <button onClick={addAll} disabled={!!busy}
                  className="ml-auto flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 font-medium text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">
                  {busy === 'add' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <FilePlus2 className="h-4 w-4" />}
                  {files.length > 1 ? `Add all ${files.length} to CSV Files` : 'Add to CSV Files'}
                </button>
              </div>

              <div className="mt-4 overflow-x-auto">
                <table aria-label="Generated files" className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-left [&>th]:whitespace-nowrap [&>th]:px-3 [&>th]:py-2 [&>th]:font-semibold">
                      <th>File name</th><th className="text-right">Rows with errors</th><th className="text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {files.map((f, i) => (
                      <tr key={i} className={`border-t border-slate-100 [&>td]:px-3 [&>td]:py-2 ${i === shown ? 'bg-blue-50/60' : ''}`}>
                        <td className="min-w-56">
                          <input aria-label={`File name ${i + 1}`} value={names[i] ?? ''} onChange={(e) => setNames((n) => n.map((v, k) => (k === i ? e.target.value : v)))}
                            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5" />
                        </td>
                        <td className="text-right">{flaggedRows(f)}</td>
                        <td>
                          <div className="flex justify-end gap-2">
                            <button onClick={() => setShown(i)} aria-pressed={i === shown} aria-label={`Preview ${nameOf(i)}`}
                              className={`flex items-center gap-1.5 rounded-full border px-3 py-1 ${i === shown ? 'border-blue-300 bg-white text-blue-700' : 'border-slate-200 hover:bg-slate-50'}`}>
                              <Eye className="h-4 w-4" /> Preview
                            </button>
                            <a href={`data:text/csv;charset=utf-8,${encodeURIComponent(f.text)}`} download={nameOf(i)} aria-label={`Download ${nameOf(i)}`}
                              className="flex items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1 hover:bg-slate-50">
                              <Download className="h-4 w-4" /> Download
                            </a>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <h3 className="mt-6 font-semibold">{nameOf(shown)}</h3>
              {file.errors.length > 0 && (
                <ul aria-label="Planted errors" className="mt-1 grid gap-x-6 gap-y-0.5 text-sm text-amber-900 sm:grid-cols-2">
                  {file.errors.slice(0, ERRORS_SHOWN).map((x) => <li key={`${x.row}-${x.kind}`}><span className="font-semibold">Row {x.row}</span> · {x.kind}</li>)}
                  {file.errors.length > ERRORS_SHOWN && <li className="opacity-75">…and {file.errors.length - ERRORS_SHOWN} more</li>}
                </ul>
              )}
              <p className="mt-2 text-sm text-slate-500">First {Math.min(PREVIEW_ROWS, file.rows)} of {file.rows.toLocaleString()} rows. Rows with planted errors are highlighted.</p>
              <div className="mt-2 overflow-x-auto">
                <table aria-label="Preview" className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-left [&>th]:whitespace-nowrap [&>th]:px-3 [&>th]:py-2 [&>th]:font-semibold">
                      <th>Row</th>{table[0]?.map((h) => <th key={h}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {table.slice(1, PREVIEW_ROWS + 1).map((cells, i) => (
                      <tr key={i} className={`border-t border-slate-100 [&>td]:whitespace-nowrap [&>td]:px-3 [&>td]:py-1.5 ${errorRowSet.has(i + 1) ? 'bg-amber-50' : ''}`}>
                        <td className="text-slate-500">{i + 1}</td>{cells.map((c, k) => <td key={k}>{c}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
