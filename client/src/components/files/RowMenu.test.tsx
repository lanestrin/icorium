import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { FileMeta } from '../../../../shared/types';
import { RowMenu } from './RowMenu';

const file: FileMeta = { id: '101010', name: 'data.csv', rows: 25, columns: 7, uploadedAt: '2026-11-06T12:00:00Z', status: 'Ready', problemRows: 0 };
const LABEL = 'Actions for 101010 data.csv';

/** The menu inside a row-like parent whose click handler must never fire, plus something outside to click. */
function setup(props: Partial<Parameters<typeof RowMenu>[0]> = {}) {
  const onRowClick = vi.fn();
  const onPreview = vi.fn();
  const user = userEvent.setup();
  render(
    <>
      <div onClick={onRowClick}>
        <RowMenu file={file} onPreview={onPreview} {...props} />
      </div>
      <button>Outside</button>
    </>,
  );
  const trigger = screen.getByRole('button', { name: LABEL });
  return { user, trigger, onRowClick, onPreview };
}

const item = (name: string) => screen.getByRole('menuitem', { name });
const itemNames = () => screen.getAllByRole('menuitem').map((i) => i.textContent?.trim());

describe('RowMenu', () => {
  it('offers Preview and Download, and Restore only when it can restore', async () => {
    const { user, trigger } = setup();
    await user.click(trigger);
    expect(screen.getByRole('menu', { name: LABEL })).toBeInTheDocument();
    expect(itemNames()).toEqual(['Preview file', 'Download file']);
    expect(item('Download file')).toHaveAttribute('href', '/api/files/101010/download');
  });

  it('adds Restore in the archived menu', async () => {
    const { user, trigger } = setup({ onRestore: vi.fn() });
    await user.click(trigger);
    expect(itemNames()).toEqual(['Preview file', 'Download file', 'Restore file']);
  });

  it('opens from the keyboard on the first item, wraps with the arrow keys and closes with Escape', async () => {
    const { user, trigger } = setup({ onRestore: vi.fn() });
    trigger.focus();
    await user.keyboard('{Enter}');
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(item('Preview file')).toHaveFocus();
    await user.keyboard('{ArrowUp}');
    expect(item('Restore file')).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(item('Preview file')).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('closes on a click outside, and that click still reaches what was clicked', async () => {
    const { user, trigger } = setup();
    const onOutside = vi.fn();
    screen.getByRole('button', { name: 'Outside' }).addEventListener('click', onOutside);
    await user.click(trigger);
    await user.click(screen.getByRole('button', { name: 'Outside' }));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(onOutside).toHaveBeenCalledTimes(1);
  });

  it('runs Preview once, after focus is back on ⋯', async () => {
    const { user, trigger, onPreview } = setup();
    let focusedWhenRun: Element | null = null;
    onPreview.mockImplementation(() => { focusedWhenRun = document.activeElement; });
    await user.click(trigger);
    await user.click(item('Preview file'));
    await waitFor(() => expect(onPreview).toHaveBeenCalledTimes(1));
    expect(focusedWhenRun).toBe(trigger);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('runs Restore once', async () => {
    const onRestore = vi.fn();
    const { user, trigger } = setup({ onRestore });
    await user.click(trigger);
    await user.click(item('Restore file'));
    await waitFor(() => expect(onRestore).toHaveBeenCalledTimes(1));
  });

  it('marks a disabled Restore and ignores choosing it', async () => {
    const onRestore = vi.fn();
    const { user, trigger } = setup({ onRestore, disabled: true });
    await user.click(trigger);
    expect(item('Restore file')).toHaveAttribute('aria-disabled', 'true');
    await user.click(item('Restore file'));
    expect(onRestore).not.toHaveBeenCalled();
  });

  it('never passes a click on ⋯ or an item to the row', async () => {
    const { user, trigger, onRowClick } = setup();
    await user.click(trigger);
    await user.click(item('Preview file'));
    expect(onRowClick).not.toHaveBeenCalled();
  });
});
