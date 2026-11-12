import { ArrowRight, Cloud, Laptop } from 'lucide-react';
import { STORAGE_OPTIONS } from './content';
import { Section, Checks, Path, CARD } from './Section';

/** Section 5: local and Vercel hosting, and the storage backends behind one interface. */
export function StorageSection() {
  return (
    <Section id="storage" eyebrow="5 · Storage and deployment" title="Hosting and storage" side
      intro="Separate concerns, one storage interface. Routes and processing never touch persistence; the backend is chosen at startup.">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.25fr)]">
        <article className={CARD}>
          <h3 className="flex items-center gap-2 font-semibold"><Laptop className="h-5 w-5 text-blue-600" aria-hidden /> Local development</h3>
          <Checks label="Local development" items={[
            'Node.js API with filesystem storage',
            <>Originals, results and metadata under <Path>server/data</Path></>,
          ]} />
        </article>
        <article className={CARD}>
          <h3 className="flex items-center gap-2 font-semibold"><Cloud className="h-5 w-5 text-blue-600" aria-hidden /> Optional Vercel deployment</h3>
          <Checks label="Optional Vercel deployment" items={['Separate frontend and API services', 'Private Vercel Blob storage', 'Configured, not yet deployed']} />
        </article>
        <div className="md:col-span-2 xl:col-span-1">
          <h3 className="text-sm font-semibold">Storage options</h3>
          <div role="img" className="mt-3 flex items-stretch gap-1"
            aria-label="Storage options: the local filesystem (the default) and private Vercel Blob are built; S3 or Cloudflare R2 could be added as another backend behind the same interface.">
            {STORAGE_OPTIONS.map((o, i) => (
              <div key={o.name} className="flex min-w-0 flex-1 items-center gap-1">
                {i > 0 && <ArrowRight className="h-4 w-4 shrink-0 text-blue-400" aria-hidden />}
                <div className={`flex h-full min-w-0 flex-1 flex-col items-center rounded-xl px-2 py-3 text-center ${i === 0 ? 'border border-blue-300 bg-blue-50' : o.built ? 'border border-slate-200 bg-white' : 'border border-dashed border-slate-300 bg-slate-50 text-slate-400'}`}>
                  <o.icon className={`h-5 w-5 ${o.built ? 'text-blue-600' : 'text-slate-400'}`} aria-hidden />
                  <span className={`mt-1 text-xs font-semibold ${o.built ? 'text-slate-800' : ''}`}>{o.name}</span>
                  <span className="text-[11px] text-slate-500">{o.note}</span>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-slate-500">
            One interface (list · get · read · patch · create · createAt · put) in <Path>server/src/lib</Path>, so another backend changes nothing else.
          </p>
        </div>
      </div>
    </Section>
  );
}
