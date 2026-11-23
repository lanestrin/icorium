import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FileMeta } from '../../../shared/types';
import type { AccountState } from '../hooks/useAccount';
import { api } from '../lib/api';
import { CAPACITY_MESSAGE, UNAVAILABLE_FILES_MESSAGE } from '../lib/cloud-storage';
import { FilesPage } from './FilesPage';

// The Files page in a cloud workspace: which workspace the account gets, how a refused upload and an unreachable
// workspace look, and that nothing of the old workspace stays when it changes. The api is mocked.

vi.mock('../lib/api', () => ({ api: {
  list: vi.fn(), process: vi.fn(), rows: vi.fn(), upload: vi.fn(), compare: vi.fn(), archive: vi.fn(), generate: vi.fn(),
  download: vi.fn(), storageMode: vi.fn(), clearData: vi.fn(), confirmMapping: vi.fn(), setWorkspace: vi.fn(),
} }));

let account: AccountState = { status: 'unconfigured' };
vi.mock('../hooks/useAccount', () => ({
  useAccount: () => ({ account, recovering: false, actionError: null, signOut: vi.fn(), saveName: vi.fn() }),
  isActiveAdmin: () => false,
}));

const base = { rows: 25, columns: 7, uploadedAt: '2026-11-06T12:00:00Z' };
const mine: FileMeta = { ...base, id: '100001', name: 'mine.csv', status: 'Ready', problemRows: 0 };
const theirs: FileMeta = { ...base, id: '100001', name: 'cloud.csv', status: 'Ready', problemRows: 0 };
const active: AccountState = { status: 'signed-in', userId: 'user-1', email: 'a@b.c', profile: { name: 'A', role: 'Member', active: true } };
const unavailable = Object.assign(new Error(UNAVAILABLE_FILES_MESSAGE), { statusCode: 503 });

beforeEach(() => {
  vi.resetAllMocks();
  account = { status: 'unconfigured' };
  vi.mocked(api.storageMode).mockResolvedValue('saved');
  vi.mocked(api.list).mockResolvedValue([mine]);
});

describe('cloud workspace', () => {
  it('says files are saved to the account and offers no Clear my data', async () => {
    vi.mocked(api.storageMode).mockResolvedValue('cloud');
    account = active;
    render(<FilesPage />);
    expect(await screen.findByText('Files are saved privately to your account and open on any device where you sign in.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Clear my data' })).not.toBeInTheDocument();
    expect(api.setWorkspace).toHaveBeenCalledWith({ kind: 'cloud', userId: 'user-1' });
  });

  it('keeps Clear my data and the browser workspace for a signed-out visitor', async () => {
    render(<FilesPage />);
    expect(await screen.findByRole('button', { name: 'Clear my data' })).toBeEnabled();
    expect(api.setWorkspace).toHaveBeenCalledWith({ kind: 'browser' });
  });

  it('shows the capacity message when an upload is refused', async () => {
    vi.mocked(api.storageMode).mockResolvedValue('cloud');
    vi.mocked(api.upload).mockRejectedValue(Object.assign(new Error(CAPACITY_MESSAGE), { statusCode: 507 }));
    account = active;
    render(<FilesPage />);
    await screen.findByText('mine.csv');
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.setup().upload(input, new File(['a'], 'big.csv', { type: 'text/csv' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(`big.csv: ${CAPACITY_MESSAGE}`);
  });

  it('says the workspace is unavailable, not empty, and loads the files on Try again', async () => {
    vi.mocked(api.list).mockRejectedValueOnce(unavailable).mockResolvedValue([mine]);
    account = active;
    render(<FilesPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent(UNAVAILABLE_FILES_MESSAGE);
    expect(screen.getByText("Your files couldn't be loaded.")).toBeInTheDocument();
    expect(screen.queryByText('No CSV files match your filters.')).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('mine.csv')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
    expect(screen.queryByText("Your files couldn't be loaded.")).not.toBeInTheDocument();
  });

  it('shows no workspace and no Clear my data while the account could not be confirmed', async () => {
    vi.mocked(api.list).mockRejectedValue(unavailable);
    vi.mocked(api.storageMode).mockRejectedValue(unavailable);
    account = { status: 'error', message: 'x' };
    render(<FilesPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent(UNAVAILABLE_FILES_MESSAGE);
    expect(screen.getByRole('button', { name: 'Clear my data' })).toBeDisabled();
    expect(api.setWorkspace).toHaveBeenCalledWith(expect.objectContaining({ kind: 'unavailable' }));
  });

  it("drops the old workspace's files, selection and notices when the account changes", async () => {
    vi.mocked(api.list).mockResolvedValueOnce([mine]).mockResolvedValue([theirs]);
    const { rerender } = render(<FilesPage />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('checkbox', { name: /^Select 100001 mine.csv$/ }));
    expect(screen.getByRole('button', { name: /^Run Processing/ })).toBeEnabled();

    vi.mocked(api.storageMode).mockResolvedValue('cloud');
    account = active;
    await act(async () => { rerender(<FilesPage />); });
    expect(await screen.findByText('cloud.csv')).toBeInTheDocument();
    expect(screen.queryByText('mine.csv')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Run Processing/ })).toBeDisabled(); // the old selection is gone
    expect(api.setWorkspace).toHaveBeenLastCalledWith({ kind: 'cloud', userId: 'user-1' });
    await waitFor(() => expect(api.list).toHaveBeenCalledTimes(2));
  });
});
