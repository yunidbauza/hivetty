import type { Icon } from '@phosphor-icons/react';

import { cn } from '@/lib/utils';
import type { FlapTone } from '@/types/pull-request';

import { PlanRings } from '@features/plan/components/plan-rings';
import { FLAP_DOT } from '@features/pull-requests/components/flap';
import type { SessionPlan } from '@shared/plan-contract';
import type { SessionPanelTab } from '@stores/appearance-store';

/** One closed tab: its icon and the one fact it carries. */
export interface StripTab {
  id: SessionPanelTab;
  label: string;
  Icon: Icon;
  /** The button's name and tooltip ("2 files changed"). */
  fact: string;
  count?: number;
  /** A PR's flap tone (HIVE-209). */
  dot?: FlapTone;
}

interface SessionPanelStripProps {
  /** Only when the Plan tab exists. */
  plan: SessionPlan | undefined;
  /** Every other existing tab, in table order. */
  tabs: StripTab[];
  onOpen: (id: SessionPanelTab) => void;
}

/**
 * The closed session panel (HIVE-201): today's plan rail on top, then one
 * icon per other tab that exists, each carrying its one fact. Any of them
 * opens the panel on that tab.
 */
export function SessionPanelStrip({ plan, tabs, onOpen }: SessionPanelStripProps) {
  const done = plan?.tasks.filter((task) => task.status === 'completed').length ?? 0;
  const total = plan?.tasks.length ?? 0;

  return (
    <aside
      aria-label="Session panel"
      className="flex w-[var(--cc-session-strip-w)] shrink-0 flex-col items-center gap-2.5 border-l border-border bg-panel py-3.5"
    >
      {plan === undefined ? null : (
        <>
          <button
            type="button"
            aria-label={plan.allDone ? 'Plan, all done' : `Plan, ${String(done)} of ${String(total)} done`}
            onClick={() => {
              onOpen('plan');
            }}
            className="flex flex-col items-center rounded-full hover:bg-hover"
          >
            <PlanRings plan={plan} />
          </button>
          <i aria-hidden data-divider className="my-1.5 h-px w-5 bg-border" />
        </>
      )}
      {tabs.map(({ id, Icon: TabIcon, fact, count, dot }) => (
        <button
          key={id}
          type="button"
          title={fact}
          aria-label={fact}
          onClick={() => {
            onOpen(id);
          }}
          className="relative grid size-7 place-items-center rounded-full text-muted hover:bg-hover hover:text-ink"
        >
          <TabIcon size={16} aria-hidden />
          {count === undefined || count === 0 ? null : (
            <b className="absolute right-0 bottom-0 tabular-nums text-micro font-semibold text-muted">
              {count}
            </b>
          )}
          {dot === undefined ? null : (
            <i
              aria-hidden
              data-testid="pr-dot"
              className={cn('absolute top-[3px] right-[3px] size-1.5 rounded-full ring-2 ring-panel', FLAP_DOT[dot])}
            />
          )}
        </button>
      ))}
    </aside>
  );
}
