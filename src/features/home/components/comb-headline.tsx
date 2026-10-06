import { cn } from '@/lib/utils';

import { useTeamName } from '@stores/appearance-store';
import type { CombSummary } from '@stores/hive-store';

/** The hive's mood, first match wins. Only the two that ask something of you take a colour. */
export function headline(needs: number, s: CombSummary): { text: string; tone: string } {
  if (needs > 0) return { text: `The hive is calling · ${String(needs)} summons`, tone: 'text-amber-text' };
  if (s.failed > 0) return { text: 'The hive is wounded', tone: 'text-red' };
  if (s.working > 0) return { text: 'The hive is humming', tone: 'text-muted' };
  if (s.resting > 0) return { text: 'The hive is quiet', tone: 'text-muted' };
  return { text: 'The hive is dormant', tone: 'text-muted' };
}

export const summaryText = (s: CombSummary): string =>
  [
    `${String(s.working)} working`,
    s.failed > 0 ? `${String(s.failed)} failed` : null,
    `${String(s.resting)} resting`,
    `${String(s.projects)} projects`,
    `${String(s.agents)} agents`,
  ]
    .filter((part) => part !== null)
    .join(' · ');

/**
 * The line over the comb (HIVE-199): the hive's mood, then the counts.
 *
 * `needs` is the Summons queue's count (`useSummonsCount`, HIVE-217), the one
 * the strip and the pill read, with the session on stage left out, so the three
 * can never show two numbers for one fact. The rest of the line is the comb's.
 * The team name, when there is one, sits at the far right.
 */
export function CombHeadline({ needs, summary }: { needs: number; summary: CombSummary }) {
  const { text, tone } = headline(needs, summary);
  const team = useTeamName();
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 flex items-baseline gap-3.5 bg-linear-to-b from-bg to-transparent px-7 py-[18px]">
      <h2 className={cn('text-ui-lg font-semibold', tone)}>{text}</h2>
      <span className="text-muted">{summaryText(summary)}</span>
      {team ? <span className="ml-auto font-mono text-micro font-semibold uppercase tracking-[0.12em] text-subtle">{team}</span> : null}
    </div>
  );
}
