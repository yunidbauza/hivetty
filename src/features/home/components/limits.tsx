import { StripHead } from '@features/home/components/strip-row';
import { resetsDayLabel, timeLeftLabel } from '@lib/session-metrics';
import { useAccountLimits } from '@stores/hive-store';

function LimitRow({ label, pct, rest }: { label: string; pct: number; rest: string | null }) {
  return (
    <div className="grid grid-cols-[56px_1fr_34px_76px] items-center gap-2 text-control text-muted">
      <span>{label}</span>
      <span className="h-1.5 rounded bg-chip" aria-hidden="true">
        <span
          className="block h-full rounded bg-muted"
          style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
        />
      </span>
      <span className="tabular-nums text-ink">{Math.round(pct)}%</span>
      <span className="truncate">{rest ?? ''}</span>
    </div>
  );
}

/** Home's Limits (HIVE-200). A window the status line has not reported draws no row; neither, no block. */
export function Limits() {
  const limits = useAccountLimits();
  if (limits.fiveHourPct === undefined && limits.sevenDayPct === undefined) return null;
  return (
    <div>
      <StripHead>Limits</StripHead>
      <div className="grid gap-2">
        {limits.fiveHourPct !== undefined && (
          <LimitRow
            label="Session"
            pct={limits.fiveHourPct}
            rest={timeLeftLabel(limits.fiveHourResetsAt, Date.now())}
          />
        )}
        {limits.sevenDayPct !== undefined && (
          <LimitRow label="Week" pct={limits.sevenDayPct} rest={resetsDayLabel(limits.sevenDayResetsAt)} />
        )}
      </div>
    </div>
  );
}
