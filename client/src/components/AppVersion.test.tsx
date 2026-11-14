import { render, screen } from '@testing-library/react';
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
  ])('shows the version and environment in the %s navigation', async (_name, Page) => {
    vi.stubEnv('VITE_APP_VERSION', '1.0.0');
    vi.stubEnv('VITE_APP_ENV', 'Test');
    render(<Page />);
    const nav = screen.getByRole('navigation', { name: 'Pages' });
    expect(nav).toContainElement(screen.getByLabelText('App version'));
    expect(screen.getByLabelText('App version')).toHaveTextContent('v1.0.0 · Test');
    await screen.findAllByRole('heading', { level: 1 }); // let a page finish its first load
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
