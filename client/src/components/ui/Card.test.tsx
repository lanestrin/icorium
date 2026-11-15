import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Card, type CardElement } from './Card';
import styles from './Card.module.scss';

describe('Card', () => {
  it('is a div by default', () => {
    render(<Card data-testid="card">Body</Card>);
    const card = screen.getByTestId('card');
    expect(card.tagName).toBe('DIV');
    expect(styles.card).toBeTruthy();
    expect(card).toHaveClass(styles.card);
  });

  it.each<CardElement>(['div', 'section', 'article', 'form'])('renders as %s', (element) => {
    render(<Card as={element} data-testid="card">Body</Card>);
    expect(screen.getByTestId('card').tagName).toBe(element.toUpperCase());
  });

  it('passes attributes through, so a labelled section is a region', () => {
    render(<Card as="section" aria-label="Generated files" aria-live="polite">Body</Card>);
    const region = screen.getByRole('region', { name: 'Generated files' });
    expect(region).toHaveAttribute('aria-live', 'polite');
  });

  it('as a form, submits through onSubmit', () => {
    const onSubmit = vi.fn((event: { preventDefault: () => void }) => event.preventDefault());
    render(<Card as="form" aria-label="Generate CSV files" onSubmit={onSubmit}><button type="submit">Go</button></Card>);
    fireEvent.click(screen.getByRole('button', { name: 'Go' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('form', { name: 'Generate CSV files' })).toBeInTheDocument();
  });

  it('adds className after its own class', () => {
    render(<Card className="mt-4 extra" data-testid="card">Body</Card>);
    expect(screen.getByTestId('card').className).toBe(`${styles.card} mt-4 extra`);
  });
});
