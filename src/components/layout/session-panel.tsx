import { CaretRight, Files, GitPullRequest, ListChecks, Ticket } from '@phosphor-icons/react';
import { useCallback, type ReactNode, type RefObject } from 'react';

import { useNarrowWindow } from '@/hooks/use-narrow-window';
import { useOpenFileAt } from '@/hooks/use-open-file-at';
import { cn } from '@/lib/utils';
import { isSession, isTerminal, terminalOf, type Session, type Terminal } from '@/types/entity';
import type { FlapTone } from '@/types/pull-request';
import type { Ticket as TicketModel } from '@/types/ticket';

import { RailHandle } from '@components/layout/rail-handle';
import { SessionPanelStrip, type StripTab } from '@components/layout/session-panel-strip';
import { ExplorerPanel } from '@features/explorer/components/explorer-panel';
import { PlanTab } from '@features/plan/components/plan-tab';
import { FLAP_DOT } from '@features/pull-requests/components/flap';
import { SessionPrTab } from '@features/pull-requests/components/session-pr-tab';
import { prFact } from '@features/pull-requests/session-pr';
import { TicketTab } from '@features/work/components/ticket-tab';
import { onTablistKeyDown } from '@lib/tablist';
import type { SessionPlan } from '@shared/plan-contract';
import {
  PANEL_WIDTHS,
  type SessionPanelTab,
  useSessionPanelOpen,
  useSessionPanelTab,
  useSessionPanelWidth,
  useSetSessionPanelOpen,
  useSetSessionPanelTab,
  useSetSessionPanelWidth,
} from '@stores/appearance-store';
import {
  type SessionPrRow,
  useActiveEntity,
  useChangedFileCount,
  useOpenTicket,
  usePlan,
  useSessionPrRow,
} from '@stores/hive-store';
import { usePlace } from '@stores/ui-store';

interface TabContext {
  entity: Session | Terminal;
  /** Main's id for this session: plans and changed files are keyed by it (R2). */
  mainId: string | undefined;
  plan: SessionPlan | undefined;
  changedCount: number;
  /** The session's Jira key, if it works on one (HIVE-202). */
  ticketKey: string | undefined;
  ticket: TicketModel | undefined;
  /** The session's PR and its Hatchery row (HIVE-209). */
  sessionPr: SessionPrRow | null;
  openPlanFile: (file: string) => void;
}

interface TabSpec {
  id: SessionPanelTab;
  label: (ctx: TabContext) => string;
  exists: (ctx: TabContext) => boolean;
  Icon: StripTab['Icon'];
  fact: (ctx: TabContext) => string;
  count?: (ctx: TabContext) => number;
  /** A flap-tone dot after the label and on the strip icon (HIVE-209). */
  dot?: (ctx: TabContext) => FlapTone;
  body: (ctx: TabContext) => ReactNode;
}

/**
 * The tabs, in order (HIVE-201). HIVE-202 added Ticket; HIVE-209 added PR
 * between Ticket and Files. Nothing else in the shell changes for them.
 */
const TABS: readonly TabSpec[] = [
  {
    id: 'plan',
    label: () => 'Plan',
    exists: ({ plan }) => plan !== undefined && plan.tasks.length > 0,
    Icon: ListChecks,
    // The strip draws Plan as rings with their own label (SessionPanelStrip), so this fact is the tab's tooltip only.
    fact: ({ plan }) =>
      plan === undefined || plan.allDone
        ? 'Plan, all done'
        : `Plan, ${String(plan.tasks.filter((task) => task.status === 'completed').length)} of ${String(plan.tasks.length)} done`,
    body: ({ plan, openPlanFile }) =>
      plan === undefined ? null : <PlanTab plan={plan} onOpenFile={openPlanFile} />,
  },
  {
    id: 'ticket',
    label: () => 'Ticket',
    exists: ({ ticketKey }) => ticketKey !== undefined,
    Icon: Ticket,
    fact: ({ ticketKey, ticket }) => (ticket ? `${ticket.key} · ${ticket.status}` : (ticketKey ?? 'Ticket')),
    body: ({ entity, ticketKey }) =>
      ticketKey === undefined ? null : <TicketTab ticketKey={ticketKey} sessionId={entity.id} />,
  },
  {
    id: 'pr',
    label: () => 'PR',
    exists: ({ sessionPr }) => sessionPr !== null,
    Icon: GitPullRequest,
    fact: ({ sessionPr }) => (sessionPr === null ? 'PR' : prFact(sessionPr.pr, sessionPr.row)),
    dot: ({ sessionPr }) => sessionPr?.row?.hatch.tone ?? 'muted',
    body: ({ entity, sessionPr }) =>
      sessionPr === null ? null : <SessionPrTab key={sessionPr.pr.url} sessionId={entity.id} sessionPr={sessionPr} />,
  },
  {
    id: 'files',
    label: ({ changedCount }) => (changedCount === 0 ? 'Files' : `Files ${String(changedCount)}`),
    exists: () => true,
    Icon: Files,
    fact: ({ changedCount }) =>
      changedCount === 0
        ? 'Files'
        : `${String(changedCount)} ${changedCount === 1 ? 'file' : 'files'} changed`,
    count: ({ changedCount }) => changedCount,
    body: ({ mainId }) => <ExplorerPanel {...(mainId === undefined ? {} : { changesId: mainId })} />,
  },
];

