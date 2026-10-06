import { Robot } from '@phosphor-icons/react';

import { StripHead, StripRow } from '@features/home/components/strip-row';
import { useComingUp } from '@stores/hive-store';

const pad = (n: number) => String(n).padStart(2, '0');

/** `16:00`, local, 24-hour, as the mock draws it. */
export const hhmm = (ms: number) => {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** Home's Coming up (HIVE-200): scheduled wakes soonest first, then held pickups. Not drawn when empty. */
export function ComingUp() {
  const rows = useComingUp();
  if (rows.length === 0) return null;
  return (
    <section aria-label="Coming up" className="grid min-w-0 content-start gap-px">
      <StripHead>Coming up</StripHead>
      {rows.map((row) => (
        <StripRow
          key={row.id}
          icon={<Robot size={15} className="text-subtle" aria-hidden="true" />}
          name={row.agent}
          detail={row.what}
          value={row.at === undefined ? undefined : hhmm(row.at)}
        />
      ))}
    </section>
  );
}
