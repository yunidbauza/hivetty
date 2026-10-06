import type { Delegate } from '@shared/ledger-derive';

/** Longest agent name the status names outright; a longer one reads `agents`. */
export const DELEGATE_NAME_MAX = 10;

/**
 * The parenthetical of `idle (…)` for a session whose agents are on its work:
 * the one agent by name when it fits, `agents` when it does not, a count for
 * two or more. `null` when no agent is working for it.
 */
export function delegationWord(delegates: readonly Delegate[]): string | null {
  const [first] = delegates;
  if (first === undefined) return null;
  if (delegates.length > 1) return `${String(delegates.length)} agents`;
  return first.agent.length <= DELEGATE_NAME_MAX ? first.agent : 'agents';
}

/** Every agent by name, with the ones each brought in: `Waiting on shipper (with acr, fixer)`. */
export function delegationTitle(delegates: readonly Delegate[]): string | null {
  if (delegates.length === 0) return null;
  const named = delegates.map(({ agent, helpers }) =>
    helpers.length === 0 ? agent : `${agent} (with ${helpers.join(', ')})`,
  );
  return `Waiting on ${named.join(', ')}`;
}
