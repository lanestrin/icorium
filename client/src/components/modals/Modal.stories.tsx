import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { Button } from '../ui/Button';
import { Modal } from './Modal';

const meta = {
  title: 'Modals/Modal',
  component: Modal,
  args: {
    title: 'Preview',
    subtitle: '25 rows',
    actions: <Button variant="secondary" size="sm">Download</Button>,
    onClose: fn(),
    children: (
      <>
        <p>Body text</p>
        <Button variant="secondary">Last</Button>
      </>
    ),
  },
  parameters: {
    docs: {
      description: {
        component: [
          'The app\'s dialog (Radix Dialog): a title, an optional subtitle, optional actions beside Close, and a body. `narrow` is a small confirmation card; `full` fills the screen for the comparison; the default is a wide panel. Below 640px a wide or full dialog fills the screen.',
          '**When not to use it:** for a message that needs no answer (Banner) or a short list of actions on one row (the row ⋯ menu).',
          '**Accessibility:** named by its title and described by its subtitle. Focus moves to the panel on open, Tab and Shift+Tab stay inside, and Escape, Close or a click on the backdrop closes it, returning focus to the control that opened it.',
          '**Motion:** none. The dialog opens and closes without an entrance or exit animation.',
        ].join('\n\n'),
      },
    },
  },
} satisfies Meta<typeof Modal>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The dialog renders in a portal at the end of the page, outside the story's canvas. */
const page = (canvasElement: HTMLElement) => within(canvasElement.ownerDocument.body);

export const Default: Story = {
  play: async ({ args, canvasElement }) => {
    const screen = page(canvasElement);
    const dialog = await screen.findByRole('dialog', { name: 'Preview' });
    await expect(dialog).toHaveAccessibleDescription('25 rows');
    await expect(dialog).toHaveFocus();
    // The full title is a tooltip, for when it is cut short.
    await expect(screen.getByRole('heading', { name: 'Preview' })).toHaveAttribute('title', 'Preview');

    // The actions sit in their own group beside the heading, with Close last.
    const actions = screen.getByRole('button', { name: 'Download' }).parentElement!;
    await expect(actions).not.toContainElement(screen.getByRole('heading', { name: 'Preview' }));
    await expect(actions.parentElement!.lastElementChild).toBe(screen.getByRole('button', { name: 'Close' }));

    // Tab and Shift+Tab stay inside the dialog.
    const first = screen.getByRole('button', { name: 'Download' });
    const last = screen.getByRole('button', { name: 'Last' });
    last.focus();
    await userEvent.tab();
    await expect(first).toHaveFocus();
    await userEvent.tab({ shift: true });
    await expect(last).toHaveFocus();

    // A click inside the panel keeps it open.
    await userEvent.click(screen.getByText('Body text'));
    await expect(args.onClose).not.toHaveBeenCalled();
  },
};

export const WithoutSubtitle: Story = {
  args: { subtitle: undefined },
  play: async ({ canvasElement }) => {
    await expect(await page(canvasElement).findByRole('dialog', { name: 'Preview' })).not.toHaveAttribute('aria-describedby');
  },
};

export const Narrow: Story = {
  args: { title: 'Replace existing result?', subtitle: undefined, actions: undefined, narrow: true, children: <p>Running Mass Calculation again replaces 101010-M.</p> },
  play: async ({ canvasElement }) => {
    const dialog = await page(canvasElement).findByRole('dialog', { name: 'Replace existing result?' });
    // Without actions, Close is the only button in the header.
    await expect(within(dialog).getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? b.textContent)).toEqual(['Close']);
  },
};

export const Full: Story = { args: { title: 'Compare Files', subtitle: '3 files · Composition Validation', actions: undefined, full: true } };

export const LongTitle: Story = {
  args: { title: 'result_partner_b_followup_mass_calculation_with_a_very_long_name.csv' },
  play: async ({ canvasElement }) => {
    const title = 'result_partner_b_followup_mass_calculation_with_a_very_long_name.csv';
    await expect(await page(canvasElement).findByRole('heading', { name: title })).toHaveAttribute('title', title);
  },
};

/** Opens the dialog from a button and unmounts it on close, as the app's pages do. */
function OpenedFromButton(args: Parameters<typeof Modal>[0]) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>Open</Button>
      {open && <Modal {...args} onClose={() => { args.onClose(); setOpen(false); }} />}
    </>
  );
}

export const ClosingReturnsFocus: Story = {
  render: (args) => <OpenedFromButton {...args} />,
  parameters: { docs: { description: { story: 'Escape, Close and a click on the backdrop each close the dialog once and put focus back on Open.' } } },
  play: async ({ args, canvasElement }) => {
    const screen = page(canvasElement);
    const opener = screen.getByRole('button', { name: 'Open' });
    const closers: [string, () => Promise<unknown>][] = [
      ['Escape', () => userEvent.keyboard('{Escape}')],
      ['Close', () => userEvent.click(screen.getByRole('button', { name: 'Close' }))],
      // The backdrop is the element that wraps the panel.
      ['backdrop', () => userEvent.click(screen.getByRole('dialog').parentElement!)],
    ];
    for (const [, close] of closers) {
      await userEvent.click(opener);
      await screen.findByRole('dialog', { name: 'Preview' });
      await close();
      await expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      // Radix returns focus on a timer after the dialog unmounts.
      await waitFor(() => expect(opener).toHaveFocus());
    }
    await expect(args.onClose).toHaveBeenCalledTimes(closers.length);
  },
};
