import { X } from '@phosphor-icons/react';

import type { Terminal } from '@/types/entity';

import { useRemoveTerminal } from '@stores/hive-store';

interface TerminalEndedCoverProps {
  terminal: Terminal;
}

/**
 * What a terminal shows once its shell died unasked (terminals).
 *
 * Not a status — a terminal whose shell has exited is over, not in a state.
 * The tab stays for one reason: to say why, over the transcript that led to
 * it. A shell that left because the user typed `exit` never reaches this;
 * that tab is simply gone.
 *
 * Drawn over the terminal, like the boot cover, and for the same reason: the
 * surface underneath stays mounted and laid out, so its scrollback — the last
 * thing the shell printed — survives to be read. Unlike the boot cover this
 * one takes clicks: its close control is the only way to dismiss it.
 *
 * A strip along the foot rather than a full cover, deliberately: the transcript
 * above it is the evidence.
 */
export function TerminalEndedCover({ terminal }: TerminalEndedCoverProps) {
  const removeTerminal = useRemoveTerminal();
  const reason = terminal.ended?.reason ?? 'the shell has ended';

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="terminal-ended-cover"
      className="absolute inset-x-0 bottom-0 z-10 flex items-center gap-3 border-t border-border-soft bg-panel/90 px-3.5 py-2 font-mono text-[11.5px] text-muted backdrop-blur-sm"
    >
      <span className="flex-1 truncate">
        {terminal.id} — {reason}
      </span>
      <button
        type="button"
        onClick={() => removeTerminal(terminal.id)}
        aria-label={`Close ${terminal.id}`}
        className="flex items-center gap-1 rounded-md px-2 py-0.5 text-ink hover:bg-hover"
      >
        <X size={11} weight="bold" aria-hidden="true" />
        close
      </button>
    </div>
  );
}
