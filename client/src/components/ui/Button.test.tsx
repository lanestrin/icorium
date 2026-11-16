// The variant and size classes, checked as a table over every value. Behaviour (clicks, keyboard,
// disabled, loading, icons, native props) lives in the play functions of Button.stories.tsx, which
// components/stories.test.tsx runs.
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Plus, X } from 'lucide-react';
import { Button, type ButtonSize, type ButtonVariant } from './Button';
import styles from './Button.module.scss';

const VARIANTS: ButtonVariant[] = ['primary', 'secondary', 'success', 'danger', 'outline', 'ghost', 'link'];
const SIZES: ButtonSize[] = ['sm', 'md', 'lg'];

describe('Button classes', () => {
  it('has a distinct class for every variant and size (so the class checks below are meaningful)', () => {
    const names = [styles.button, styles.iconOnly, ...VARIANTS.map((v) => styles[v]), ...SIZES.map((s) => styles[s])];
    expect(names.every((name) => typeof name === 'string' && name.length > 0)).toBe(true);
    expect(new Set(names).size).toBe(names.length);
  });

  it('is primary and md by default', () => {
    render(<Button>Save</Button>);
    expect(screen.getByRole('button', { name: 'Save' })).toHaveClass(styles.button, styles.primary, styles.md);
  });

  it.each(VARIANTS)('applies the %s variant class', (variant) => {
    render(<Button variant={variant}>Go</Button>);
    expect(screen.getByRole('button', { name: 'Go' })).toHaveClass(styles[variant]);
  });

  it.each(SIZES)('applies the %s size class', (size) => {
    render(<Button size={size}>Go</Button>);
    expect(screen.getByRole('button', { name: 'Go' })).toHaveClass(styles[size]);
  });

  it('keeps its own class beside a layout class', () => {
    render(<Button className="w-full">Send</Button>);
    expect(screen.getByRole('button', { name: 'Send' })).toHaveClass('w-full', styles.button);
  });

  it('is icon-only with an icon and no label, and not with a label', () => {
    render(<><Button variant="ghost" icon={<X />} aria-label="Close" /><Button icon={<Plus />}>Add</Button></>);
    expect(screen.getByRole('button', { name: 'Close' })).toHaveClass(styles.iconOnly, styles.ghost);
    expect(screen.getByRole('button', { name: 'Add' })).not.toHaveClass(styles.iconOnly);
  });
});
