import styles from './generator.module.scss';

/** A whole-number field with its help text linked as a description, not as part of its name. */
export function NumberField({ id, label, value, setValue, min, max, help }: {
  id: string; label: string; value: string; setValue: (value: string) => void; min: number; max: number; help: string;
}) {
  return (
    <div>
      <label htmlFor={id} className={styles.fieldLabel}>{label}</label>
      <input id={id} type="number" inputMode="numeric" min={min} max={max} step={1} required value={value}
        onChange={(e) => setValue(e.target.value)} aria-describedby={`${id}-help`} className={styles.numberInput} />
      <p id={`${id}-help`} className={styles.fieldHelp}>{help}</p>
    </div>
  );
}
