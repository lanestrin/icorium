import type { Meta, StoryObj } from '@storybook/react-vite';
import { Archive, FilePlus2, Play, X } from 'lucide-react';
import { expect, fn, userEvent, within } from 'storybook/test';
import { Button } from './Button';

const meta = {
  title: 'UI/Button',
  component: Button,
  args: { children: 'Add to CSV Files', onClick: fn() },
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

/** Lays several buttons out in a row on the spacing tokens. */
const row = { display: 'flex', flexWrap: 'wrap', gap: 'var(--app-space-3)', alignItems: 'center' } as const;

export const Primary: Story = {
  args: { icon: <FilePlus2 data-testid="icon" /> },
  play: async ({ args, canvasElement }) => {
    const button = within(canvasElement).getByRole('button', { name: 'Add to CSV Files' });
    // A plain button by default, so it never submits a surrounding form; the icon comes before the label.
    await expect(button).toHaveAttribute('type', 'button');
    await expect(button).not.toHaveAttribute('aria-busy');
    await expect(button.firstElementChild).toBe(within(canvasElement).getByTestId('icon'));
    await userEvent.click(button);
    await expect(args.onClick).toHaveBeenCalledTimes(1);
  },
};

export const Secondary: Story = { args: { variant: 'secondary', icon: <Archive />, children: 'Archive 2 files' } };
export const Success: Story = { args: { variant: 'success', size: 'lg', icon: <Play />, children: 'Run Processing' } };
export const Danger: Story = { args: { variant: 'danger', children: 'Replace results' } };
export const Outline: Story = { args: { variant: 'outline', size: 'sm', children: 'Undo' } };
export const Link: Story = { args: { variant: 'link', size: 'sm', children: 'Clear selection' } };

export const Sizes: Story = {
  render: (args) => (
    <div style={row}>
      <Button {...args} size="sm">Small</Button>
      <Button {...args} size="md">Medium</Button>
      <Button {...args} size="lg">Large</Button>
    </div>
  ),
};

export const Disabled: Story = {
  args: { disabled: true },
  play: async ({ args, canvasElement }) => {
    const button = within(canvasElement).getByRole('button', { name: 'Add to CSV Files' });
    await expect(button).toBeDisabled();
    await userEvent.click(button);
    await expect(args.onClick).not.toHaveBeenCalled();
  },
};

export const Loading: Story = {
  args: { loading: true, icon: <FilePlus2 data-testid="icon" />, children: 'Adding…' },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    // Disabled and busy, with a spinner in place of the icon and the label kept.
    const button = canvas.getByRole('button', { name: 'Adding…' });
    await expect(button).toBeDisabled();
    await expect(button).toHaveAttribute('aria-busy', 'true');
    await expect(canvas.getByTestId('button-spinner')).toBeInTheDocument();
    await expect(canvas.queryByTestId('icon')).not.toBeInTheDocument();
    await userEvent.click(button);
    await expect(args.onClick).not.toHaveBeenCalled();
  },
};

export const IconOnly: Story = {
  args: { variant: 'ghost', icon: <X />, children: undefined, 'aria-label': 'Close' },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('button', { name: 'Close' })).toBeInTheDocument();
  },
};

export const Keyboard: Story = {
  args: { children: 'Run' },
  parameters: { docs: { description: { story: 'Reached with Tab and pressed with Enter or Space.' } } },
  play: async ({ args, canvasElement }) => {
    await userEvent.tab();
    await expect(within(canvasElement).getByRole('button', { name: 'Run' })).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    await userEvent.keyboard(' ');
    await expect(args.onClick).toHaveBeenCalledTimes(2);
  },
};

export const NativeProps: Story = {
  args: { type: 'submit', form: 'f', 'aria-describedby': 'why', className: 'w-full', children: 'Send' },
  parameters: { docs: { description: { story: 'Native button props pass through; `className` adds layout only.' } } },
  play: async ({ args, canvasElement }) => {
    const button = within(canvasElement).getByRole('button', { name: 'Send' });
    await expect(button).toHaveAttribute('type', 'submit');
    await expect(button).toHaveAttribute('form', 'f');
    await expect(button).toHaveAttribute('aria-describedby', 'why');
    await expect(button).toHaveClass('w-full');
    await userEvent.click(button);
    await expect(args.onClick).toHaveBeenCalledTimes(1);
  },
};

export const Motion: Story = {
  render: (args) => (
    <div style={row}>
      <Button {...args} variant="primary">Hover me</Button>
      <Button {...args} variant="secondary">Hover me</Button>
      <Button {...args} variant="ghost">Hover me</Button>
      <Button {...args} loading icon={<FilePlus2 />}>Adding…</Button>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: [
          'The motion buttons have, and nothing more: hover and focus change colour, background, border and shadow over `--app-duration-fast` (150ms) with `--app-ease`, and a loading button turns its spinner with the shared `spin` mixin (one turn a second).',
          '**Reduced motion:** the global rule in `styles/base.css` makes transitions and animations near-instant for people who ask their system for less motion. To see it, open the browser DevTools, then Rendering › Emulate CSS media feature `prefers-reduced-motion: reduce`: hover changes snap and the spinner stops after one frame.',
        ].join('\n\n'),
      },
    },
  },
};
