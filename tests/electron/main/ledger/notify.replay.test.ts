// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { LEDGER_ASK_TTL_MS, OVERMIND } from '../../../../electron/shared/ledger-contract';
import { createLedger, type Ledger } from '../../../../electron/main/ledger/index';
import { createLedgerNotifier, replayOpenAsks } from '../../../../electron/main/ledger/notify';

/**
 * The boot replay (HIVE-364).
 *
 * Its own file because it needs a real ledger on disk, which `notify.test.ts`
 * deliberately does without. The ledger is written by one `createLedger` and
 * read back by a second over the same folder: that second one is the app
 * after a restart, and the notifier is built only after it has loaded.
 */
const AT = new Date(2026, 9, 28, 20, 3, 41).getTime();

describe('replayOpenAsks', () => {
  let dir: string;
  let clock: number;

  const open = (): Ledger => createLedger({ dir, now: () => clock, knowsParty: () => true });

  /** A notifier over a `raise` that dedups on id, as the hub's does. */
  const boot = (ledger: Ledger) => {
    const raised = new Map<string, { kind: string; id: string; title: string }>();
    const notify = createLedgerNotifier({
      raise: (input) => {
        if (raised.has(input.id)) return null;
        raised.set(input.id, input);
        return input;
      },
      markRead: () => {},
      dismiss: () => {},
      isAgent: (id) => id !== OVERMIND && !id.startsWith('sess-'),
      ask: (id) => ledger.read({}).entries.find((entry) => entry.id === id && entry.kind === 'ask'),
    });
    return { raised, replay: () => replayOpenAsks(ledger.read({}), notify) };
  };

  const ask = (ledger: Ledger, body: string, extra: object = {}): string => {
    const result = ledger.append({ from: 'shipper', to: OVERMIND, kind: 'ask', body, ...extra });
    if (!result.ok) throw new Error(result.reason);
    return result.id;
  };

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'hive-replay-'));
    clock = AT;
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('gives an open overmind ask its card back after a restart, same id, title and buttons', () => {
    const id = ask(open(), 'Cut HiveTTY v1.3.0?\nmain is green.', { meta: { options: ['yes', 'no'] } });

    const { raised, replay } = boot(open());
    replay();

    expect([...raised.values()]).toEqual([
      expect.objectContaining({
        kind: 'agent.ask',
        id,
        title: 'Cut HiveTTY v1.3.0?',
        subject: 'shipper',
        action: { type: 'ask', thread: id },
      }),
    ]);
  });

  it('brings a still-open permission ask back as agent.permission', () => {
    const id = ask(open(), '', { meta: { kind: 'permission', tool: 'Bash', input: { command: 'ls' } } });

    const { raised, replay } = boot(open());
    replay();

    expect(raised.get(id)?.kind).toBe('agent.permission');
  });

  it('leaves answered, done, failed and expired asks closed', () => {
    const before = open();
    const answered = ask(before, 'answered?');
    const done = ask(before, 'done?');
    const failed = ask(before, 'failed?');
    before.answer({ thread: answered, body: 'yes' }, OVERMIND);
    before.append({ from: 'shipper', kind: 'done', thread: done, body: 'never mind' });
    before.append({ from: 'shipper', kind: 'failed', thread: failed, body: 'gave up' });
    clock = AT - LEDGER_ASK_TTL_MS - 1000;
    ask(before, 'expired?');
    clock = AT;

    const { raised, replay } = boot(open());
    replay();

    expect(raised.size).toBe(0);
  });

  it('brings back the card of an ask redirected from a session that ended, keyed on the ask', () => {
    const before = open();
    const result = before.append({ from: 'builder', to: 'sess-7', kind: 'ask', body: 'which colour?' });
    if (!result.ok) throw new Error(result.reason);
    const id = result.id;
    before.append({
      from: OVERMIND,
      to: OVERMIND,
      kind: 'event',
      thread: id,
      body: 'sess-7 ended with this question open; it is yours now',
      meta: { redirected: id, redirectedFrom: 'sess-7' },
    });

    const { raised, replay } = boot(open());
    replay();

    expect([...raised.keys()]).toEqual([id]);
    expect(raised.get(id)).toMatchObject({ kind: 'agent.ask', title: 'which colour?' });
  });

  it('leaves an open ask to a live session alone', () => {
    const before = open();
    before.append({ from: 'builder', to: 'sess-7', kind: 'ask', body: 'which colour?' });

    const { raised, replay } = boot(open());
    replay();

    expect(raised.size).toBe(0);
  });

  it('raises nothing new on a second replay', () => {
    ask(open(), 'once?');

    const { raised, replay } = boot(open());
    replay();
    replay();

    expect(raised.size).toBe(1);
  });
});
