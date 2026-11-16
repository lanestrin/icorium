import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from './App';

// The CSV Generator page fails to render, standing in for any page with a rendering bug.
vi.mock('./pages/GeneratorPage', () => ({
  GeneratorPage: () => {
    throw new Error('render failed');
  },
}));

describe('App', () => {
  afterEach(() => {
    window.history.replaceState(null, '', '/');
    vi.restoreAllMocks();
  });

  it('shows the error message instead of a blank screen when a page fails to render', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    window.history.replaceState(null, '', '/generator');

    render(<App />);

    expect(screen.getByRole('heading', { level: 1, name: 'Something went wrong' })).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Reload page' })).toBeInTheDocument();
  });

  it('renders a working page normally', () => {
    window.history.replaceState(null, '', '/architecture');

    render(<App />);

    expect(screen.getByRole('heading', { level: 1, name: /Architecture/ })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Something went wrong' })).not.toBeInTheDocument();
  });
});
