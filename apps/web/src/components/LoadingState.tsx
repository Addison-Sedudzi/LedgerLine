// Shown while a query's first fetch is in flight — the gap between "nothing requested yet"
// and "here are the results" that otherwise reads as a blank page. Pass `label` for context
// specific enough to tell a genuine delay apart from something actually stuck.
export function LoadingState({ label = 'Loading…' }: { label?: string }) {
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
      <p style={{ margin: 0 }}>{label}</p>
    </div>
  );
}
