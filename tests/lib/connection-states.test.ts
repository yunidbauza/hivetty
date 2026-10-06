import { describe, expect, it } from 'vitest';

import type { RemoteLinkStatus } from '@shared/ipc-contract';

import { connectionStates, type ConnectionInput } from '@lib/connection-states';

const link = (state: RemoteLinkStatus['state']): RemoteLinkStatus => ({
  state,
  serverName: 'mac-mini',
  attempt: 0,
  nextAttemptAt: null,
  reason: null,
  epoch: 0,
  lost: 0,
});

const none: ConnectionInput = { demo: false, exposed: null, serving: null, link: null };

describe('connectionStates (HIVE-196)', () => {
  it('is local when nothing else holds', () => {
    expect(connectionStates(none)).toEqual(['local']);
  });

  it.each([
    [{ serving: '0.0.0.0:7420' }, 'serving'],
    [{ link: link('attached') }, 'attached'],
    [{ link: link('reconnecting') }, 'reconnecting'],
    [{ link: link('disconnected') }, 'disconnected'],
    [{ exposed: '0.0.0.0' }, 'exposed'],
    [{ demo: true }, 'demo'],
  ] as const)('%o alone is %s', (over, state) => {
    expect(connectionStates({ ...none, ...over })).toEqual([state]);
  });

  it('orders overlaps disconnected, reconnecting, exposed, demo, attached, serving', () => {
    expect(connectionStates({ ...none, exposed: '0.0.0.0', link: link('attached') })).toEqual(['exposed', 'attached']);
    expect(connectionStates({ ...none, exposed: '0.0.0.0', link: link('reconnecting') })).toEqual(['reconnecting', 'exposed']);
    expect(connectionStates({ ...none, exposed: '0.0.0.0', serving: '0.0.0.0:7420' })).toEqual(['exposed', 'serving']);
    expect(connectionStates({ ...none, demo: true, exposed: '0.0.0.0', link: link('disconnected') })).toEqual([
      'disconnected',
      'exposed',
      'demo',
    ]);
  });
});
