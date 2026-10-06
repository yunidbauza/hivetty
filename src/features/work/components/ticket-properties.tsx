import { ArrowSquareOut, Hexagon } from '@phosphor-icons/react';
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

import { TicketNextAction } from '@features/work/components/ticket-next-action';
import { TicketPrRow } from '@features/work/components/ticket-pr-row';
import { TicketSessionRow } from '@features/work/components/ticket-session-row';
import { useOpenTicket, useTicketPrs, useTicketProperties, useTicketSessions } from '@stores/hive-store';
import { usePickerActions } from '@stores/ui-store';

const HEADING = 'pt-3 pb-1 text-micro font-semibold tracking-[0.06em] text-subtle uppercase';
const ACTION = 'flex items-center gap-2 py-1.5 text-left text-control text-brand hover:underline disabled:opacity-60';

function Heading({ children }: { children: ReactNode }) {
  return <h2 className={HEADING}>{children}</h2>;
}

/**
 * The ticket page's right column (HIVE-203): its key/values, the sessions and
 * pull requests on it, and what can be done next. A row with no value is left
 * out rather than drawn empty; Assignee alone always shows, as `Unassigned`.
 */
export function TicketProperties({ ticketKey }: { ticketKey: string }) {
  const ticket = useOpenTicket(ticketKey);
  const properties = useTicketProperties(ticketKey);
  const sessions = useTicketSessions(ticketKey);
  const prs = useTicketPrs(ticketKey);
  const { openPicker } = usePickerActions();

  if (ticket === undefined || properties === undefined) return null;

  const rows: [string, string | undefined, string?][] = [
    ['Status', properties.status],
    ['Priority', properties.priority],
    ['Side', properties.side],
    ['Project', properties.project],
    ['Assignee', properties.assignee],
    ['Agent', properties.agent],
    ['Epic', properties.epic, 'tabular-nums'],
  ];

  return (
    <div className="flex flex-col">
      <dl className="grid grid-cols-[84px_1fr] gap-x-2.5 gap-y-[9px] text-control">
        {rows.map(([key, text, extra]) =>
          text === undefined ? null : (
            <div key={key} className="contents">
              <dt className="text-muted">{key}</dt>
              <dd className={cn('min-w-0 truncate font-medium text-ink', extra)}>{text}</dd>
            </div>
          ),
        )}
      </dl>

      {sessions.length > 0 ? (
        <>
          <Heading>Session</Heading>
          {sessions.map((id) => (
            <TicketSessionRow key={id} id={id} />
          ))}
        </>
      ) : null}

      {prs.length > 0 ? (
        <>
          <Heading>Pull request</Heading>
          {prs.map((pr) => (
            <TicketPrRow key={`${pr.repo}#${pr.n}`} pr={pr} />
          ))}
        </>
      ) : null}

      <Heading>Actions</Heading>
      <button type="button" className={ACTION} onClick={() => openPicker(ticketKey)}>
        <Hexagon size={13} aria-hidden />
        New session
      </button>
      <TicketNextAction ticketKey={ticketKey} className={ACTION} />
      {ticket.url ? (
        <a className={ACTION} href={ticket.url} target="_blank" rel="noreferrer">
          <ArrowSquareOut size={13} aria-hidden />
          Open in Jira
        </a>
      ) : null}
    </div>
  );
}
