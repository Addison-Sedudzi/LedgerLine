interface DateFieldProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
}

export function DateField({ value, onChange, label }: DateFieldProps) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--ink-muted)' }}>
      {label}
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ padding: '6px 8px', border: '1px solid var(--rule)', borderRadius: 'var(--radius)' }}
      />
    </label>
  );
}
