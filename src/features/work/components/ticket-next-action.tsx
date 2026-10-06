import { CaretRight } from '@phosphor-icons/react';
import { useState } from 'react';

import { applyJiraTransition } from '@/lib/jira';
import { BRIDGE_ERROR, cn } from '@/lib/utils';

import { Button } from '@components/ui/button';
import { CATEGORY_TEXT, STATUS_PILL } from '@features/work/ticket-presentation';
import {
  useNextTransition,
  useReloadTicketTransitions,
  useSetTicketDetailIssue,
  useUpdateTicket,
} from '@stores/hive-store';

/**
 * "Move to [status]": the one step forward (HIVE-203, D6), shared by the
 * ticket page's properties and the session panel's Ticket tab (HIVE-202). The
 * re-read issue goes to both homes a ticket can have — the list, and the
 * slice's own `issue` for one the list does not hold; each ignores a ticket
 * that is not its own. A refusal says why under the button and keeps it.
 */
export function TicketNextAction({ ticketKey, className }: { ticketKey: string; className?: string }) {
  const next = useNextTransition(ticketKey);
  const updateTicket = useUpdateTicket();
  const setIssue = useSetTicketDetailIssue();
  const reload = useReloadTicketTransitions();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  if (!next) return null;

  const apply = () => {
    setBusy(true);
    setProblem(null);
    void applyJiraTransition({ key: ticketKey, transitionId: next.id }).then((result) => {
      setBusy(false);
      if (result === null) return setProblem(BRIDGE_ERROR);
      if (!result.ok) return setProblem(result.error.message);
      updateTicket(result.value);
      setIssue(result.value);
      void reload(ticketKey);
    });
  };

  return (
    <div className="flex flex-col">
      {/* The resets undo the ghost Button's chrome; the callers pass a brand text link (HIVE-225). */}
      <Button
        variant="ghost"
        className={cn('flex-wrap rounded-none border-0 p-0 leading-normal hover:bg-transparent hover:text-brand aria-disabled:opacity-60', className)}
        onClick={apply}
        pending={busy}
      >
        <CaretRight size={13} aria-hidden />
        Move to{' '}
        {/* The header's own status pill, so where it goes reads like where it is. */}
        <span className={cn(STATUS_PILL, CATEGORY_TEXT[next.to.statusCategory])}>{next.to.name}</span>
      </Button>
      {/* Always mounted: a live region that mounts with its text is not reliably announced (HIVE-225). */}
      <div role="status">
        {problem === null ? null : <p className="py-1 text-control text-amber-text">{problem}</p>}
      </div>
    </div>
  );
}
