interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  destructive,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
      }}
      onKeyDown={(e) => e.key === 'Escape' && onCancel()}
    >
      <div
        style={{
          background: 'var(--paper)',
          border: '1px solid var(--rule)',
          borderRadius: 'var(--radius)',
          padding: 'var(--space-5)',
          maxWidth: 420,
        }}
      >
        <h3 style={{ marginBottom: 'var(--space-2)' }}>{title}</h3>
        <p style={{ color: 'var(--ink-muted)', marginTop: 0 }}>{description}</p>
        <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end', marginTop: 'var(--space-4)' }}>
          <button onClick={onCancel} style={{ padding: '6px 14px', border: '1px solid var(--rule)', background: 'var(--paper)' }}>
            Cancel
          </button>
          <button
            onClick={onConfirm}
            autoFocus
            style={{
              padding: '6px 14px',
              border: 'none',
              color: '#fff',
              background: destructive ? 'var(--alarm)' : 'var(--accent)',
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
