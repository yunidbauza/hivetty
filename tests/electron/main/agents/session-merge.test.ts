// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { sessionMergeConsent, type SessionMergeDeps } from '../../../../electron/main/agents/session-merge';
import { OVERMIND, type LedgerEntry, type LedgerPostRequest, type LedgerResult } from '../../../../electron/shared/ledger-contract';
import type { PrMergeRequest } from '../../../../electron/shared/github-contract';

const SESSION = 'sess-07';
const request: PrMergeRequest = { repo: 'behiques/hivetty', number: 42, sha: 'abc1234', subject: 'Fix (#42)', body: '' };

function harness(autoMerge = false, appendOk = true) {
  const log: LedgerEntry[] = [];
  let next = 1;
  const append = (entry: LedgerPostRequest): LedgerResult => {
    if (!appendOk) return { ok: false, status: 503, reason: 'ledger is closed' };
    const id = `e${String(next++)}`;
    log.push({ ...entry, id, ref: id.toUpperCase(), ts: 0 });
    return { ok: true, id, ref: id.toUpperCase() };
  };
  const deps: SessionMergeDeps = {
    autoMergeOn: () => Promise.resolve(autoMerge),
    entries: () => log,
    append,
  };
  const answer = (thread: string, body: string, from = OVERMIND) => {
    append({ from, to: SESSION, kind: 'answer', thread, body });
  };
  return { deps, log, answer };
}

const cards = (log: readonly LedgerEntry[]) => log.filter((entry) => entry.kind === 'ask');

describe('sessionMergeConsent', () => {
  it('merges at once on a project with auto-merge on, and raises no card', async () => {
    const { deps, log } = harness(true);
    await expect(sessionMergeConsent(deps, SESSION, request)).resolves.toEqual({ merge: true });
    expect(log).toEqual([]);
  });

  it('raises one permission card naming the PR, and refuses until it is answered', async () => {
    const { deps, log } = harness();
    const verdict = await sessionMergeConsent(deps, SESSION, request);
    expect(verdict.merge).toBe(false);
    expect(verdict).toMatchObject({ reason: expect.stringContaining('E1') });
    expect(cards(log)).toEqual([
      expect.objectContaining({
        from: SESSION,
        to: OVERMIND,
        meta: { kind: 'permission', tool: 'mcp__hive__pr_merge', input: { repo: 'behiques/hivetty', number: 42 } },
      }),
    ]);
  });

  it('a second call while the card is open raises no second card', async () => {
    const { deps, log } = harness();
    await sessionMergeConsent(deps, SESSION, request);
    const again = await sessionMergeConsent(deps, SESSION, request);
    expect(again).toMatchObject({ merge: false, reason: expect.stringContaining('E1') });
    expect(cards(log)).toHaveLength(1);
  });

  it.each(['allow-once', 'allow-project'])('an overmind answer of %s merges that PR once', async (body) => {
    const { deps, log, answer } = harness();
    await sessionMergeConsent(deps, SESSION, request);
    answer('e1', body);
    await expect(sessionMergeConsent(deps, SESSION, request)).resolves.toEqual({ merge: true });
    expect(log.at(-1)).toMatchObject({ from: OVERMIND, kind: 'event', thread: 'e1', meta: { granted: 'e1' } });
    // Spent: the next merge of the same PR asks again.
    await expect(sessionMergeConsent(deps, SESSION, request)).resolves.toMatchObject({ merge: false });
    expect(cards(log)).toHaveLength(2);
  });

  it('a deny grants nothing, and a later call asks again', async () => {
    const { deps, log, answer } = harness();
    await sessionMergeConsent(deps, SESSION, request);
    answer('e1', 'deny');
    await expect(sessionMergeConsent(deps, SESSION, request)).resolves.toMatchObject({ merge: false });
    expect(cards(log)).toHaveLength(2);
  });

  it('an answer from anyone but the overmind grants nothing', async () => {
    const { deps, answer } = harness();
    await sessionMergeConsent(deps, SESSION, request);
    answer('e1', 'allow-once', SESSION);
    await expect(sessionMergeConsent(deps, SESSION, request)).resolves.toMatchObject({ merge: false });
  });

  it("a card for another PR, or another session's card, grants nothing", async () => {
    const { deps, answer } = harness();
    await sessionMergeConsent(deps, SESSION, { ...request, number: 41 });
    answer('e1', 'allow-once');
    await sessionMergeConsent(deps, 'sess-08', request);
    answer('e3', 'allow-once');
    await expect(sessionMergeConsent(deps, SESSION, request)).resolves.toMatchObject({ merge: false });
  });

  it('a switch that failed (grantFailed) grants nothing', async () => {
    const { deps, answer } = harness();
    await sessionMergeConsent(deps, SESSION, request);
    answer('e1', 'allow-project');
    deps.append({ from: OVERMIND, to: SESSION, kind: 'event', thread: 'e1', body: 'could not grant', meta: { grantFailed: 'e1' } });
    await expect(sessionMergeConsent(deps, SESSION, request)).resolves.toMatchObject({ merge: false });
  });

  it('says why when the card cannot be written', async () => {
    const { deps } = harness(false, false);
    await expect(sessionMergeConsent(deps, SESSION, request)).resolves.toEqual({
      merge: false,
      reason: expect.stringContaining('ledger is closed'),
    });
  });
});
