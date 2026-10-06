import { type ReactNode, useCallback, useEffect, useMemo, useRef } from 'react';

import { createPoller } from '@/hooks/create-poller';
import { useDetailsDrawer } from '@/hooks/use-details-drawer';
import type { Ticket } from '@/types/ticket';

import { SkeletonBar } from '@features/shared/components/skeleton-bar';
import { AdfBlocks } from '@features/work/components/adf-blocks';
import { JiraSetupPage } from '@features/work/components/jira-setup-page';
import { TicketPageConversation } from '@features/work/components/ticket-page-conversation';
import { LinesSkeleton, TicketProblem } from '@features/work/components/ticket-page-parts';
import { TicketProperties } from '@features/work/components/ticket-properties';
import { TicketTransitionMenu } from '@features/work/components/ticket-transition-menu';
import { useShownTicket } from '@features/work/shown-ticket';
import {
  useLoadTicketDetail,
  useOpenTicket,
  useRefreshTicketDetail,
  useReloadTicketTransitions,
  useTicketDetail,
  useTicketRowModels,
  useWorkListed,
} from '@stores/hive-store';

/** The open ticket's page re-reads once a minute while it is on stage (HIVE-203, D9). */
const usePagePoller = createPoller({ intervalMs: 60_000 });

/** The description, its skeleton until the first read, or its problem in its place. */
function Description({ ticketKey }: { ticketKey: string }) {
  const mine = useTicketDetail(ticketKey);
  const load = useLoadTicketDetail();
  const description = mine?.detail?.description;
  const problem = mine?.problems.detail;
  const retry = () => void load(ticketKey, 'page');

  if (description === undefined) {
    return problem === undefined ? (
      <LinesSkeleton label="Loading description" />
    ) : (
      <TicketProblem message={problem} onRetry={retry} />
    );
  }

  return (
    <div className="flex flex-col gap-2 text-ui">
      {description.length === 0 ? (
        <p className="text-subtle">No description.</p>
      ) : (
        <AdfBlocks blocks={description} className="text-ui leading-[1.7]" />
      )}
      {problem === undefined ? null : <TicketProblem message={problem} onRetry={retry} readAt={mine?.readAt} />}
    </div>
  );
}

/** The key, the status pill, the narrow page's Details button and the title. */
function Header({ ticketKey, ticket, details }: { ticketKey: string; ticket: Ticket | undefined; details: ReactNode }) {
  const listed = useMemo(() => (ticket ? [ticket] : []), [ticket]);
  const [row] = useTicketRowModels(listed);

  return (
    <header>
      <div className="flex items-center gap-2.5">
        {ticket?.url ? (
          <a
            className="tabular-nums text-control font-bold text-brand hover:underline"
            href={ticket.url}
            target="_blank"
            rel="noreferrer"
          >
            {ticketKey}
          </a>
        ) : (
          <span className="tabular-nums text-control font-bold text-brand">{ticketKey}</span>
        )}
        {ticket ? (
          <TicketTransitionMenu
            issueKey={ticket.key}
            status={ticket.status}
            statusCategory={ticket.statusCategory}
            {...(row?.tone === 'amber' ? { tone: 'amber' as const } : {})}
          />
        ) : null}
        {details}
      </div>
      {ticket && row ? (
        <h1 className="mt-1 mb-2 text-[19px] leading-[1.3] text-ink">{row.title}</h1>
      ) : (
        <div role="status" aria-label="Loading ticket" aria-busy className="mt-2 mb-3 animate-pulse">
          <SkeletonBar className="w-[60%]" />
        </div>
      )}
    </header>
  );
}

/**
 * One ticket's page (HIVE-203): the header straight from the list (or the
 * issue the slice read), the description, the conversation, and the
 * properties column. Reads on open and every minute after; a status change
 * re-reads what the ticket can become next.
 */
export function TicketPage({ ticketKey }: { ticketKey: string }) {
  const ticket = useOpenTicket(ticketKey);
  const load = useLoadTicketDetail();
  const refresh = useRefreshTicketDetail();
  const reload = useReloadTicketTransitions();

  /*
    The load does the first read of a key; the poller only the later ones. Its
    sweep on mount (or on a new key) runs before the load's effect and is
    skipped, so a key the map already holds — the page opened again, or a
    Ticket tab read it first — is read once on open, not twice, and the load
    alone reads the ledger history.
  */
  const loaded = useRef<string | null>(null);
  usePagePoller(
    useCallback(
      () => (loaded.current === ticketKey ? refresh(ticketKey, 'page') : Promise.resolve()),
      [ticketKey, refresh],
    ),
  );

  useEffect(() => {
    loaded.current = ticketKey;
    void load(ticketKey, 'page');
  }, [ticketKey, load]);

  /*
    The load already read the transitions, so the first run is skipped; every
    later status — from the pill's menu, the next-step action or a refresh of
    the list — re-reads them (D6).
  */
  const status = ticket?.status;
  const seen = useRef(status);
  useEffect(() => {
    if (seen.current === status) return;
    seen.current = status;
    void reload(ticketKey);
  }, [status, ticketKey, reload]);

  // The properties sidebar folds into this below a 760px page, as the PR page's does (HIVE-225).
  const drawer = useDetailsDrawer();

  return (
    <section aria-label={`Ticket ${ticketKey}`} className="@container relative flex min-h-0 flex-1">
      <div className="min-w-0 flex-1 overflow-y-auto p-8">
        <Header
          ticketKey={ticketKey}
          ticket={ticket}
          details={
            <button
              ref={drawer.button}
              type="button"
              aria-expanded={drawer.open}
              aria-controls="ticket-details"
              onClick={drawer.toggle}
              className="ml-auto flex items-center gap-1.5 rounded-full border border-edge px-3 py-1 text-control font-semibold text-ink hover:bg-hover @min-[760px]:hidden"
            >
              Details
            </button>
          }
        />
        <Description ticketKey={ticketKey} />
        <TicketPageConversation ticketKey={ticketKey} />
      </div>
      <aside
        aria-label="Ticket properties"
        className="hidden w-[260px] shrink-0 overflow-y-auto border-l border-border-soft px-4 py-[18px] @min-[760px]:block"
      >
        <TicketProperties ticketKey={ticketKey} />
      </aside>
      {drawer.open ? (
        <>
          <div
            data-testid="ticket-details-veil"
            aria-hidden
            className="absolute inset-0 z-10 @min-[760px]:hidden"
            onClick={drawer.close}
          />
          <div
            ref={drawer.panel}
            id="ticket-details"
            role="dialog"
            aria-label="Ticket details"
            tabIndex={-1}
            className="absolute inset-y-0 right-0 z-20 w-[260px] overflow-y-auto border-l border-border bg-panel px-4 py-[18px] shadow-lg outline-none @min-[760px]:hidden"
          >
            <TicketProperties ticketKey={ticketKey} />
          </div>
        </>
      ) : null}
    </section>
  );
}

/**
 * The Work place's stage (HIVE-203, D3): the shown ticket's page
 * (`useShownTicket`: the last one, else the next, else the first), or a prompt
 * to pick one while the list is still loading. With nothing to list it says why instead (HIVE-211).
 */
export function WorkStage() {
  const key = useShownTicket();
  const listed = useWorkListed();

  if (key === null) {
    if (!listed) return <JiraSetupPage />;
    return (
      <section aria-label="Work" className="flex flex-1 items-center justify-center">
        <p className="text-ui text-subtle">Pick a ticket</p>
      </section>
    );
  }

  return <TicketPage key={key} ticketKey={key} />;
}
