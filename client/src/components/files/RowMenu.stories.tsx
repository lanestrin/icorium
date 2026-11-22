import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import type { FileMeta } from '../../../../shared/types';
import { RowMenu } from './RowMenu';

const file: FileMeta = { id: '101010', name: 'data.csv', rows: 25, columns: 7, uploadedAt: '2026-11-06T12:00:00Z', status: 'Ready', problemRows: 0 };
const LABEL = 'Actions for 101010 data.csv';

const meta = {
  title: 'Files/RowMenu',
  component: RowMenu,
  args: { file, onPreview: fn(), onDownload: fn() },
  parameters: {
    docs: {
      description: {
        component: [
          'The ⋯ menu at the end of a file row (Radix DropdownMenu): Preview file and Download file, plus Map columns for an input with a mapping to review and Restore file in the archived view. It is non-modal: a click outside closes it and still reaches what was clicked.',
          '**When not to use it:** for actions on several selected files (the selection bar) or a question that needs an answer (Modal).',
          '**Accessibility:** the ⋯ button is named "Actions for <File ID> <name>". Enter or Space opens the menu on its first item, the arrow keys move and wrap, Escape closes it and focus goes back to ⋯. A chosen action runs once, after focus is back on ⋯.',
          '**Motion:** none. The menu opens and closes without an entrance or exit animation.',
        ].join('\n\n'),
      },
    },
  },
} satisfies Meta<typeof RowMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The open menu renders in a portal at the end of the page, outside the story's canvas. */
const page = (canvasElement: HTMLElement) => within(canvasElement.ownerDocument.body);
const itemNames = (canvasElement: HTMLElement) => page(canvasElement).getAllByRole('menuitem').map((i) => i.textContent?.trim());

export const ActiveFile: Story = {
  play: async ({ args, canvasElement }) => {
    const screen = page(canvasElement);
    const trigger = screen.getByRole('button', { name: LABEL });
    await userEvent.click(trigger);
    await expect(screen.getByRole('menu', { name: LABEL })).toBeInTheDocument();
    await expect(itemNames(canvasElement)).toEqual(['Preview file', 'Download file']);

    // Preview runs once, after focus is back on ⋯.
    let focusedWhenRun: Element | null = null;
    args.onPreview.mockImplementation(() => { focusedWhenRun = canvasElement.ownerDocument.activeElement; });
    await userEvent.click(screen.getByRole('menuitem', { name: 'Preview file' }));
    await waitFor(() => expect(args.onPreview).toHaveBeenCalledTimes(1));
    await expect(focusedWhenRun).toBe(trigger);
    await expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  },
};

export const Download: Story = {
  parameters: { docs: { description: { story: 'Download file saves the file once, after the menu has closed and focus is back on ⋯.' } } },
  play: async ({ args, canvasElement }) => {
    const screen = page(canvasElement);
    const trigger = screen.getByRole('button', { name: LABEL });
    await userEvent.click(trigger);
    await userEvent.click(screen.getByRole('menuitem', { name: 'Download file' }));
    await waitFor(() => expect(args.onDownload).toHaveBeenCalledTimes(1));
    await expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    await expect(trigger).toHaveFocus();
  },
};

export const ArchivedFile: Story = {
  args: { onRestore: fn() },
  play: async ({ args, canvasElement }) => {
    const screen = page(canvasElement);
    await userEvent.click(screen.getByRole('button', { name: LABEL }));
    await expect(itemNames(canvasElement)).toEqual(['Preview file', 'Download file', 'Restore file']);
    await userEvent.click(screen.getByRole('menuitem', { name: 'Restore file' }));
    await waitFor(() => expect(args.onRestore).toHaveBeenCalledTimes(1));
  },
};

export const MapColumns: Story = {
  args: { onMapColumns: fn() },
  parameters: { docs: { description: { story: 'An input that has a column mapping to review also offers Map columns, which opens the mapping dialog once the menu has closed and focus is back on ⋯.' } } },
  play: async ({ args, canvasElement }) => {
    const screen = page(canvasElement);
    const trigger = screen.getByRole('button', { name: LABEL });
    await userEvent.click(trigger);
    await expect(itemNames(canvasElement)).toEqual(['Preview file', 'Download file', 'Map columns']);
    await userEvent.click(screen.getByRole('menuitem', { name: 'Map columns' }));
    await waitFor(() => expect(args.onMapColumns).toHaveBeenCalledTimes(1));
    await expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    await expect(trigger).toHaveFocus();
  },
};

export const RestoreDisabled: Story = {
  args: { onRestore: fn(), disabled: true },
  parameters: { docs: { description: { story: 'While another action runs, Restore is marked disabled and choosing it does nothing.' } } },
  play: async ({ args, canvasElement }) => {
    const screen = page(canvasElement);
    await userEvent.click(screen.getByRole('button', { name: LABEL }));
    const restore = screen.getByRole('menuitem', { name: 'Restore file' });
    await expect(restore).toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(restore);
    await expect(args.onRestore).not.toHaveBeenCalled();
  },
};

export const Keyboard: Story = {
  args: { onRestore: fn() },
  parameters: { docs: { description: { story: 'Enter opens the menu on its first item; the arrow keys wrap; Escape closes it and returns focus to ⋯.' } } },
  play: async ({ canvasElement }) => {
    const screen = page(canvasElement);
    const trigger = screen.getByRole('button', { name: LABEL });
    const item = (name: string) => screen.getByRole('menuitem', { name });
    trigger.focus();
    await userEvent.keyboard('{Enter}');
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await expect(item('Preview file')).toHaveFocus();
    await userEvent.keyboard('{ArrowUp}');
    await expect(item('Restore file')).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}');
    await expect(item('Preview file')).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    await expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    // Radix returns focus on a timer after the menu unmounts.
    await waitFor(() => expect(trigger).toHaveFocus());
  },
};
