import styles from './compare.module.scss';

/** One colour per compared file, in order (tokens.css). A file keeps its colour in every chip, chart and table. */
export const FILE_COLORS = [1, 2, 3, 4, 5].map((n) => `var(--app-chart-series-${n})`);

/** A small dot in a file's colour, used beside its name. */
export const Dot = ({ k }: { k: number }) =>
  <span className={styles.dot} style={{ background: FILE_COLORS[k] }} aria-hidden />;
