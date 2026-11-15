import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Plus, X } from 'lucide-react';
import { Button, type ButtonSize, type ButtonVariant } from './Button';
import styles from './Button.module.scss';

const VARIANTS: ButtonVariant[] = ['primary', 'secondary', 'success', 'danger', 'outline', 'ghost', 'link'];
const SIZES: ButtonSize[] = ['sm', 'md', 'lg'];

describe('Button', () => {
  it('has a distinct class for every variant and size (so the class checks below are meaningful)', () => {
    const names = [styles.button, styles.iconOnly, ...VARIANTS.map((v) => styles[v]), ...SIZES.map((s) => styles[s])];
    expect(names.every((name) => typeof name === 'string' && name.length > 0)).toBe(true);
    expect(new Set(names).size).toBe(names.length);
  });

  it('is a primary md button of type "button" by default', () => {
    render(<Button>Save</Button>);
    const button = screen.getByRole('button', { name: 'Save' });
    expect(button).toHaveAttribute('type', 'button');
    expect(button).toHaveClass(styles.button, styles.primary, styles.md);
    expect(button).not.toHaveAttribute('aria-busy');
  });

  it.each(VARIANTS)('applies the %s variant class', (variant) => {
    render(<Button variant={variant}>Go</Button>);
    expect(screen.getByRole('button', { name: 'Go' })).toHaveClass(styles[variant]);
  });

  it.each(SIZES)('applies the %s size class', (size) => {
    render(<Button size={size}>Go</Button>);
    expect(screen.getByRole('button', { name: 'Go' })).toHaveClass(styles[size]);
  });

  it('passes native props through and adds layout classes', async () => {
    const onClick = vi.fn();
    render(<Button type="submit" form="f" aria-describedby="why" className="w-full" onClick={onClick}>Send</Button>);
    const button = screen.getByRole('button', { name: 'Send' });
    expect(button).toHaveAttribute('type', 'submit');
    expect(button).toHaveAttribute('form', 'f');
    expect(button).toHaveAttribute('aria-describedby', 'why');
    expect(button).toHaveClass('w-full', styles.button);
    await userEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does nothing when disabled', async () => {
    const onClick = vi.fn();
    render(<Button disabled onClick={onClick}>Archive</Button>);
    const button = screen.getByRole('button', { name: 'Archive' });
    expect(button).toBeDisabled();
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('while loading is disabled, busy and shows a spinner in place of its icon, keeping the label', async () => {
    const onClick = vi.fn();
    render(<Button loading icon={<Plus data-testid="plus" />} onClick={onClick}>Generating…</Button>);
    const button = screen.getByRole('button', { name: 'Generating…' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByTestId('button-spinner')).toBeInTheDocument();
    expect(screen.queryByTestId('plus')).not.toBeInTheDocument();
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('shows its icon before the label', () => {
    render(<Button icon={<Plus data-testid="plus" />}>Add</Button>);
    const button = screen.getByRole('button', { name: 'Add' });
    expect(button.firstElementChild).toBe(screen.getByTestId('plus'));
    expect(button).not.toHaveClass(styles.iconOnly);
  });

  it('is icon-only with an icon and no label, named by its aria-label', () => {
    render(<Button variant="ghost" icon={<X />} aria-label="Close" />);
    expect(screen.getByRole('button', { name: 'Close' })).toHaveClass(styles.iconOnly, styles.ghost);
  });

  it('is reached with Tab and pressed with Enter or Space', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Run</Button>);
    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'Run' })).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    await userEvent.keyboard(' ');
    expect(onClick).toHaveBeenCalledTimes(2);
  });
});
