import type { TicketRowModel, TicketTone } from '@/lib/ticket-activity';
import { cn } from '@/lib/utils';

import { useOpenWorkTicket, useWorkTicket } from '@stores/ui-store';

/** Amber needs you and glows; green is being worked; ring is quiet. */
const DOT: Record<TicketTone, string> = {
  amber: 'bg-amber ring-[3px] ring-amber-strong',
  green: 'bg-green',
  ring: 'border-[1.5px] border-subtle bg-transparent',
};

/**
 * One ticket in the round-two Work panel (HIVE-203): its dot and title, then
 * its key and the one fact that leads. Clicking opens its page on the stage.
 */
export function TicketRow({ row }: { row: TicketRowModel }) {
  const open = useWorkTicket();
  const openTicket = useOpenWorkTicket();
  const current = open === row.ticket.key;

  return (
    <button
      type="button"
      onClick={() => openTicket(row.ticket.key)}
      aria-current={current ? 'true' : undefined}
      className={cn(
        'flex w-full items-start gap-2.5 rounded-lg px-2 py-2 text-left hover:bg-hover',
        current && 'bg-active hover:bg-active',
      )}
    >
      <span
        data-tone={row.tone}
        aria-hidden
        className={cn('mt-[5px] size-2 shrink-0 rounded-full', DOT[row.tone])}
      />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-ui text-ink">{row.title}</span>
        <span className="truncate text-ui-sm text-muted">
          <span className="tabular-nums text-brand">{row.ticket.key}</span> · {row.fact}
        </span>
      </span>
    </button>
  );
}
