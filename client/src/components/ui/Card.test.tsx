// What the Card stories don't show: the element and class contract. Its named-region, article and form
// behaviour lives in the play functions of Card.stories.tsx, which components/stories.test.tsx runs.
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Card, type CardElement } from './Card';
import styles from './Card.module.scss';

describe('Card', () => {
  it.each<CardElement>(['div', 'section', 'article', 'form'])('renders as %s with its own class', (element) => {
    render(<Card as={element} data-testid="card">Body</Card>);
    const card = screen.getByTestId('card');
    expect(card.tagName).toBe(element.toUpperCase());
    expect(styles.card).toBeTruthy();
    expect(card).toHaveClass(styles.card);
  });

  it('adds className after its own class', () => {
    render(<Card className="mt-4 extra" data-testid="card">Body</Card>);
    expect(screen.getByTestId('card').className).toBe(`${styles.card} mt-4 extra`);
  });
});
