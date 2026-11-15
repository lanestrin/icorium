import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Banner } from './Banner';

describe('Banner', () => {
  it('announces success as a status and an error as an alert', () => {
    render(<>
      <Banner tone="success">Saved 3 files.</Banner>
      <Banner tone="error">Upload failed.</Banner>
    </>);
    expect(screen.getByRole('status')).toHaveTextContent('Saved 3 files.');
    expect(screen.getByRole('alert')).toHaveTextContent('Upload failed.');
  });

  it('has no Dismiss button without onDismiss', () => {
    render(<Banner tone="success">Saved.</Banner>);
    expect(screen.queryByRole('button', { name: 'Dismiss' })).not.toBeInTheDocument();
  });

  it('dismisses on click', async () => {
    const onDismiss = vi.fn();
    render(<Banner tone="error" onDismiss={onDismiss}>Upload failed.</Banner>);
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('dismisses from the keyboard: Tab to the button, then Enter', async () => {
    const onDismiss = vi.fn();
    render(<Banner tone="success" onDismiss={onDismiss}>Saved.</Banner>);
    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'Dismiss' })).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
