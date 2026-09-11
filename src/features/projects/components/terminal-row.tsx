import { Terminal as TerminalGlyph } from '@phosphor-icons/react';

import { cn } from '@/lib/utils';
import { cwdTail, isTerminal, terminalLabel } from '@/types/entity';

import { STATUS_TEXT } from '@components/ui/status-dot';
import { useEntity, useOpenEntity } from '@stores/hive-store';
import { useActiveTab } from '@stores/ui-store';

interface TerminalRowProps {
  id: string;
}

/**
 * One terminal beneath its project (terminals).
 *
 * The same two lines as a session row, with the glyph doing the work the dot
 * does there: the glyph says *terminal*, its colour says the state. A distinct
 * icon is what keeps a mixed list legible without a second sorting rule, so
 * terminals sit among sessions in the order they started.
 *
 * The second line is the directory's tail rather than a branch — a terminal
 * knows where it started and nothing about git.
 *
 * Renders nothing for an id the store does not know, or for a session: the
 * project row dispatches on kind, and a row that insists is a race.
 */
export function TerminalRow({ id }: TerminalRowProps) {
  const entity = useEntity(id);
  const activeTab = useActiveTab();
  const openEntity = useOpenEntity();

  if (!entity || !isTerminal(entity)) return null;

  const active = activeTab === id;
  // A dead shell keeps its last status on the entity, but the row must not
  // paint it: muted, like a terminated session, with `lost` for the word.
  const tone = entity.ended === undefined ? STATUS_TEXT[entity.status] : 'text-muted';

  return (
    <button
      type="button"
      onClick={() => openEntity(id)}
      aria-current={active ? 'true' : undefined}
      className={cn(
        'flex flex-col rounded-lg py-[3px] pr-2.5 pl-[26px] leading-[1.35]',
        active ? 'bg-active' : 'hover:bg-hover',
      )}
    >
      <span className="flex w-full items-center gap-2">
        {/* Decoration: the label beside it carries the state in words. */}
        <TerminalGlyph
          size={11}
          weight="bold"
          aria-hidden="true"
          className={cn('shrink-0', tone)}
        />
        <span className="flex-1 truncate text-left font-mono text-[12.5px]">
          {entity.id}
        </span>
        <span className={cn('shrink-0 text-[10.5px] font-semibold', tone)}>
          {terminalLabel(entity)}
        </span>
      </span>

      <span className="w-full truncate pl-[15px] text-left font-mono text-[10.5px] text-subtle">
        {cwdTail(entity.cwd)}
      </span>
    </button>
  );
}
