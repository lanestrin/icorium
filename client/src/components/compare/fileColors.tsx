import styles from './compare.module.scss';

/** One colour per compared file, in order. A file keeps its colour in every chip, chart and table. */
export const FILE_COLORS = ['#2563eb', '#f59e0b', '#16a34a', '#9333ea', '#ec4899'];

/** A small dot in a file's colour, used beside its name. */
export const Dot = ({ k }: { k: number }) =>
  <span className={styles.dot} style={{ background: FILE_COLORS[k] }} aria-hidden />;
