import type { Meta, StoryObj } from '@storybook/react-vite';
import { Card } from './Card';

const meta = {
  title: 'UI/Card',
  component: Card,
  args: {
    children: (
      <>
        <h3 style={{ fontWeight: 600 }}>Local development</h3>
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

export const Default: Story = {};
export const Section: Story = { args: { as: 'section', 'aria-label': 'Selected technology' } };
export const Article: Story = { args: { as: 'article' } };
export const Form: Story = {
  args: {
    as: 'form',
    'aria-label': 'Generate CSV files',
    onSubmit: (event) => event.preventDefault(),
    children: (
      <label>
        Rows <input type="number" defaultValue={20} style={{ marginLeft: '0.5rem', border: '1px solid #cbd5e1' }} />
      </label>
    ),
  },
};
