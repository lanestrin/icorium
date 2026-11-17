// The five synthetic partner CSVs from sample-data/, bundled into the page as text at build time, so every
// browser's workspace starts with them. The files themselves are never changed.
const files = import.meta.glob<string>('../../../sample-data/*.csv', { query: '?raw', import: 'default', eager: true });

/** Each sample's file name and CSV text. */
export const SAMPLE_FILES = Object.entries(files).map(([path, text]) => ({ name: path.slice(path.lastIndexOf('/') + 1), text }));
