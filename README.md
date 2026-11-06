# Reclaim Studio

Upload partner refrigerant CSVs, run one of three processing functions on every row, export results (original columns + generated columns), and compare two result files.

Interview exercise. All data is fictional and the classification rules are demo-only.

## Run

```bash
npm install
npm run dev      # API on :3001, UI on http://localhost:5173
npm test         # Vitest: parsing, adapters, processing, export, compare
```

The five sample CSVs in `sample-data/` are loaded the first time the server starts. To reset the demo, delete `server/data/`. To regenerate the samples, run `npm run samples`.

## Layout

```
client/   React + Vite + Tailwind UI (App, Sidebar, FileTable, CompareFooter, Modals)
server/   Fastify API
  src/adapters/    partner header and unit mappings -> one normalized record
  src/processing/  the three processing functions
  src/lib/         csv parse/export, local storage, compare
  src/routes/      /api/files, /api/process, /api/compare
shared/   types shared by client and server
```

## Extending

- **New partner CSV schema:** add one entry to `ADAPTERS` in `server/src/adapters/index.ts`, listing the column names and the unit factors.
- **New processing function:** add an entry to `processors` in `server/src/processing/index.ts`, plus its label in `PROCESSORS` in `shared/types.ts`. Add the id to the Zod enum in `routes/files.ts`.
- **Different storage:** only `server/src/lib/storage.ts` reads or writes the disk.
