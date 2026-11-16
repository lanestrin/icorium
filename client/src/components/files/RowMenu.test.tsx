// How the menu behaves inside a file row, which a story can't show: the row's own click handler and
// other controls on the page. The menu itself (items, keyboard, Preview and Restore, disabled Restore)
// lives in the play functions of RowMenu.stories.tsx, which components/stories.test.tsx runs.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { FileMeta } from '../../../../shared/types';
import { RowMenu } from './RowMenu';

const file: FileMeta = { id: '101010', name: 'data.csv', rows: 25, columns: 7, uploadedAt: '2026-11-06T12:00:00Z', status: 'Ready', problemRows: 0 };
const LABEL = 'Actions for 101010 data.csv';

/** The menu inside a row-like parent whose click handler must never fire, plus something outside to click. */
function setup() {
  const onRowClick = vi.fn();
  const user = userEvent.setup();
  render(
    <>
      <div onClick={onRowClick}>
        <RowMenu file={file} onPreview={vi.fn()} />
      </div>
      <button>Outside</button>
    </>,
  );
  return { user, trigger: screen.getByRole('button', { name: LABEL }), onRowClick };
}

describe('RowMenu in a row', () => {
  it('closes on a click outside, and that click still reaches what was clicked', async () => {
    const { user, trigger } = setup();
    const onOutside = vi.fn();
    screen.getByRole('button', { name: 'Outside' }).addEventListener('click', onOutside);
    await user.click(trigger);
    await user.click(screen.getByRole('button', { name: 'Outside' }));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(onOutside).toHaveBeenCalledTimes(1);
  });

  it('never passes a click on ⋯ or an item to the row', async () => {
    const { user, trigger, onRowClick } = setup();
    await user.click(trigger);
    await user.click(screen.getByRole('menuitem', { name: 'Preview file' }));
    expect(onRowClick).not.toHaveBeenCalled();
  });
});
