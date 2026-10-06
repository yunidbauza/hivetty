import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import type { LedgerEntry } from '@shared/ledger-contract';

import { AskLeaving, leaveReason } from '@features/inbox/components/ask-leaving';
import { useUiStore } from '@stores/ui-store';
import { seedLedger } from '@tests/support/ledger';
import { notif, resetNotifIds } from '@tests/support/notifications';

const askE: LedgerEntry = { id: 'q1', ts: 1, from: 'builder', to: 'overmind', kind: 'ask', body: 'Run it?' };
const expiredE: LedgerEntry = {
  id: 'e1',
  ts: 2,
  from: 'overmind',
  kind: 'event',
  body: 'ask q1 expired',
  thread: 'q1',
  meta: { expired: 'q1' },
};
const answerE = (meta?: Record<string, unknown>): LedgerEntry => ({
  id: 'a1',
  ts: 2,
  from: 'overmind',
  to: 'builder',
  kind: 'answer',
  body: 'yes',
  thread: 'q1',
  ...(meta ? { meta } : {}),
});
const row = () => notif({ id: 'n1', kind: 'agent.ask', action: { type: 'ask', thread: 'q1' } });

describe('leaveReason (HIVE-218)', () => {
  it('reads expiry, an answer elsewhere, a local answer, and nothing', () => {
    expect(leaveReason([askE, expiredE], 'q1', false)).toEqual({ kind: 'expired' });
    expect(leaveReason([askE, answerE({ answeredOn: 'mac-mini' })], 'q1', false)).toEqual({
      kind: 'answered',
      on: 'mac-mini',
    });
    expect(leaveReason([askE, answerE({ answeredOn: 'mac-mini' })], 'q1', true)).toEqual({ kind: 'answered' });
    expect(leaveReason([askE, answerE()], 'q1', false)).toEqual({ kind: 'answered' });
    expect(leaveReason([askE], 'q1', false)).toBeNull();
  });
});

describe('AskLeaving (HIVE-218)', () => {
  beforeEach(() => {
    resetNotifIds();
    useUiStore.getState().reset();
  });

  it('says expired', () => {
    seedLedger([askE, expiredE]);
    render(<AskLeaving notif={row()} thread="q1" />);
    expect(screen.getByText('expired')).toBeInTheDocument();
  });

  it('names the device another answer came from', () => {
    seedLedger([askE, answerE({ answeredOn: 'mac-mini' })]);
    render(<AskLeaving notif={row()} thread="q1" />);
    expect(screen.getByText('mac-mini')).toBeInTheDocument();
  });

  it('says plain answered when this window answered it', () => {
    seedLedger([askE, answerE({ answeredOn: 'mac-mini' })]);
    useUiStore.getState().markAnsweredHere('q1');
    render(<AskLeaving notif={row()} thread="q1" />);
    expect(screen.getByText('answered')).toBeInTheDocument();
    expect(screen.queryByText('mac-mini')).toBeNull();
  });

  it('draws nothing for a row that left without closing', () => {
    seedLedger([askE]);
    const { container } = render(<AskLeaving notif={row()} thread="q1" />);
    expect(container).toBeEmptyDOMElement();
  });
});
