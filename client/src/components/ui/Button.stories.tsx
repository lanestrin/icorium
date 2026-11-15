import type { Meta, StoryObj } from '@storybook/react-vite';
import { Archive, FilePlus2, Play, X } from 'lucide-react';
import { Button } from './Button';

const meta = {
  title: 'UI/Button',
  component: Button,
  args: { children: 'Add to CSV Files' },
  parameters: {
    docs: {
      description: {
        component: [
          'The app\'s one button. Pick the **variant** by meaning: `primary` for the main action in a place, `secondary` for the others beside it, `success` to start processing or confirm a safe run, `danger` to confirm a destructive one, `outline` for a light action inside a panel or toast, `ghost` for icon buttons such as Close, and `link` for a text-only action inside a sentence or toolbar.',
          '**When not to use it:** a link that navigates is an `<a>`, not a `link` Button. Menu items, tabs, sort headers and form choices are their own controls.',
          '**Accessibility:** an icon-only button needs an `aria-label`. `loading` disables the button, sets `aria-busy` and keeps the label. Every variant shows a focus ring for keyboard users. Pass `className` for layout only (`w-full`, `ml-auto`).',
        ].join('\n\n'),
      },
    },
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = { args: { icon: <FilePlus2 /> } };
export const Secondary: Story = { args: { variant: 'secondary', icon: <Archive />, children: 'Archive 2 files' } };
export const Success: Story = { args: { variant: 'success', size: 'lg', icon: <Play />, children: 'Run Processing' } };
export const Danger: Story = { args: { variant: 'danger', children: 'Replace results' } };
export const Outline: Story = { args: { variant: 'outline', size: 'sm', children: 'Undo' } };
export const Ghost: Story = { args: { variant: 'ghost', icon: <X />, children: undefined, 'aria-label': 'Close' } };
export const Link: Story = { args: { variant: 'link', size: 'sm', children: 'Clear selection' } };

export const Sizes: Story = {
  render: (args) => (
    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
      <Button {...args} size="sm">Small</Button>
      <Button {...args} size="md">Medium</Button>
      <Button {...args} size="lg">Large</Button>
    </div>
  ),
};

export const Disabled: Story = { args: { disabled: true } };
export const Loading: Story = { args: { loading: true, icon: <FilePlus2 />, children: 'Adding…' } };
export const IconOnly: Story = { args: { variant: 'ghost', icon: <X />, children: undefined, 'aria-label': 'Close' } };
