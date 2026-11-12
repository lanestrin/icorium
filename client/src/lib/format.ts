/** A caught error's message, for showing in a banner. */
export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** "1 file", "3 files", "1,200 rows". */
export const plural = (n: number, word = 'file') => `${n.toLocaleString()} ${word}${n === 1 ? '' : 's'}`;

/** "1 row", "3 rows", or with a qualifier "1 valid row". */
export const rowsWord = (n: number, kind?: string) => `${n.toLocaleString()} ${kind ? `${kind} ` : ''}${n === 1 ? 'row' : 'rows'}`;

/** Shows a message in the page's banner; undefined clears it. */
export type Report = (message: string | undefined) => void;
