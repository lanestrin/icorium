import type { ReactNode } from 'react';
import { Check, CircleAlert, X } from 'lucide-react';
import { classNames } from '../lib/class-names';
import styles from './Banner.module.css';

/**
 * A message box on a page: green with a tick for success (announced as a status), red for an error
 * (announced as an alert). With onDismiss it has a close button. className sets its spacing.
 */
export function Banner({ tone, onDismiss, className, children }: {
  tone: 'success' | 'error';
  onDismiss?: () => void;
  className?: string;
  children: ReactNode;
}) {
  const isSuccess = tone === 'success';
  const Icon = isSuccess ? Check : CircleAlert;
  return (
    <div role={isSuccess ? 'status' : 'alert'} className={classNames(className, styles.banner, isSuccess ? styles.success : styles.error)}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <span className="flex-1">{children}</span>
      {onDismiss && <button onClick={onDismiss} aria-label="Dismiss"><X className="h-4 w-4" /></button>}
    </div>
  );
}
