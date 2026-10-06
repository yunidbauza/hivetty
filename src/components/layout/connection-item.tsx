import { useState, type ReactNode } from 'react';

import { cn } from '@/lib/utils';

import { lostSentence } from '@components/layout/lost-note';
import { NextTry } from '@components/layout/next-try';
import { Popover, PopoverContent, PopoverTrigger } from '@components/ui/popover';
import { isDesktop } from '@config/runtime';
import {
  useReceiverExposure,
  useServerExposure,
  useServingDeviceCount,
} from '@hooks/use-project-config';
import { connectionStates, type ConnectionState } from '@lib/connection-states';
import { useAcknowledgeLost, useRemoteLink, useUnackedLost } from '@stores/hive-store';
import { useSettingsActions } from '@stores/ui-store';

/** The bar's item shape (`activity-bar.tsx`), with room for a dot instead of an icon. */
const ITEM =
  'relative grid w-[52px] justify-items-center gap-[5px] rounded-lg pt-[9px] pb-[5px] text-micro font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand';

/** Colour means state only. The ring pulses; the global reduced-motion clamp stills it. */
const DOT: Record<ConnectionState, string> = {
  local: 'bg-green',
  serving: 'bg-brand',
  attached: 'bg-brand',
  reconnecting: 'box-border border-2 border-amber animate-ccpulse',
  disconnected: 'bg-red',
  exposed: 'bg-amber',
  demo: 'bg-amber',
};

const TONE: Record<ConnectionState, string> = {
  local: 'text-ink',
  serving: 'text-ink',
  attached: 'text-ink',
  reconnecting: 'text-amber-text',
  disconnected: 'text-red',
  exposed: 'text-amber-text',
  demo: 'text-amber-text',
};

const AMBER_LABEL: ReadonlySet<ConnectionState> = new Set(['reconnecting', 'exposed', 'demo']);

function Dot({ state }: { state: ConnectionState }) {
  return <span data-dot aria-hidden className={cn('size-2 shrink-0 rounded-full', DOT[state])} />;
}

/**
 * Round two's connection state, at the bar's foot (HIVE-196). It replaces the
 * header's Demo, Exposure, Serving and Attached chips and keeps their source
 * rules: what is bound and attached now, never what config says for next
 * launch. One label, by `connectionStates` precedence; the popover lists every
 * state that holds.
 */
export function ConnectionItem() {
  const link = useRemoteLink();
  const exposed = useReceiverExposure();
  const serving = useServerExposure();
  const devices = useServingDeviceCount();
  const { openSettings } = useSettingsActions();
  const [open, setOpen] = useState(false);
  const name = link?.serverName ?? '';

  /*
    What the dropped link lost that nobody has cleared (HIVE-140). The
    acknowledgement lives in the store beside the link (HIVE-211), so Clear
    here or on the stage line clears all three.
  */
  const lost = useUnackedLost();
  const acknowledgeLost = useAcknowledgeLost();
  const lostNote =
    link === null || lost === 0 ? null : (
      <span className="mt-1 flex items-baseline gap-2">
        <span>{lostSentence(lost, name, link.state === 'attached')}</span>
        <button
          type="button"
          onClick={acknowledgeLost}
          className="shrink-0 rounded-full bg-chip px-2.5 py-0.5 text-micro text-ink hover:bg-chip-hover"
        >
          Clear
        </button>
      </span>
    );

  const states = connectionStates({ demo: !isDesktop(), exposed, serving, link });
  const top = states[0];
  const LABEL: Record<ConnectionState, string> = {
    local: 'Local',
    serving: 'Serving',
    attached: name,
    reconnecting: name,
    disconnected: name,
    exposed: 'Exposed',
    demo: 'Demo',
  };
  const label = LABEL[top];

  const settingsLink = (group: string) => (
    <button
      type="button"
      onClick={() => {
        setOpen(false);
        openSettings('advanced');
      }}
      className="text-brand hover:underline"
    >
      Settings › Advanced › {group}
    </button>
  );

  const rows: Record<ConnectionState, { title: string; body: ReactNode }> = {
    local: { title: 'Local', body: 'This Hive runs here. Nothing is served or exposed.' },
    serving: {
      title: 'Serving',
      body: (
        <>
          Serving its sessions to {devices === 1 ? '1 paired device' : `${String(devices)} paired devices`} on{' '}
          {serving}. {settingsLink('Server mode')}
        </>
      ),
    },
    attached: {
      title: `Attached to ${name}`,
      body: (
        <>
          This window is attached over a socket — its sessions are what you are driving right now.
          {lostNote}
        </>
      ),
    },
    reconnecting: {
      title: `Reconnecting to ${name}`,
      body: (
        <>
          The connection dropped and is being re-established. Your sessions are still running there.
          {link === null || link.nextAttemptAt === null ? null : (
            <>
              {' '}
              <NextTry at={link.nextAttemptAt} prefix="Next try in" />.
            </>
          )}
          {lostNote}
        </>
      ),
    },
    disconnected: {
      title: `Disconnected from ${name}`,
      body: (
        <>
          {`The connection ended and is not being retried${link === null || link.reason === null ? '.' : `: ${link.reason}`}`}
          {lostNote}
        </>
      ),
    },
    exposed: {
      title: `Exposed on ${exposed ?? ''}`,
      body: (
        <>
          The receiver accepts connections on {exposed}, not only loopback. {settingsLink('Containers')}
        </>
      ),
    },
    demo: {
      title: 'Demo',
      body: 'Demo build — terminals are recorded transcripts. Real sessions need the desktop app.',
    },
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid="connection-item"
          aria-label={`Connection: ${label}`}
          className={cn(
            ITEM,
            open ? 'bg-hover' : 'hover:bg-hover',
            AMBER_LABEL.has(top) ? 'text-amber-text' : 'text-muted',
          )}
        >
          <Dot state={top} />
          <span className="max-w-[48px] truncate">{label}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent side="right" align="end" aria-label="Connection" className="flex w-[340px] flex-col">
        {states.map((state, index) => (
          <section
            key={state}
            className={cn('grid grid-cols-[14px_1fr] gap-x-2 gap-y-1 p-2.5', index > 0 && 'border-t border-border-soft')}
          >
            <span className="pt-[5px]">
              <Dot state={state} />
            </span>
            <h3 className={cn('text-control font-semibold', TONE[state])}>{rows[state].title}</h3>
            <span />
            <div className="text-control leading-[1.45] text-muted">{rows[state].body}</div>
          </section>
        ))}
      </PopoverContent>
    </Popover>
  );
}
