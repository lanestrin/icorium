import type { ReactNode } from 'react';
import { Check, CircleAlert, X } from 'lucide-react';

/**
 * A message box on a page: green with a tick for success (announced as a status), red for an error
 * (announced as an alert). With onDismiss it has a close button. className sets its spacing.
 */
export function Banner({ tone, onDismiss, className = '', children }: {
  tone: 'success' | 'error';
  onDismiss?: () => void;
  className?: string;
  children: ReactNode;
}) {
  const isSuccess = tone === 'success';
  const Icon = isSuccess ? Check : CircleAlert;
  const colors = isSuccess ? 'border-green-200 bg-green-50 text-green-800' : 'whitespace-pre-line border-red-200 bg-red-50 text-red-700';
  return (
    <div role={isSuccess ? 'status' : 'alert'} className={`${className} flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${colors}`}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <span className="flex-1">{children}</span>
      {onDismiss && <button onClick={onDismiss} aria-label="Dismiss"><X className="h-4 w-4" /></button>}
    </div>
  );
}
