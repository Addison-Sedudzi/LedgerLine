import { ReactNode } from 'react';

interface EmptyStateProps {
  title: string;
  action?: ReactNode;
}

export function EmptyState({ title, action }: EmptyStateProps) {
  return (
    <div
      style={{
        textAlign: 'center',
        padding: 'var(--space-6)',
        color: 'var(--ink-muted)',
        border: '1px dashed var(--rule)',
        borderRadius: 'var(--radius)',
      }}
    >
      <p style={{ margin: 0, marginBottom: action ? 'var(--space-3)' : 0 }}>{title}</p>
      {action}
    </div>
  );
}
