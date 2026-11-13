import type { PrMergeRequest } from '@shared/github-contract';
import { OVERMIND, type LedgerEntry, type LedgerPostRequest, type LedgerResult } from '@shared/ledger-contract';
import { closedAskThreads } from '@shared/ledger-derive';
import { ALLOW_PROJECT, PR_MERGE_TOOL_NAME, mergeTarget } from '@shared/permission-rules';

import { isPermissionAsk } from './permissions';

/**
 * Consent for a session's `mcp__hive__pr_merge`.
 *
 * An agent's merge is decided by the fence before the call reaches main (`approve`, the shipper's
 * auto-merge grant). A pty session has no fence: its settings used to make Claude Code's own prompt ask
 * on every call, auto-merge or not, and that prompt could never be told "always". Main decides here:
 *
 * - The project holding the repository has auto-merge on: that is the person's consent, so it merges.
 * - The session holds an answered card for this exact PR (`allow-once`, or `allow-project`, which also
 *   turned auto-merge on through `permissions.ts`): it merges once and the grant is spent.
 * - Otherwise it raises one permission card for the PR, the same card an agent's merge raises, and
 *   refuses until it is answered. A second call while the card is open raises no second card.
 */

export interface SessionMergeDeps {
  /** Whether the configured project whose repository is `repo` has auto-merge on. */
  autoMergeOn: (repo: string) => Promise<boolean>;
  entries: () => readonly LedgerEntry[];
  append: (request: LedgerPostRequest) => LedgerResult;
}

export type SessionMergeVerdict = { merge: true } | { merge: false; reason: string };

const GRANTS = new Set(['allow-once', ALLOW_PROJECT]);

const waiting = (card: string, where: string): string =>
  `waiting on the person: permission card ${card} asks to merge ${where}. ` +
  'Call pr_merge again once its answer arrives; do not merge another way.';

export async function sessionMergeConsent(
  deps: SessionMergeDeps,
  session: string,
  request: PrMergeRequest,
): Promise<SessionMergeVerdict> {
  if (await deps.autoMergeOn(request.repo)) return { merge: true };

  const where = `${request.repo}#${String(request.number)}`;
  const log = deps.entries();
  const closed = closedAskThreads(log);

  for (const ask of log) {
    if (!isPermissionAsk(ask) || ask.from !== session || ask.meta?.['tool'] !== PR_MERGE_TOOL_NAME) continue;
    const target = mergeTarget(ask.meta);
    if (target?.repo !== request.repo || target.number !== request.number) continue;

    const answer = log.find((entry) => entry.kind === 'answer' && entry.thread === ask.id);
    if (answer === undefined) {
      if (closed.has(ask.id)) continue; // expired unanswered: ask again
      return { merge: false, reason: waiting(ask.ref ?? ask.id, where) };
    }
    // Only the person grants, through the overmind; `permissions.ts` refuses any other author out loud.
    if (answer.from !== OVERMIND || !GRANTS.has(answer.body)) continue;
    const spent = log.some(
      (entry) =>
        entry.kind === 'event' &&
        entry.from === OVERMIND &&
        (entry.meta?.['granted'] === ask.id || entry.meta?.['grantFailed'] === ask.id),
    );
    if (spent) continue;

    // Retired as it is handed out, as an agent's one-shot is: "once" is the only promise it makes.
    deps.append({
      from: OVERMIND,
      to: session,
      kind: 'event',
      thread: ask.id,
      body: `granted ${PR_MERGE_TOOL_NAME} on ${where} to ${session} once`,
      meta: { granted: ask.id },
    });
    return { merge: true };
  }

  const written = deps.append({
    from: session,
    to: OVERMIND,
    kind: 'ask',
    // Empty: `Ledger.append` composes the body, the ladder and the options from the tool and input.
    body: '',
    meta: { kind: 'permission', tool: PR_MERGE_TOOL_NAME, input: { repo: request.repo, number: request.number } },
  });
  if (!written.ok) return { merge: false, reason: `could not ask the person to merge ${where}: ${written.reason}` };
  return { merge: false, reason: waiting(written.ref ?? written.id, where) };
}
