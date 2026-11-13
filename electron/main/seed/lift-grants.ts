import { parseList, patchFrontmatter, readFrontmatter } from '@shared/agent-contract';

import { hashPart } from './merge';

/**
 * Scoped rules kept even beside a bare tool (HIVE-409): a rule naming the merge stays its own entry, so the
 * grant is still there by name if the fence ever stops letting a bare `Bash` cover a merge.
 */
const NAMES_THE_MERGE = /^(?:Bash\(gh pr merge |mcp__hive__pr_merge\()/;

/** What `permissions.ts` refuses to write into a list: a forged line, a list closed early, a quote the reread strips. */
const UNWRITABLE = /[\n\r[\]#]|^['"\s]|['"\s]$/;

/**
 * How much of `mine` is the shipped list the base recorded (HIVE-418): the longest prefix whose `tools:`
 * line hashes to the base's `tools` part. A card always appended to the end of the list, so what follows
 * that prefix is what cards granted. `undefined` when there is no base or no prefix matches.
 */
const shippedPrefix = (mine: readonly string[], baseTools: string | undefined): number | undefined => {
  if (baseTools === undefined) return undefined;
  for (let k = mine.length; k >= 0; k--) {
    if (hashPart(`tools: [${mine.slice(0, k).join(', ')}]`) === baseTools) return k;
  }
  return undefined;
};

/**
 * Lift a card's grants out of `tools:` into `grants:`, once (HIVE-409).
 *
 * Before `grants:` existed a card wrote into `tools:`, which made `tools:` the person's, so every later
 * shipped change to it was held back. The ledger only keeps two days, so which entries a card wrote cannot
 * be read back. This keeps every entry beyond the shipped list as a grant and hands `tools:` back to the
 * seed. A scoped `X(…)` is dropped when a bare `X` is held anyway, unless it names the merge. A `tools:`
 * missing a shipped entry is lifted too: a release that adds a tool to a shipped agent leaves every installed
 * copy missing it. The cost is that a shipped tool someone removed by hand comes back, once. What a wake
 * allows can only grow. Writing `grants:` is what makes this run once.
 *
 * HIVE-418: an older shipped list is not a card's grant. The whole list matching the base is that list
 * untouched, and `mergeParts` updates it as it updates any part; a shorter match leaves only what followed
 * it to lift. No match (no base, a hand-edited list) lifts everything beyond the shipped list.
 *
 * Its own file, not `merge.ts`: that one runs under plain Node in `scripts/shipped-history.mjs` and takes
 * no path aliases. Pure; returns `current` unchanged when there is nothing to do, or nothing safe to do.
 */
export function liftGrants(current: string, shipped: string, baseTools?: string): string {
  const mineFields = readFrontmatter(current)?.fields;
  const shipFields = readFrontmatter(shipped)?.fields;
  if (mineFields === undefined || shipFields === undefined || mineFields.has('grants')) return current;

  const listOf = (fields: typeof mineFields, key: string): string[] | null => {
    const field = fields.get(key);
    return field === undefined ? [] : parseList(field.value);
  };
  const mine = listOf(mineFields, 'tools');
  const ship = listOf(shipFields, 'tools');
  if (mine === null || ship === null) return current;
  if (mine.length === ship.length && mine.every((rule, i) => rule === ship[i])) return current;

  const prefix = shippedPrefix(mine, baseTools);
  if (prefix === mine.length) return current;
  const granted = prefix === undefined ? mine : mine.slice(prefix);

  const bare = new Set([...ship, ...granted].filter((rule) => !rule.includes('(')));
  const extra = granted.filter((rule) => {
    if (ship.includes(rule)) return false;
    const open = rule.indexOf('(');
    return open === -1 || NAMES_THE_MERGE.test(rule) || !bare.has(rule.slice(0, open));
  });

  // The same shape check the card's write makes; a file that fails it keeps its tools: and is tried again next seed.
  if ([...ship, ...extra].some((rule) => UNWRITABLE.test(rule))) return current;

  const withTools = patchFrontmatter(current, 'tools', `[${ship.join(', ')}]`);
  return patchFrontmatter(withTools, 'grants', `[${extra.join(', ')}]`);
}
