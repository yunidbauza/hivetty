import { cn } from '@/lib/utils';

import { lostSentence } from '@components/layout/lost-note';
import { NextTry } from '@components/layout/next-try';
import { Button } from '@components/ui/button';
import { useAcknowledgeLost, useRemoteLink, useUnackedLost } from '@stores/hive-store';

/**
 * Lost the server (HIVE-211): across the top of every round-two stage while the link is down.
 * Keystrokes sent meanwhile are lost, not queued (D1), so this says how many and never promises otherwise.
 */
export function ReconnectLine() {
  const link = useRemoteLink();
  const lost = useUnackedLost();
  const acknowledgeLost = useAcknowledgeLost();
  if (link === null || link.state === 'attached') return null;

  const reconnecting = link.state === 'reconnecting';
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-border-soft px-4 py-2 text-control',
        reconnecting ? 'bg-amber-strong text-amber-text' : 'bg-red-strong text-red',
      )}
    >
      <span className="flex-1">
        {reconnecting ? (
          <>
            <b>{`Lost Hive TTY on ${link.serverName}.`}</b>
            {link.nextAttemptAt === null ? (
              ' Reconnecting.'
            ) : (
              <>
                {' '}
                <NextTry at={link.nextAttemptAt} prefix="Reconnecting in" />.
              </>
            )}{' '}
            The sessions keep running there.
          </>
        ) : (
          <>
            <b>{`Disconnected from ${link.serverName}.`}</b>
            {` The connection ended and is not being retried${link.reason === null ? '.' : `: ${link.reason}`}`}
          </>
        )}
        {lost > 0 ? (
          <span className="ml-2 text-muted">{lostSentence(lost, link.serverName, false)}</span>
        ) : null}
      </span>
      {lost > 0 ? (
        <Button size="sm" onClick={acknowledgeLost}>
          Clear
        </Button>
      ) : null}
      {reconnecting ? (
        <Button size="sm" variant="primary" onClick={() => void window.hive?.remote.dialNow()}>
          Try now
        </Button>
      ) : null}
    </div>
  );
}
