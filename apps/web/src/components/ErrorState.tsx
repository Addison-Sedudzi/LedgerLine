interface ErrorStateProps {
  message: string;
}

export function ErrorState({ message }: ErrorStateProps) {
  return (
    <div
      role="alert"
      style={{
        padding: 'var(--space-4)',
        border: '1px solid var(--alarm)',
        borderRadius: 'var(--radius)',
        color: 'var(--alarm)',
        background: 'color-mix(in srgb, var(--alarm) 8%, var(--paper))',
      }}
    >
      {message}
    </div>
  );
}
