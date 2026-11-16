import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { Card } from './Card';

const meta = {
  title: 'UI/Card',
  component: Card,
  args: {
    children: (
      <>
        <h3 style={{ fontWeight: 'var(--app-weight-semibold)' }}>Local development</h3>
        <p>Node.js API with filesystem storage.</p>
      </>
    ),
  },
  parameters: {
    docs: {
      description: {
        component: [
          'A white panel with a soft border and shadow for a self-contained block: a form, a results area, one decision or one storage option.',
          '**Choose the element** with `as`: `section` with an `aria-label` or `aria-labelledby` when it is a named region, `article` for one item in a set, `form` when the card is the form, otherwise `div`.',
          '**When not to use it:** for dialogs (Modal), toasts or page-wide banners (Banner), or to group a few fields inside another card.',
        ].join('\n\n'),
      },
    },
  },
} satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    // The card is the only element the story renders.
    await expect(canvasElement.firstElementChild?.tagName).toBe('DIV');
  },
};

export const Section: Story = {
  args: { as: 'section', 'aria-label': 'Selected technology', 'aria-live': 'polite' },
  play: async ({ canvasElement }) => {
    // Attributes pass through, so a labelled section is a named region.
    const region = within(canvasElement).getByRole('region', { name: 'Selected technology' });
    await expect(region).toHaveAttribute('aria-live', 'polite');
  },
};

export const Article: Story = {
  args: { as: 'article' },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('article')).toBeInTheDocument();
  },
};

export const Form: Story = {
  args: {
    as: 'form',
    'aria-label': 'Generate CSV files',
    onSubmit: fn((event: { preventDefault: () => void }) => event.preventDefault()),
    children: (
      <>
        <label>
          Rows <input type="number" defaultValue={20} style={{ marginLeft: 'var(--app-space-2)', border: 'var(--app-border-width) solid var(--app-color-border-strong)' }} />
        </label>
        <button type="submit">Generate</button>
      </>
    ),
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('form', { name: 'Generate CSV files' })).toBeInTheDocument();
    await userEvent.click(canvas.getByRole('button', { name: 'Generate' }));
    await expect(args.onSubmit).toHaveBeenCalledTimes(1);
  },
};
