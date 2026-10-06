// @vitest-environment node
import { describe, expect, it } from 'vitest';

import {
  NOTIFICATION_CAP,
  type HiveNotification,
  type NotificationKind,
} from '../../../electron/shared/notification-contract';
import {
  laneOf,
  trimNotifications,
  waitsOnYou,
} from '../../../electron/shared/notification-lanes';

const open = () => true;

let seq = 0;
/** Newest first, as the buffer holds them: build oldest first, then reverse. */
const row = (kind: NotificationKind, over: Partial<HiveNotification> = {}): HiveNotification => {
  seq += 1;
  return {
    id: `${kind}-${seq}`,
    kind,
    title: kind,
    body: '',
    createdAt: seq,
    unread: true,
    action: kind === 'agent.ask' || kind === 'agent.permission'
      ? { type: 'ask', thread: `t${seq}` }
      : { type: 'none' },
    ...over,
  };
};
const newestFirst = (rows: HiveNotification[]) => [...rows].reverse();

describe('laneOf', () => {
  it('reads the lane off the registry', () => {
    expect(laneOf('agent.ask')).toBe('summons');
    expect(laneOf('session.idle')).toBe('summons');
    expect(laneOf('pr.merged')).toBe('echo');
  });
});

describe('waitsOnYou', () => {
  it('is true for an open ask and a session waiting on you, false for news', () => {
    expect(waitsOnYou(row('agent.ask'), open)).toBe(true);
    expect(waitsOnYou(row('session.blocked'), open)).toBe(true);
    // It bounces the dock, so it waits on you (6 Oct 2026).
    expect(waitsOnYou(row('session.idle'), open)).toBe(true);
    expect(waitsOnYou(row('session.input_needed'), open)).toBe(true);
    expect(waitsOnYou(row('pr.merged'), open)).toBe(false);
  });

  it('is false for an ask whose thread has closed, read or not', () => {
    const ask = row('agent.permission', { unread: false });
    expect(waitsOnYou(ask, () => false)).toBe(false);
  });
});

describe('trimNotifications', () => {
  it('keeps six open asks under sixty echoes, trimming echoes oldest first', () => {
    const asks = Array.from({ length: 6 }, () => row('agent.ask'));
    const echoes = Array.from({ length: 60 }, () => row('pr.merged'));
    const trimmed = trimNotifications(newestFirst([...asks, ...echoes]), open);

    expect(trimmed.filter((r) => r.kind === 'agent.ask')).toHaveLength(6);
    expect(trimmed.filter((r) => r.kind === 'pr.merged')).toHaveLength(NOTIFICATION_CAP);
    // The ten oldest echoes went; the newest fifty stayed, in order.
    expect(trimmed.filter((r) => r.kind === 'pr.merged').map((r) => r.id)).toEqual(
      newestFirst(echoes.slice(10)).map((r) => r.id),
    );
  });

  it('never evicts a session that is yours again: the session sweeps bound it', () => {
    const idle = Array.from({ length: 60 }, () => row('session.idle'));
    const echoes = Array.from({ length: 10 }, () => row('pr.merged'));
    const trimmed = trimNotifications(newestFirst([...idle, ...echoes]), open);

    expect(trimmed.filter((r) => r.kind === 'session.idle')).toHaveLength(60);
    expect(trimmed.filter((r) => r.kind === 'pr.merged')).toHaveLength(10);
  });

  it('keeps more than fifty Summons, all of them', () => {
    const blocked = Array.from({ length: 60 }, () => row('session.blocked'));
    expect(trimNotifications(newestFirst(blocked), open)).toHaveLength(60);
  });

  it('evicts an answered ask with the echoes', () => {
    const answered = row('agent.ask', { unread: false });
    const echoes = Array.from({ length: NOTIFICATION_CAP }, () => row('pr.merged'));
    const closed = (thread: string) => !(answered.action.type === 'ask' && thread === answered.action.thread);
    const trimmed = trimNotifications(newestFirst([answered, ...echoes]), closed);

    expect(trimmed.map((r) => r.id)).not.toContain(answered.id);
    expect(trimmed).toHaveLength(NOTIFICATION_CAP);
  });

  it('returns the rows unchanged under the cap', () => {
    const rows = newestFirst([row('pr.merged'), row('agent.ask')]);
    expect(trimNotifications(rows, open)).toEqual(rows);
  });
});
