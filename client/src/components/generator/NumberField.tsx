import styles from './generator.module.css';

/** A whole-number field with its help text linked as a description, not as part of its name. */
export function NumberField({ id, label, value, setValue, min, max, help }: {
  id: string; label: string; value: string; setValue: (value: string) => void; min: number; max: number; help: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block font-semibold">{label}</label>
      <input id={id} type="number" inputMode="numeric" min={min} max={max} step={1} required value={value}
        onChange={(e) => setValue(e.target.value)} aria-describedby={`${id}-help`} className={styles.numberInput} />
      <p id={`${id}-help`} className="mt-1 text-sm text-slate-500">{help}</p>
    </div>
  );
}
