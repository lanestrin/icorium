import { Modal } from './Modal';
import { ConfirmButtons } from './RunConfirmations';

/** Asks before Clear my data deletes every upload and result of the demo. */
export function ClearDataModal({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  return (
    <Modal title="Clear my data?" narrow onClose={onCancel}>
      <p>This deletes every file you uploaded and every result in this demo. The five sample files come back. This can't be undone.</p>
      <ConfirmButtons label="Clear my data" danger onCancel={onCancel} onConfirm={onConfirm} />
    </Modal>
  );
}
