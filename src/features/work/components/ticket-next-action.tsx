import { CaretDown, CaretRight } from '@phosphor-icons/react';
import { useState } from 'react';

import { applyJiraTransition } from '@/lib/jira';
import { BRIDGE_ERROR, cn } from '@/lib/utils';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@components/ui/dropdown-menu';
import { CATEGORY_TEXT, STATUS_PILL } from '@features/work/ticket-presentation';
import { useSetTicketDetailIssue, useTicketTransitions, useUpdateTicket } from '@stores/hive-store';

/**
 * "Move to ⌄": every status the ticket's workflow allows from where it stands
 * (HIVE-203), shared by the ticket page's properties and the session panel's
 * Ticket tab (HIVE-202). The list is the slice's cached transitions, re-read
 * whenever the status moves, so opening the menu costs nothing. The re-read
 * issue goes to both homes a ticket can have — the list, and the slice's own
 * `issue` for one the list does not hold. A refusal says why under the row.
 */
export function TicketNextAction({ ticketKey, className }: { ticketKey: string; className?: string }) {
  const transitions = useTicketTransitions(ticketKey);
  const updateTicket = useUpdateTicket();
  const setIssue = useSetTicketDetailIssue();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  if (transitions.length === 0) return null;

  const apply = (transitionId: string) => {
    setBusy(true);
    setProblem(null);
    void applyJiraTransition({ key: ticketKey, transitionId }).then((result) => {
      setBusy(false);
      if (result === null) return setProblem(BRIDGE_ERROR);
      if (!result.ok) return setProblem(result.error.message);
      updateTicket(result.value);
      setIssue(result.value);
    });
  };

  return (
    <div className="flex flex-col">
      <DropdownMenu>
        {/* A plain row like its sibling actions; the callers pass the brand text-link class. */}
        <DropdownMenuTrigger className={cn('aria-busy:opacity-60', className)} aria-busy={busy || undefined}>
          <CaretRight size={13} aria-hidden />
          Move to
          <CaretDown size={11} aria-hidden />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {transitions.map((transition) => (
            <DropdownMenuItem key={transition.id} disabled={busy} onSelect={() => apply(transition.id)}>
              {/* The header's own status pill, so where it goes reads like where it is. */}
              <span className={cn(STATUS_PILL, CATEGORY_TEXT[transition.to.statusCategory])}>{transition.to.name}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {/* Always mounted: a live region that mounts with its text is not reliably announced (HIVE-225). */}
      <div role="status">
        {problem === null ? null : <p className="py-1 text-control text-amber-text">{problem}</p>}
      </div>
    </div>
  );
}
