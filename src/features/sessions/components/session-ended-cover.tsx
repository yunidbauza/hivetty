import { X } from '@phosphor-icons/react';
import { useState } from 'react';

import { endedReason, type Session } from '@/types/entity';

import { Button } from '@components/ui/button';
import { ageLabel } from '@lib/ledger/console-rows';
import { useResumeSession } from '@stores/hive-store';
import { useBackToOrch } from '@stores/ui-store';

/**
 * The session on stage ended (HIVE-211): why, when, and what is left to do.
 *
 * Drawn over the still-mounted terminal, as `SessionBootCover` and
 * `TerminalEndedCover` are, so the scrollback survives underneath. Close
 * collapses it to a strip along the foot in `TerminalEndedCover`'s shape (D2),
 * so the transcript can be read; the dismissal is this mount's, and the stage
 * keys it by session.
 */
export function SessionEndedCover({ session }: { session: Session }) {
  const [closed, setClosed] = useState(false);
  const resume = useResumeSession();
  const backToOrch = useBackToOrch();
  const reason = endedReason(session);
  const resumable = session.resumable === true;

  const actions = (
    <>
      {resumable ? (
        <Button variant="primary" onClick={() => resume(session.id)}>
          Resume
        </Button>
      ) : null}
      <Button onClick={backToOrch}>‹ Overmind</Button>
    </>
  );

  if (closed) {
    return (
      <div
        role="status"
        data-testid="session-ended-strip"
        className="absolute inset-x-0 bottom-0 z-10 flex items-center gap-3 border-t border-border-soft bg-panel/90 px-3.5 py-2 text-control text-muted backdrop-blur-sm"
      >
        <span className="flex-1 truncate">{reason}</span>
        {actions}
      </div>
    );
  }

  return (
    <div data-testid="session-ended-cover" className="absolute inset-0 z-10 flex items-center justify-center bg-scrim">
      <section
        aria-label="Session ended"
        className="relative w-[420px] max-w-[calc(100%-2rem)] rounded-lg border border-border-soft bg-panel p-5 shadow-lg"
      >
        <button
          type="button"
          aria-label="Close"
          onClick={() => setClosed(true)}
          className="absolute top-3 right-3 rounded-full p-1.5 text-muted hover:bg-hover"
        >
          <X size={12} weight="bold" aria-hidden />
        </button>
        <h2 className="text-ui-lg font-semibold text-ink">This session ended</h2>
        <p className="mt-1.5 text-ui text-muted">{reason}</p>
        {session.endedAt === undefined ? null : (
          <p className="text-ui text-muted">{`It ended ${ageLabel(Date.now() - session.endedAt)} ago.`}</p>
        )}
        {resumable ? (
          <p className="mt-1.5 text-ui text-muted">
            Its transcript is on disk, so it can carry on where it stopped.
          </p>
        ) : null}
        <div className="mt-4 flex gap-1.5">{actions}</div>
      </section>
    </div>
  );
}
