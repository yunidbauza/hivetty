import { cn } from '@/lib/utils';

import { StripHead } from '@features/home/components/strip-row';
import { FLAP_TEXT } from '@features/shared/flap-tone';
import { type FlapCount, usePrFlapCounts } from '@stores/hive-store';

const NO_SUMMONS: FlapCount = { flap: 'SUMMONS', count: 0, tone: 'amber' };

/** Home's Pull requests (HIVE-200): counts per flap in HIVE-215's tones. Not drawn with none. */
export function PrCounts() {
  const counts = usePrFlapCounts();
  if (counts.length === 0) return null;
  // The calm mock's "0 SUMMONS": nothing needs you still reads, in grey.
  const shown = counts.some((c) => c.flap === 'SUMMONS') ? counts : [NO_SUMMONS, ...counts];
  return (
    <div className="mt-3">
      <StripHead>Pull requests</StripHead>
      <div className="flex flex-wrap gap-x-3 gap-y-1.5 tabular-nums text-micro font-semibold tracking-[0.06em]">
        {shown.map(({ flap, count, tone }) => (
          <span
            key={flap}
            className={cn('flex items-baseline gap-1', count === 0 ? 'text-subtle' : FLAP_TEXT[tone])}
          >
            <b className="text-ui">{count}</b>
            <span>{flap}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
