// The layout classes, which the stories can't name. The dialog's behaviour (name and description,
// focus on open, focus trap, closing by Escape, Close or backdrop with focus returned, staying open on
// an inside click, the title tooltip, the actions group) lives in the play functions of
// Modal.stories.tsx, which components/stories.test.tsx runs.
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Modal } from './Modal';
import styles from './modals.module.scss';

describe('Modal layout classes', () => {
  it('puts the actions in the actions group inside the header', async () => {
    render(<Modal title="Preview" actions={<button>Download</button>} onClose={() => {}}><p>Body</p></Modal>);
    const actions = (await screen.findByRole('button', { name: 'Download' })).parentElement!;
    expect(actions).toHaveClass(styles.actions);
    expect(actions.parentElement).toHaveClass(styles.header);
  });

  it('adds no actions group when there are no actions', async () => {
    render(<Modal title="Replace existing result?" narrow onClose={() => {}}><p>Body</p></Modal>);
    const dialog = await screen.findByRole('dialog');
    expect(dialog.querySelector(`.${styles.actions}`)).toBeNull();
  });

  it.each([
    ['a wide dialog fills a phone screen', {}, styles.panelWide, styles.backdropFull],
    ['a narrow dialog stays a card', { narrow: true }, styles.panelNarrow, styles.backdropPadded],
    ['a full dialog fills the screen', { full: true }, styles.panelFull, styles.backdropFull],
  ])('%s', async (_name, size, panelClass, backdropClass) => {
    render(<Modal title="Dialog" onClose={() => {}} {...size}><p>Body</p></Modal>);
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveClass(panelClass);
    expect(dialog.parentElement).toHaveClass(backdropClass);
  });
});
