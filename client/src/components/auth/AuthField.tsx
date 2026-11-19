import { forwardRef, useId, type InputHTMLAttributes } from 'react';
import { classNames } from '../../lib/class-names';
import styles from './auth.module.scss';

type AuthFieldProps = {
  label: string;
  /** A short tip under the field, read with it by screen readers. */
  hint?: string;
  /** A problem with this field, shown under it, announced, and marking the field invalid. */
  error?: string | null;
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'className'>;

/** A labelled text input for the sign-in forms. The hint and error are tied to it with aria-describedby. */
export const AuthField = forwardRef<HTMLInputElement, AuthFieldProps>(function AuthField({ label, hint, error, ...input }, ref) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>{label}</label>
      <input
        ref={ref}
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={[hintId, errorId].filter(Boolean).join(' ') || undefined}
        className={classNames(styles.input, error && styles.inputInvalid)}
        {...input}
      />
      {hint && <p id={hintId} className={styles.hint}>{hint}</p>}
      {error && <p id={errorId} role="alert" className={styles.error}>{error}</p>}
    </div>
  );
});
