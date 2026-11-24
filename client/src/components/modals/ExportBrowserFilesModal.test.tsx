import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { FileMeta } from '../../../../shared/types';
import { UPGRADE_BLOCKED_MESSAGE, UPGRADE_BLOCKED_STATUS } from '../../lib/browser-storage';
import { ExportBrowserFilesModal } from './ExportBrowserFilesModal';

const file = (id: string, name: string, archived = false): FileMeta =>
  ({ id, name, rows: 2, columns: 3, uploadedAt: '2026-01-01T00:00:00.000Z', status: 'Ready', archived });
const FILES = [file('100001', 'a.csv'), file('100002', 'b.csv', true)];
const csv = async (id: string) => ({ name: FILES.find((f) => f.id === id)!.name, text: `id\n${id}\n` });

describe('ExportBrowserFilesModal', () => {
  it('lists active and archived files with their File IDs and says nothing is uploaded or deleted', async () => {
    render(<ExportBrowserFilesModal onClose={vi.fn()} load={async () => FILES} />);
    const list = await screen.findByRole('list', { name: 'Files kept in this browser' });
    expect(list).toHaveTextContent('a.csv');
    expect(list).toHaveTextContent('File ID 100001 · Active');
    expect(list).toHaveTextContent('File ID 100002 · Archived');
    expect(screen.getByText(/not added to your account and nothing here is deleted/)).toBeInTheDocument();
  });

  it('downloads one file, then all of them in order', async () => {
    const save = vi.fn();
    const user = userEvent.setup();
    render(<ExportBrowserFilesModal onClose={vi.fn()} load={async () => FILES} read={csv} save={save} />);
    await user.click(await screen.findByRole('button', { name: 'Download b.csv' }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save).toHaveBeenLastCalledWith({ name: 'b.csv', text: 'id\n100002\n' });
    await user.click(screen.getByRole('button', { name: 'Download all' }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(3));
    expect(save.mock.calls.slice(1).map(([saved]) => saved.name)).toEqual(['a.csv', 'b.csv']);
  });

  it('stops at a failed read and says so', async () => {
    const save = vi.fn();
    const read = vi.fn(async (id: string) => { if (id === '100002') throw new Error('gone'); return csv(id); });
    const user = userEvent.setup();
    render(<ExportBrowserFilesModal onClose={vi.fn()} load={async () => FILES} read={read} save={save} />);
    await user.click(await screen.findByRole('button', { name: 'Download all' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't read the files kept in this browser. Try again.");
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('shows loading, empty, blocked and failed states', async () => {
    const { unmount } = render(<ExportBrowserFilesModal onClose={vi.fn()} load={() => new Promise(() => {})} />);
    expect(screen.getByRole('status')).toHaveTextContent('Looking for files in this browser…');
    unmount();

    const empty = render(<ExportBrowserFilesModal onClose={vi.fn()} load={async () => []} />);
    expect(await screen.findByText('No files are kept in this browser.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Download all' })).not.toBeInTheDocument();
    empty.unmount();

    const blocked = Object.assign(new Error(UPGRADE_BLOCKED_MESSAGE), { statusCode: UPGRADE_BLOCKED_STATUS });
    const stuck = render(<ExportBrowserFilesModal onClose={vi.fn()} load={async () => { throw blocked; }} />);
    expect(await screen.findByRole('alert')).toHaveTextContent(UPGRADE_BLOCKED_MESSAGE);
    stuck.unmount();

    render(<ExportBrowserFilesModal onClose={vi.fn()} load={async () => { throw new Error('boom'); }} />);
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't read the files kept in this browser. Try again.");
  });
});
