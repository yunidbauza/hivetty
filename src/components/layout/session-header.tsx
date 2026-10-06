import { CaretLeft, DotsThree, Hexagon, Terminal as TerminalGlyph } from '@phosphor-icons/react';

import { cn } from '@/lib/utils';
import {
  branchLabel,
  cwdTail,
  endedReason,
  entityLabel,
  isTerminal,
  isTerminated,
  terminalLabel,
  type Session,
  type Terminal,
} from '@/types/entity';

import { ModelChip } from '@components/layout/model-chip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@components/ui/dropdown-menu';
import { StatusDot, statusLabel, statusText } from '@components/ui/status-dot';
import { useProjectContainerised } from '@hooks/use-project-config';
import { isMacPlatform } from '@lib/platform';
import { backChordLabel } from '@lib/terminal/keymap';
import { useDelegateTitle, useDelegateWord, useSessionPr, useSpawnTerminalBeside } from '@stores/hive-store';
import { useBackToOrch } from '@stores/ui-store';

/**
 * Round two's header over a session or a terminal (HIVE-197). The model slot
 * holds `ModelChip` (HIVE-196), which reads the active entity: this header only
 * renders over the active session.
 */
export function SessionHeader({ entity }: { entity: Session | Terminal }) {
  const backToOrch = useBackToOrch();

  return (
    <div
      data-testid="session-header"
      className="@container flex shrink-0 items-center gap-3 border-b border-border-soft bg-panel px-5 py-2.5"
    >
      <button
        type="button"
        onClick={backToOrch}
        aria-label="Back to overmind"
        title={`Back to overmind (${backChordLabel(isMacPlatform())})`}
        className="grid size-7 shrink-0 place-items-center rounded-full text-brand hover:bg-hover"
      >
        <CaretLeft size={14} weight="bold" aria-hidden="true" />
      </button>
      <span aria-hidden="true" className="h-[22px] w-px shrink-0 bg-border-soft" />
      {isTerminal(entity) ? <TerminalLine terminal={entity} /> : <SessionLine session={entity} />}
    </div>
  );
}

function SessionLine({ session }: { session: Session }) {
  const tone = statusText(session.status, session.idleDetail);
  const delegate = useDelegateWord(session);
  const delegateTitle = useDelegateTitle(session);
  // An ended session says so, and why (HIVE-211); the cover over the terminal says the rest.
  const ended = isTerminated(session);
  const reason = ended ? endedReason(session) : undefined;
  const word = ended ? 'Ended' : statusLabel(session.status, session.idleDetail, delegate);

  return (
    <>
      <Hexagon size={20} aria-hidden="true" className={cn('shrink-0', tone)} />
      {/*
        Basis 0 and the row's only grower: the title takes what the rest leaves,
        and below its floor it is frozen, so a row that still does not fit is
        taken from the model slot alone (HIVE-220).
      */}
      {/* 96px at the narrowest step: beside both rails at 1200px the content box is 452px (the rails' grip gutters, #71), and the chip's last step needs 195. */}
      <span className="flex min-w-[140px] flex-1 basis-0 flex-col @max-[500px]:min-w-[96px]">
        <span className="truncate text-ui font-semibold text-ink" title={session.task}>
          {entityLabel(session)}
        </span>
        <span className="truncate tabular-nums text-ui-sm text-muted">
          {session.project} · {branchLabel(session)}
        </span>
      </span>
      <span
        data-testid="session-status"
        className={cn('flex shrink-0 items-center gap-1.5 text-control', ended ? 'text-muted' : tone)}
        // A narrow header hides the word (HIVE-213; 720px since the rails' gutters, #71, where the row needs ~705); the title keeps it for the dot.
        title={reason ?? delegateTitle ?? word}
        aria-label={reason === undefined ? undefined : `Ended: ${reason}`}
      >
        <StatusDot status={session.status} detail={session.idleDetail} delegate={delegate} />
        <span data-word className="@max-[720px]:sr-only">
          {word}
        </span>
      </span>
      {/*
        The chip's own steps should keep it whole (HIVE-220). If they ever miss,
        the stats clip at their end here, and the menu stays in the header.
      */}
      <span data-slot="model" className="min-w-0 shrink overflow-hidden">
        <ModelChip />
      </span>
      <SessionMenu session={session} />
    </>
  );
}

/** A terminal's line: no model and no menu (spec, Decisions). */
function TerminalLine({ terminal }: { terminal: Terminal }) {
  return (
    <>
      <TerminalGlyph size={20} aria-hidden="true" className="shrink-0 text-muted" />
      <span className="flex min-w-0 flex-col">
        <span className="truncate tabular-nums text-ui font-semibold text-ink" title={entityLabel(terminal)}>
          {entityLabel(terminal)}
        </span>
        <span className="truncate tabular-nums text-ui-sm text-muted">
          {terminal.project} · {cwdTail(terminal.cwd)}
        </span>
      </span>
      <span className="flex-1" />
      <span className="shrink-0 text-control text-muted">{terminalLabel(terminal)}</span>
    </>
  );
}

function SessionMenu({ session }: { session: Session }) {
  const spawnTerminalBeside = useSpawnTerminalBeside();
  const containerised = useProjectContainerised(session.project);
  const pr = useSessionPr(session.id);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Session menu"
        className="shrink-0 rounded-full p-1 text-muted hover:bg-hover hover:text-ink"
      >
        <DotsThree size={18} weight="bold" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="min-w-[13rem]"
      >
        <DropdownMenuItem
          onSelect={() => spawnTerminalBeside(session.id)}
          title={
            containerised
              ? 'This session runs in a container; a terminal is host-only'
              : undefined
          }
          className="justify-between gap-4"
        >
          Terminal here
          <span className="tabular-nums text-micro text-subtle">⌃`</span>
        </DropdownMenuItem>
        {pr ? (
          <DropdownMenuItem asChild>
            <a href={pr.url} target="_blank" rel="noreferrer">
              Open PR #{pr.n}
              {pr.state === undefined ? ' · last seen' : ` · ${pr.state}`}
            </a>
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
