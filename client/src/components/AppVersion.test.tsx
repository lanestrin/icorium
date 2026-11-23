import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppVersion } from './AppVersion';
import { ArchitecturePage } from '../pages/ArchitecturePage';
import { FilesPage } from '../pages/FilesPage';
import { GeneratorPage } from '../pages/GeneratorPage';
import { api } from '../lib/api';

describe('app version label', () => {
  beforeEach(() => { vi.spyOn(api, 'list').mockResolvedValue([]); });
  afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

  it.each([
    ['CSV Files', FilesPage],
    ['CSV Generator', GeneratorPage],
    ['Architecture', ArchitecturePage],
  ])('shows the version and environment in the navigation of the %s page', async (_name, Page) => {
    vi.stubEnv('VITE_APP_VERSION', '1.0.0');
    vi.stubEnv('VITE_APP_ENV', 'Test');
    render(<Page />);
    await screen.findAllByRole('heading', { level: 1 }); // let a page finish its first load
    // The navigation column shows from 80rem wide; below that the same navigation opens from the Menu button.
    await userEvent.setup().click(screen.getByRole('button', { name: 'Open navigation' }));
    const nav = screen.getByRole('navigation', { name: 'App' });
    expect(within(nav).getByLabelText('App version')).toHaveTextContent('v1.0.0 · Test');
  });

  it('shows the version alone outside Test and Preview', () => {
    vi.stubEnv('VITE_APP_VERSION', '1.0.0');
    vi.stubEnv('VITE_APP_ENV', '');
    render(<AppVersion />);
    expect(screen.getByLabelText('App version')).toHaveTextContent(/^v1\.0\.0$/);
  });

  it('shows nothing when no version is set', () => {
    vi.stubEnv('VITE_APP_VERSION', '');
    const { container } = render(<AppVersion />);
    expect(container).toBeEmptyDOMElement();
  });
});
