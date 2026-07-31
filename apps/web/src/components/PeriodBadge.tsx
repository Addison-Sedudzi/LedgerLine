import { PeriodStatus } from '@ledgerline/shared';
import { StatusPill } from './StatusPill';

export function PeriodBadge({ name, status }: { name: string; status: PeriodStatus }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      {name}
      <StatusPill label={status} tone={status === 'OPEN' ? 'accent' : 'neutral'} />
    </span>
  );
}