/** The tab to show: the persisted one where it exists, else Plan, else Files. */
export function pickTab(existing: readonly SessionPanelTab[], persisted: SessionPanelTab): SessionPanelTab {
  if (existing.includes(persisted)) return persisted;
  return existing.includes('plan') ? 'plan' : 'files';
}

/**
 * Round two's right side (HIVE-201): the session panel, open at `--cc-session-panel-w` (its seam drags it) with a
 * tab per thing a session has, or closed to a 46px strip of their facts.
 *
 * Drawn while the stage shows a session or terminal (R1), not gated on the
 * view: a file opened full-stage from the Files tab must not make the panel
 * vanish under the click. The Overmind and agents have no such entity.
 */
export function SessionPanel({ rowRef }: { rowRef: RefObject<HTMLElement | null> }) {
  const entity = useActiveEntity();
  const place = usePlace();
  const owner = entity && (isSession(entity) || isTerminal(entity)) ? entity : null;
  const mainId = owner !== null && isSession(owner) ? terminalOf(owner) : undefined;
  const plan = usePlan(mainId);
  const changedCount = useChangedFileCount(mainId);
  const ticketKey = owner !== null && isSession(owner) ? owner.ticket : undefined;
  const ticket = useOpenTicket(ticketKey ?? null);
  const sessionPr = useSessionPrRow(owner?.id ?? '');
  const open = useSessionPanelOpen();
  const tab = useSessionPanelTab();
  const setOpen = useSetSessionPanelOpen();
  const setTab = useSetSessionPanelTab();
  const width = useSessionPanelWidth();
  const setWidth = useSetSessionPanelWidth();
  const narrow = useNarrowWindow();
  const { openPath } = useOpenFileAt();

  /** As terminal file links do (center-stage.tsx): resolve under the session's root, then open. */
  const openPlanFile = useCallback(
    (file: string) => {
      if (owner === null) return;
      void openPath(owner.project, isSession(owner) ? owner.id : undefined, file);
    },
    [owner, openPath],
  );

  if (owner === null || place === 'home') return null;

  const ctx: TabContext = { entity: owner, mainId, plan, changedCount, ticketKey, ticket, sessionPr, openPlanFile };
  const existing = TABS.filter((spec) => spec.exists(ctx));
  const shown = pickTab(
    existing.map((spec) => spec.id),
    tab,
  );
  const openTab = (id: SessionPanelTab) => {
    setTab(id);
    setOpen(true);
  };

  if (!open || narrow) {
    return (
      <SessionPanelStrip
        plan={existing.some((spec) => spec.id === 'plan') ? plan : undefined}
        tabs={existing
          .filter((spec) => spec.id !== 'plan')
          .map((spec) => ({
            id: spec.id,
            label: spec.label(ctx),
            Icon: spec.Icon,
            fact: spec.fact(ctx),
            ...(spec.count === undefined ? {} : { count: spec.count(ctx) }),
            ...(spec.dot === undefined ? {} : { dot: spec.dot(ctx) }),
          }))}
        onOpen={openTab}
      />
    );
  }

  return (
    <>
    <RailHandle rowRef={rowRef} rail="session" label="Resize the session panel" width={width} onWidth={setWidth} />
    <aside
      aria-label="Session panel"
      style={{ minWidth: PANEL_WIDTHS.session.min }}
      className="flex w-[var(--cc-session-panel-w)] shrink flex-col overflow-hidden border-l border-border bg-panel px-3 py-1.5"
    >
      <div className="flex items-center gap-1 pt-2 pb-2.5">
        <div role="tablist" aria-label="Session panel tabs" className="flex flex-1 items-center gap-1 text-control text-muted">
          {existing.map((spec) => (
            <button
              key={spec.id}
              type="button"
              role="tab"
              id={`session-tab-${spec.id}`}
              aria-selected={spec.id === shown}
              aria-controls="session-tabpanel"
              tabIndex={spec.id === shown ? 0 : -1}
              onKeyDown={onTablistKeyDown}
              onClick={() => {
                setTab(spec.id);
              }}
              className={cn('rounded-full px-2.5 py-1', spec.id === shown ? 'bg-active text-ink' : 'hover:bg-hover')}
            >
              {spec.label(ctx)}
              {spec.dot === undefined ? null : (
                <i
                  aria-hidden
                  data-testid="pr-dot"
                  className={cn('ml-1.5 inline-block size-1.5 rounded-full align-middle', FLAP_DOT[spec.dot(ctx)])}
                />
              )}
            </button>
          ))}
        </div>
        <button
          type="button"
          aria-label="Close the session panel"
          onClick={() => {
            setOpen(false);
          }}
          className="grid size-7 place-items-center rounded-full text-muted hover:bg-hover"
        >
          <CaretRight size={14} aria-hidden />
        </button>
      </div>
      <div
        role="tabpanel"
        id="session-tabpanel"
        aria-labelledby={`session-tab-${shown}`}
        className="flex min-h-0 flex-1 flex-col overflow-y-auto"
      >
        {existing.find((spec) => spec.id === shown)?.body(ctx)}
      </div>
    </aside>
    </>
  );
}
