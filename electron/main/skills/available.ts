import { access, readdir } from 'node:fs/promises';
import { join } from 'node:path';

import { isSkillFolder } from './read';

/**
 * Every skill name an agent definition may name.
 *
 * ## Why this is wider than `~/.hivetty/skills`
 *
 * `parseAgent` used to validate `skills:` against the Hive's own folder alone,
 * and that was wrong in both directions. Too narrow, because an agent runs as a
 * `claude -p` process on this machine: it loads the user's `~/.claude/skills`
 * and their installed plugins whether or not the definition names them, so
 * refusing `jira-writer:jira-writer` refused a skill the agent could reach
 * regardless. And wrong in practice, because `~/.hivetty/skills` is empty on a
 * fresh install — which made the field refuse *every* name a person could type.
 *
 * So the field is not a sandbox and this is not a permission list. It is the
 * set of names that exist, and what it buys is a typo caught in the editor
 * rather than a skill that silently is not there at run time. A true sandbox
 * would mean `--restricted`, which would cut off exactly the external skills
 * this widening exists to allow; `docs/agents-and-ledger.md` records that trade
 * rather than making it silently.
 *
 * ## Why the roots are arguments
 *
 * The harness's own roots (the user's skills, its installed plugins) are the
 * adapter's (`harness/claude-code/installed.ts`, HIVE-345), and HiveTTY's own
 * root is an argument, so a unit test reads temp directories rather than the
 * developer's machine. One that read `~/.claude` would assert on whatever
 * happened to be installed that week —
 * green here, red on CI, and untestable for the case that matters most (a
 * machine with nothing installed). `createAgentsRuntime` is the only caller
 * that knows HiveTTY's real root, exactly as it is already the only caller
 * that knows `agentsRoot()`.
 */

/**
 * Folders directly under `root` that hold a `SKILL.md`.
 *
 * A missing or unreadable root is an empty list, not a throw. All three roots
 * are optional in practice — no Hive skills, no personal skills, no plugins —
 * and an agent must stay editable on a machine that has none of them. Failing
 * closed here would make the editor refuse every skill name on precisely the
 * machines where the user has the fewest ways to work out why.
 *
 * Two details that look incidental and are not:
 *
 * `isSkillFolder` rather than `entry.isDirectory()`. `readdir` reports `lstat`
 * semantics, so a **symlinked** skill folder answers `false` — and three of the
 * five entries under this machine's own `~/.claude/skills` are symlinks into a
 * dotfile repo, which is where personal skills usually live. Reading them as
 * "not a skill" would refuse `pretty-mermaid` with "no skill called
 * pretty-mermaid", the exact false refusal this module exists to end.
 *
 * `access` rather than `readFile`. This runs once per `list()`, which re-runs
 * on every watcher event, and it now walks every installed plugin as well as
 * two skill folders — a hundred-odd files on this machine. Reading each one
 * into memory to prove it exists and then discarding it is a cost paid on every
 * keystroke-triggered save for information `access` already gives.
 */
export async function skillsUnder(root: string): Promise<string[]> {
  let entries;

  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }

  const names: string[] = [];

  for (const entry of entries) {
    if (!(await isSkillFolder(root, entry))) continue;

    try {
      // The literal, as `read.ts`, `index.ts` and `plugin.ts` all spell it.
      await access(join(root, entry.name, 'SKILL.md'));
      names.push(entry.name);
    } catch {
      // A directory with no SKILL.md is not a skill — it is somebody's notes,
      // the same judgement `registry.ts` makes about a folder with no AGENT.md.
    }
  }

  return names;
}

/**
 * The names an agent may reference, and the subset HiveTTY itself owns.
 *
 * Two sets rather than one, because `parseAgent` asks two different questions
 * of them. `all` answers *may this definition name this skill*, and has to be
 * as wide as the machine. `hive` answers *may an agent take this name*, and
 * must not be — that rule exists because an agent and a skill HiveTTY manages
 * share one namespace, and widening it silently reserved every name in the
 * user's personal skills folder: with `~/.claude/skills/graphify` present, no
 * agent could be called `graphify`, refused on account of a folder HiveTTY
 * neither manages nor mentions.
 */
interface AvailableSkills {
  all: string[];
  hive: string[];
}

/**
 * Every name, deduplicated and sorted so the set has one representation. `harness` is the
 * adapter's `installed.skillNames` (HIVE-345).
 */
export async function readAvailableSkillNames(
  hive: string,
  harness: () => Promise<string[]>,
): Promise<AvailableSkills> {
  const [own, theirs] = await Promise.all([skillsUnder(hive), harness()]);

  return {
    all: [...new Set([...own, ...theirs])].sort(),
    hive: [...own].sort(),
  };
}
