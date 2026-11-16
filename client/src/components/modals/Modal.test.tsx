import { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Modal } from './Modal';
import styles from './modals.module.scss';

/** Opens the dialog from a button and unmounts it on close, as the app's parents do. */
function Harness({ subtitle, onClose = () => {} }: { subtitle?: string; onClose?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Open</button>
      {open && (
        <Modal title="Preview" subtitle={subtitle} actions={<button>Download</button>} onClose={() => { onClose(); setOpen(false); }}>
          <p>Body text</p>
          <button>Last</button>
        </Modal>
      )}
    </>
  );
}

async function openDialog(props: Parameters<typeof Harness>[0] = {}) {
  const user = userEvent.setup();
  render(<Harness {...props} />);
  await user.click(screen.getByRole('button', { name: 'Open' }));
  return { user, dialog: await screen.findByRole('dialog', { name: 'Preview' }) };
}

describe('Modal', () => {
  it('is named by its title and described by its subtitle', async () => {
    const { dialog } = await openDialog({ subtitle: '25 rows' });
    expect(dialog).toHaveAccessibleDescription('25 rows');
  });

  it('has no description without a subtitle', async () => {
    const { dialog } = await openDialog();
    expect(dialog).not.toHaveAttribute('aria-describedby');
  });

  it('focuses the panel on open', async () => {
    const { dialog } = await openDialog();
    expect(dialog).toHaveFocus();
  });

  it('keeps Tab and Shift+Tab inside the dialog', async () => {
    const { user } = await openDialog();
    const first = screen.getByRole('button', { name: 'Download' });
    const last = screen.getByRole('button', { name: 'Last' });
    last.focus();
    await user.tab();
    expect(first).toHaveFocus();
    await user.tab({ shift: true });
    expect(last).toHaveFocus();
  });

  it.each([
    ['Escape', (user: ReturnType<typeof userEvent.setup>) => user.keyboard('{Escape}')],
    ['the Close button', (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole('button', { name: 'Close' }))],
    // The backdrop is the element that wraps the panel.
    ['a backdrop click', (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole('dialog').parentElement!)],
  ])('closes on %s and returns focus to the opener', async (_, close) => {
    const onClose = vi.fn();
    const { user } = await openDialog({ onClose });
    await close(user);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Open' })).toHaveFocus());
  });

  it('stays open on a click inside the panel', async () => {
    const onClose = vi.fn();
    const { user, dialog } = await openDialog({ onClose });
    await user.click(screen.getByText('Body text'));
    expect(onClose).not.toHaveBeenCalled();
    expect(dialog).toBeInTheDocument();
  });

  it('puts the actions in their own group, separate from the heading, with Close last', async () => {
    const { dialog } = await openDialog({ subtitle: '25 rows' });
    const actions = screen.getByRole('button', { name: 'Download' }).parentElement!;
    expect(actions).toHaveClass(styles.actions);
    expect(actions).not.toContainElement(screen.getByRole('heading', { name: 'Preview' }));
    const header = actions.parentElement!;
    expect(header).toHaveClass(styles.header);
    expect(header.lastElementChild).toBe(screen.getByRole('button', { name: 'Close' }));
    expect(dialog).toContainElement(header);
  });

  it('gives the title its full text as a tooltip', async () => {
    await openDialog();
    expect(screen.getByRole('heading', { name: 'Preview' })).toHaveAttribute('title', 'Preview');
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
