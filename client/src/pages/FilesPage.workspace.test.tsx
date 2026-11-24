import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FileMeta } from '../../../shared/types';
import type { AccountState } from '../hooks/useAccount';
import { api } from '../lib/api';
import { CAPACITY_MESSAGE, INACTIVE_MESSAGE, UNAVAILABLE_FILES_MESSAGE } from '../lib/cloud-storage';
import { FilesPage } from './FilesPage';
import { accountApi, demo, signedIn } from '../test-fixtures/accounts';

// The Files page in a cloud workspace: which workspace the account gets, how a refused upload and an unreachable
// workspace look, and that nothing of the old workspace stays when it changes. The api is mocked.

vi.mock('../lib/api', () => ({ api: {
  list: vi.fn(), process: vi.fn(), rows: vi.fn(), upload: vi.fn(), compare: vi.fn(), archive: vi.fn(), generate: vi.fn(),
  download: vi.fn(), storageMode: vi.fn(), clearData: vi.fn(), confirmMapping: vi.fn(), setWorkspace: vi.fn(), workspaceId: vi.fn(),
} }));

let account: AccountState = demo;
const page = () => <FilesPage account={accountApi(account)} />;

const base = { rows: 25, columns: 7, uploadedAt: '2026-11-06T12:00:00Z' };
const mine: FileMeta = { ...base, id: '100001', name: 'mine.csv', status: 'Ready', problemRows: 0 };
const theirs: FileMeta = { ...base, id: '100001', name: 'cloud.csv', status: 'Ready', problemRows: 0 };
const active = signedIn();
const unavailable = Object.assign(new Error(UNAVAILABLE_FILES_MESSAGE), { statusCode: 503 });

let generation = 0; // what api.workspaceId() reports; a test bumps it to simulate a workspace switch mid-run
beforeEach(() => {
  vi.resetAllMocks();
  generation = 0;
  vi.mocked(api.workspaceId).mockImplementation(() => generation);
  account = demo;
  vi.mocked(api.storageMode).mockResolvedValue('demo');
  vi.mocked(api.list).mockResolvedValue([mine]);
});

