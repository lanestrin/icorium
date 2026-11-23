import { forwardRef, useId, useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { classNames } from '../../lib/class-names';
import styles from './auth.module.scss';

type AuthFieldProps = {
  label: string;
  /** A short tip under the field, read with it by screen readers. */
  hint?: string;
  /** A problem with this field, shown under it, announced, and marking the field invalid. */
  error?: string | null;
  /** A decorative icon at the start of the input. */
  icon?: ReactNode;
  /** Hides the label on screen but keeps it for screen readers; pair with a placeholder. */
  hideLabel?: boolean;
  /** For a password input: adds a button that shows or hides what was typed. */
  revealable?: boolean;
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'className'>;

/** A labelled text input for the sign-in forms. The hint and error are tied to it with aria-describedby. */
export const AuthField = forwardRef<HTMLInputElement, AuthFieldProps>(function AuthField({ label, hint, error, icon, hideLabel, revealable, type, ...input }, ref) {
  const id = useId();
  const [revealed, setRevealed] = useState(false);
  const showToggle = revealable && type === 'password';
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={classNames(styles.label, hideLabel && styles.hiddenLabel)}>{label}</label>
      <div className={styles.control}>
        {icon && <span className={styles.icon} aria-hidden>{icon}</span>}
        <input
          ref={ref}
          id={id}
          type={showToggle && revealed ? 'text' : type}
          aria-invalid={error ? true : undefined}
          aria-describedby={[hintId, errorId].filter(Boolean).join(' ') || undefined}
          className={classNames(styles.input, error && styles.inputInvalid, icon ? styles.withIcon : false, showToggle && styles.withToggle)}
          {...input}
        />
        {showToggle && (
          <button type="button" className={styles.reveal} aria-label={revealed ? 'Hide password' : 'Show password'} aria-pressed={revealed} onClick={() => setRevealed(!revealed)}>
            {revealed ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
          </button>
        )}
      </div>
      {hint && <p id={hintId} className={styles.hint}>{hint}</p>}
      {error && <p id={errorId} role="alert" className={styles.error}>{error}</p>}
    </div>
  );
});
