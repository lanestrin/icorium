import type { HTMLAttributes } from 'react';
import { classNames } from '../../lib/class-names';
import styles from './Card.module.scss';

export type CardElement = 'div' | 'section' | 'article' | 'form';

export type CardProps = {
  /** The element to render. Default div; use section, article or form when that is what the card is. */
  as?: CardElement;
} & HTMLAttributes<HTMLElement>;

/** A white panel with a soft border and shadow. className adds layout (grid, spacing) on top. */
export function Card({ as: Element = 'div', className, ...rest }: CardProps) {
  return <Element className={classNames(styles.card, className)} {...rest} />;
}