describe('cloud workspace', () => {
  it('says files are saved to the account and offers no Clear my data', async () => {
    vi.mocked(api.storageMode).mockResolvedValue('cloud');
    account = active;
    render(page());
    expect(await screen.findByText('Files are saved privately to your account and open on any device where you sign in.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Clear my data' })).not.toBeInTheDocument();
    expect(api.setWorkspace).toHaveBeenCalledWith({ kind: 'cloud', userId: 'user-1' });
  });

  it('says demo files are temporary, opens the demo workspace, and lets a guest clear it', async () => {
    vi.mocked(api.storageMode).mockResolvedValue('demo');
    render(page());
    expect(await screen.findByText("Demo files are temporary. They're discarded when you sign out.")).toBeInTheDocument();
    expect(api.setWorkspace).toHaveBeenCalledWith({ kind: 'demo', sessionId: '11111111-1111-4111-8111-111111111111' });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Clear my data' }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Clear my data' }));
    await waitFor(() => expect(api.clearData).toHaveBeenCalledTimes(1));
  });

  it('shows the capacity message when an upload is refused', async () => {
    vi.mocked(api.storageMode).mockResolvedValue('cloud');
    vi.mocked(api.upload).mockRejectedValue(Object.assign(new Error(CAPACITY_MESSAGE), { statusCode: 507 }));
    account = active;
    render(page());
    await screen.findByText('mine.csv');
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.setup().upload(input, new File(['a'], 'big.csv', { type: 'text/csv' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(`big.csv: ${CAPACITY_MESSAGE}`);
  });

  it('says the workspace is unavailable, not empty, and loads the files on Try again', async () => {
    vi.mocked(api.list).mockRejectedValueOnce(unavailable).mockResolvedValue([mine]);
    account = active;
    render(page());
    expect(await screen.findByRole('alert')).toHaveTextContent(UNAVAILABLE_FILES_MESSAGE);
    expect(screen.getByText("Your files couldn't be loaded.")).toBeInTheDocument();
    expect(screen.queryByText('No CSV files match your filters.')).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('mine.csv')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
    expect(screen.queryByText("Your files couldn't be loaded.")).not.toBeInTheDocument();
  });

  it('shows the inactive message when the list is refused, not an empty workspace', async () => {
    vi.mocked(api.list).mockRejectedValue(Object.assign(new Error(INACTIVE_MESSAGE), { statusCode: 403 }));
    account = active;
    render(page());
    expect(await screen.findByRole('alert')).toHaveTextContent(INACTIVE_MESSAGE);
    expect(screen.getByText("Your files couldn't be loaded.")).toBeInTheDocument();
  });

  it('stops a processing batch when the workspace changes, without opening a preview or dialog', async () => {
    const a: FileMeta = { ...mine, id: '100001', name: 'a.csv' };
    const b: FileMeta = { ...mine, id: '100002', name: 'b.csv' };
    vi.mocked(api.list).mockResolvedValue([a, b]);
    vi.mocked(api.process).mockImplementation(async (id) => {
      generation++; // the person signs out while the first file is being processed
      return { ...a, id: `${id}-V`, name: `result_${id}.csv`, status: 'Processed' as const, processor: 'validation' as const };
    });
    render(page());
    const user = userEvent.setup();
    await user.click(await screen.findByRole('checkbox', { name: /^Select 100001 a.csv$/ }));
    await user.click(screen.getByRole('checkbox', { name: /^Select 100002 b.csv$/ }));
    await user.click(screen.getByRole('button', { name: 'Run Processing (2)' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Your workspace changed');
    expect(api.process).toHaveBeenCalledTimes(1); // the second file, whose ID may belong to another file now, was left alone
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens no preview when the workspace changes during the only file of a run', async () => {
    vi.mocked(api.process).mockImplementation(async (id) => {
      generation++; // signed out while the single file was being processed
      return { ...mine, id: `${id}-V`, name: 'result.csv', status: 'Processed' as const, processor: 'validation' as const };
    });
    render(page());
    const user = userEvent.setup();
    await user.click(await screen.findByRole('checkbox', { name: /^Select 100001 mine.csv$/ }));
    await user.click(screen.getByRole('button', { name: 'Run Processing' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Your workspace changed');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(api.rows).not.toHaveBeenCalled(); // no read of a same-ID file in the new workspace
  });

  it('opens no mapping dialog when the workspace changes during the only upload', async () => {
    vi.mocked(api.upload).mockImplementation(async () => {
      generation++;
      return { ...mine, id: '100009', name: 'x.csv', status: 'Needs Mapping' as const };
    });
    render(page());
    await screen.findByText('mine.csv');
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.setup().upload(input, new File(['a'], 'one.csv', { type: 'text/csv' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Your workspace changed');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows no Undo toast when an archive finishes after the workspace changed', async () => {
    vi.mocked(api.archive).mockImplementation(async () => {
      generation++;
      return [{ ...mine, archived: true }];
    });
    render(page());
    const user = userEvent.setup();
    await user.click(await screen.findByRole('checkbox', { name: /^Select 100001 mine.csv$/ }));
    await user.click(screen.getByRole('button', { name: /^Archive/ }));
    await waitFor(() => expect(api.archive).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByRole('button', { name: /^Archive/ })).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument();
    expect(screen.queryByText(/archived$/)).not.toBeInTheDocument();
  });

  it('does not open a comparison that finishes after the workspace changed', async () => {
    const r1: FileMeta = { ...mine, id: '100001-V', name: 'r1.csv', status: 'Processed', processor: 'validation' };
    const r2: FileMeta = { ...mine, id: '100002-V', name: 'r2.csv', status: 'Processed', processor: 'validation' };
    vi.mocked(api.list).mockResolvedValue([r1, r2]);
    vi.mocked(api.compare).mockImplementation(async () => {
      generation++;
      return {} as never;
    });
    render(page());
    const user = userEvent.setup();
    await user.click(await screen.findByRole('checkbox', { name: /^Select 100001-V r1.csv$/ }));
    await user.click(screen.getByRole('checkbox', { name: /^Select 100002-V r2.csv$/ }));
    await user.click(screen.getByRole('button', { name: /^Compare/ }));
    await waitFor(() => expect(api.compare).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole('button', { name: /^Compare/ })).toBeEnabled());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('stops a multi-file upload when the workspace changes and offers no mapping dialog for it', async () => {
    vi.mocked(api.upload).mockImplementation(async () => {
      generation++;
      return { ...mine, id: '100009', name: 'x.csv', status: 'Needs Mapping' as const };
    });
    render(page());
    await screen.findByText('mine.csv');
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.setup().upload(input, [new File(['a'], 'one.csv', { type: 'text/csv' }), new File(['b'], 'two.csv', { type: 'text/csv' })]);
    expect(await screen.findByRole('alert')).toHaveTextContent('Your workspace changed');
    expect(api.upload).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows Loading files while the new workspace loads, not an empty-filter message', async () => {
    let answer!: (files: FileMeta[]) => void;
    vi.mocked(api.list).mockResolvedValueOnce([mine]).mockReturnValueOnce(new Promise((resolve) => { answer = resolve; }));
    const { rerender } = render(page());
    await screen.findByText('mine.csv');
    account = active;
    await act(async () => { rerender(page()); });
    expect(await screen.findByText('Loading files…')).toBeInTheDocument();
    expect(screen.queryByText('No CSV files match your filters.')).not.toBeInTheDocument();
    await act(async () => { answer([theirs]); });
    expect(await screen.findByText('cloud.csv')).toBeInTheDocument();
  });

  it("ignores a late storage answer from the workspace it just left", async () => {
    let late!: (mode: 'demo') => void;
    vi.mocked(api.storageMode).mockReturnValueOnce(new Promise((resolve) => { late = resolve; })).mockResolvedValue('cloud');
    const { rerender } = render(page());
    await screen.findByText('mine.csv');
    account = active;
    await act(async () => { rerender(page()); });
    expect(await screen.findByText(/saved privately to your account/)).toBeInTheDocument();
    await act(async () => { late('demo'); });
    expect(screen.getByText(/saved privately to your account/)).toBeInTheDocument();
    expect(screen.queryByText(/Demo files are temporary/)).not.toBeInTheDocument();
  });

  it("drops the old workspace's files, selection and notices when the account changes", async () => {
    vi.mocked(api.list).mockResolvedValueOnce([mine]).mockResolvedValue([theirs]);
    const { rerender } = render(page());
    const user = userEvent.setup();
    await user.click(await screen.findByRole('checkbox', { name: /^Select 100001 mine.csv$/ }));
    expect(screen.getByRole('button', { name: /^Run Processing/ })).toBeEnabled();

    vi.mocked(api.storageMode).mockResolvedValue('cloud');
    account = active;
    await act(async () => { rerender(page()); });
    expect(await screen.findByText('cloud.csv')).toBeInTheDocument();
    expect(screen.queryByText('mine.csv')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Run Processing/ })).toBeDisabled(); // the old selection is gone
    expect(api.setWorkspace).toHaveBeenLastCalledWith({ kind: 'cloud', userId: 'user-1' });
    await waitFor(() => expect(api.list).toHaveBeenCalledTimes(2));
  });
});
