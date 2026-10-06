import type { RemoteLinkStatus } from '@shared/ipc-contract';

/** What the round-two connection item can say, in label precedence (HIVE-196). */
export type ConnectionState =
  | 'disconnected'
  | 'reconnecting'
  | 'exposed'
  | 'demo'
  | 'attached'
  | 'serving'
  | 'local';

export interface ConnectionInput {
  /** The browser target: no real terminals. */
  demo: boolean;
  /** `useReceiverExposure()`: the receiver's off-loopback bind, or `null`. */
  exposed: string | null;
  /** `useServerExposure()`: the server-mode bind, or `null`. */
  serving: string | null;
  /** `useRemoteLink()`: `null` while local. */
  link: RemoteLinkStatus | null;
}

/**
 * Every state that holds, most urgent first; `['local']` when none does. The
 * first is the item's label, all of them are the popover's rows. Serving and
 * attached never hold together: a machine that serves does not attach.
 */
export function connectionStates({ demo, exposed, serving, link }: ConnectionInput): [ConnectionState, ...ConnectionState[]] {
  const candidates: readonly [boolean, ConnectionState][] = [
    [link?.state === 'disconnected', 'disconnected'],
    [link?.state === 'reconnecting', 'reconnecting'],
    [exposed !== null, 'exposed'],
    [demo, 'demo'],
    [link?.state === 'attached', 'attached'],
    [serving !== null, 'serving'],
  ];
  const [first, ...rest] = candidates.filter(([holds]) => holds).map(([, state]) => state);
  return first === undefined ? ['local'] : [first, ...rest];
}
