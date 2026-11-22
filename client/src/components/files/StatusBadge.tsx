import { Check, CircleAlert, Columns3, Layers, LoaderCircle, TriangleAlert, type LucideIcon } from 'lucide-react';
import { classNames } from '../../lib/class-names';
import type { Status } from '../../lib/file-status';
import styles from './files.module.scss';

/** Each status's colours and icon. */
const BADGES: Record<Status, { colors: string; icon: LucideIcon }> = {
  Ready: { colors: styles.badgeReady, icon: Check },
  'Needs Review': { colors: styles.badgeNeedsReview, icon: TriangleAlert },
  'Needs Mapping': { colors: styles.badgeNeedsReview, icon: Columns3 },
  Processed: { colors: styles.badgeProcessed, icon: Layers },
  Processing: { colors: styles.badgeProcessing, icon: LoaderCircle },
  Error: { colors: styles.badgeError, icon: CircleAlert },
};

/** A file's status as a coloured pill with an icon; Processing spins. */
export function StatusBadge({ status }: { status: Status }) {
  const { colors, icon: Icon } = BADGES[status];
  const isProcessing = status === 'Processing';
  return (
    <span className={classNames(styles.badge, colors)}>
      <Icon className={classNames(styles.badgeIcon, isProcessing && styles.spinning)} aria-hidden />
      {isProcessing ? 'Processing…' : status}
    </span>
  );
}
