import type { ReactNode } from 'react';
import { classNames } from '../../lib/class-names';
import styles from './generator.module.css';

/**
 * One radio choice drawn as a card; the chosen one is blue. layout "card" is a larger option with a
 * title and description (partners); "chip" is a compact one-line option (data quality).
 */
export function ChoiceOption({ name, checked, onSelect, layout, children }: {
  name: string; checked: boolean; onSelect: () => void; layout: 'card' | 'chip'; children: ReactNode;
}) {
  const isCard = layout === 'card';
  return (
    <label className={classNames(styles.choice, isCard ? styles.choiceCard : styles.choiceChip, checked && styles.choiceSelected)}>
      <input type="radio" name={name} checked={checked} onChange={onSelect} className={classNames(styles.radio, isCard && 'mt-1')} />
      {children}
    </label>
  );
}
