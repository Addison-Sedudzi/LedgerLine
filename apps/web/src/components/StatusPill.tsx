interface StatusPillProps {
  label: string;
  tone?: 'neutral' | 'accent' | 'alarm' | 'flag';
}

const COLORS: Record<NonNullable<StatusPillProps['tone']>, string> = {
  neutral: 'var(--ink-muted)',
  accent: 'var(--accent)',
  alarm: 'var(--alarm)',
  flag: 'var(--flag)',
};

export function StatusPill({ label, tone = 'neutral' }: StatusPillProps) {
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: 'var(--radius)',
        border: `1px solid ${COLORS[tone]}`,
        color: COLORS[tone],
        fontSize: 11,
        fontFamily: 'var(--font-display)',
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
      }}
    >
      {label}
    </span>
  );
}
