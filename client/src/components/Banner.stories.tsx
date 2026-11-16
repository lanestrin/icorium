import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { Banner } from './Banner';

const meta = {
  title: 'UI/Banner',
  component: Banner,
  args: { tone: 'success', children: 'Saved 3 files.' },
  parameters: {
    docs: {
      description: {
        component: [
          'A message box at the top of a page: green with a tick for success, red with an alert icon for an error. With `onDismiss` it has a Dismiss button.',
          '**When not to use it:** for a message about one field (put it beside the field), for the Undo toast after archiving, or for a question that needs an answer (Modal).',
          '**Accessibility:** success is announced politely as a `status`, an error at once as an `alert`. The Dismiss button is named "Dismiss" and reached with Tab. Pass `className` for spacing only.',
        ].join('\n\n'),
      },
    },
  },
} satisfies Meta<typeof Banner>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Success: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('status')).toHaveTextContent('Saved 3 files.');
    // No Dismiss button without onDismiss.
    await expect(canvas.queryByRole('button', { name: 'Dismiss' })).not.toBeInTheDocument();
  },
};

export const Error: Story = {
  args: { tone: 'error', children: 'Upload failed: the file is not a CSV.' },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('alert')).toHaveTextContent('Upload failed: the file is not a CSV.');
  },
};

export const Dismissible: Story = {
  args: { tone: 'error', children: 'Upload failed.', onDismiss: fn() },
  play: async ({ args, canvasElement }) => {
    const dismiss = within(canvasElement).getByRole('button', { name: 'Dismiss' });
    await userEvent.click(dismiss);
    await expect(args.onDismiss).toHaveBeenCalledTimes(1);
  },
};

export const DismissFromKeyboard: Story = {
  args: { onDismiss: fn() },
  parameters: { docs: { description: { story: 'Tab reaches Dismiss; Enter presses it.' } } },
  play: async ({ args, canvasElement }) => {
    await userEvent.tab();
    await expect(within(canvasElement).getByRole('button', { name: 'Dismiss' })).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    await expect(args.onDismiss).toHaveBeenCalledTimes(1);
  },
};
