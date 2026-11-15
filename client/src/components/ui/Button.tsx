import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { LoaderCircle } from 'lucide-react';
import { classNames } from '../../lib/class-names';
import styles from './Button.module.scss';

export type ButtonVariant = 'primary' | 'secondary' | 'success' | 'danger' | 'outline' | 'ghost' | 'link';
export type ButtonSize = 'sm' | 'md' | 'lg';

export type ButtonProps = {
  /** The look: filled primary (default), secondary, success or danger; blue outline; ghost; or an inline link. */
  variant?: ButtonVariant;
  /** Padding and text size. Default md. */
  size?: ButtonSize;
  /** While true the button is disabled, announced as busy, and shows a spinner in place of its icon. */
  loading?: boolean;
  /** An icon shown before the label. With no label the button is icon-only and needs an aria-label. */
  icon?: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>;

/**
 * The app's one button. className is for layout only (w-full, ml-auto); colour, padding and shape
 * come from variant and size. Every native button prop passes through; type defaults to "button".
 */
export function Button({ variant = 'primary', size = 'md', loading = false, icon, type = 'button', disabled, className, children, ...rest }: ButtonProps) {
  const iconOnly = icon !== undefined && (children === undefined || children === null || children === false);
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={classNames(styles.button, styles[variant], styles[size], iconOnly && styles.iconOnly, className)}
      {...rest}
    >
      {loading ? <LoaderCircle className={styles.spinner} aria-hidden="true" data-testid="button-spinner" /> : icon}
      {children}
    </button>
  );
}
