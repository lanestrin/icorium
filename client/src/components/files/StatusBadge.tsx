import { Check, CircleAlert, Layers, LoaderCircle, TriangleAlert, type LucideIcon } from 'lucide-react';
import { classNames } from '../../lib/class-names';
import type { Status } from '../../lib/file-status';
import styles from './files.module.css';

/** Each status's colours and icon. */
const BADGES: Record<Status, { colors: string; icon: LucideIcon }> = {
  Ready: { colors: 'bg-green-50 text-green-700', icon: Check },
  'Needs Review': { colors: 'bg-amber-50 text-amber-800', icon: TriangleAlert },
  Processed: { colors: 'bg-violet-50 text-violet-700', icon: Layers },
  Processing: { colors: 'bg-blue-50 text-blue-700', icon: LoaderCircle },
  Error: { colors: 'bg-red-50 text-red-700', icon: CircleAlert },
};

/** A file's status as a coloured pill with an icon; Processing spins. */
export function StatusBadge({ status }: { status: Status }) {
  const { colors, icon: Icon } = BADGES[status];
  const isProcessing = status === 'Processing';
  return (
    <span className={classNames(styles.badge, colors)}>
      <Icon className={classNames('h-4 w-4', isProcessing && 'animate-spin')} />
      {isProcessing ? 'Processing…' : status}
    </span>
  );
}
