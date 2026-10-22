import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { SESSION_PLUGIN_NAME } from '@shared/config-contract';

import { skillsUnder } from '../../skills/available';
import type { HarnessInstalled } from '../port';

/**
 * Claude Code's own configuration directory — **not** HiveTTY's.
 *
 * A third root, and the first one here that belongs to another application.
 * It is read, never written: an agent is a `claude -p` process, so the skills
 * and plugins the user installed for themselves are skills that process can
 * already reach, and `available.ts` needs to know their names to stop refusing
 * them.
 *
 * `CLAUDE_CONFIG_DIR` is Claude Code's own override and is honoured for the
 * reason `configPath()` honours `HIVE_CONFIG_PATH`: a spec that does not set it
 * reads the developer's real `~/.claude`, and its expectations then depend on
 * which plugins happened to be installed that week.
 *
 * `agents-settings.spec.ts` sets it per launch rather than the shared fixture
 * doing so for everyone: other specs in that project spawn a **real** `claude`,
 * and relocating that binary's own configuration directory is not something to
 * do to them in passing.
 */
const claudeRoot = (): string =>
  process.env['CLAUDE_CONFIG_DIR'] ?? join(homedir(), '.claude');

/** The user's own skills, which HiveTTY lists but does not manage. */
const userSkillsRoot = (): string => join(claudeRoot(), 'skills');

/**
 * Which plugins are installed, and where each one's active version lives.
 *
 * The registry rather than a glob over the cache: several versions of one
 * plugin can sit on disk at once, and only this file says which is current.
 */
const installedPluginsFile = (): string =>
  join(claudeRoot(), 'plugins', 'installed_plugins.json');

/**
 * One installed plugin's `installPath`, keyed by the plugin's own name.
 *
 * The file is Claude Code's, so this reads it defensively and shape-checks
 * every hop: an unexpected layout must cost the user the *plugin* names, not
 * the ability to save an agent. The key is `<plugin>@<marketplace>` and the
 * value an array of installs — several cached versions of one plugin can sit on
 * disk at once (this machine has three of `workstream`), and this file is what
 * says which one is actually installed, which is why the versioned directories
 * are not globbed directly.
 *
 * A **user**-scoped install wins over the rest rather than the array's first
 * entry winning. That array is not ordered by relevance: `plugin-dev` on this
 * machine lists a `project`-scoped install belonging to an unrelated repository
 * *before* the user-scoped one, and it is the user-scoped root an agent's
 * process would actually load. Falling back to the first usable entry keeps a
 * plugin that is only ever project-scoped from disappearing.
 */
function installPaths(json: string): Map<string, string> {
  const paths = new Map<string, string>();
  let parsed: unknown;

  try {
    parsed = JSON.parse(json);
  } catch {
    return paths;
  }

  const plugins = (parsed as { plugins?: unknown } | null)?.plugins;

  if (typeof plugins !== 'object' || plugins === null) return paths;

  for (const [key, installs] of Object.entries(plugins)) {
    if (!Array.isArray(installs)) continue;

    const usable = installs.filter(
      (install: unknown): install is { installPath: string; scope?: unknown } =>
        typeof install === 'object' &&
        install !== null &&
        typeof (install as { installPath?: unknown }).installPath === 'string',
    );
    const first =
      usable.find((install) => install.scope === 'user') ?? usable[0];

    if (first === undefined) continue;

    // `jira-writer@claude-kit` → `jira-writer`. The marketplace
    // is not part of how a skill is addressed.
    const name = key.split('@')[0] ?? '';

    if (name !== '') paths.set(name, first.installPath);
  }

  return paths;
}

/**
 * Skill names from installed plugins, namespaced `plugin:skill`.
 *
 * The namespace is Claude Code's own addressing, not an invention here: two
 * plugins may each ship a `review` skill, and the qualified form is how the
 * binary tells them apart — so it is also the form a definition has to spell.
 */
async function pluginSkills(file: string): Promise<string[]> {
  let json: string;

  try {
    json = await readFile(file, 'utf8');
  } catch {
    return [];
  }

  const names: string[] = [];

  for (const [plugin, root] of installPaths(json)) {
    for (const skill of await skillsUnder(join(root, 'skills'))) {
      names.push(`${plugin}:${skill}`);
    }
  }

  return names;
}

/** Every key in the registry, `name@marketplace` as installed (HIVE-176). */
function registryKeys(json: string): string[] {
  try {
    const plugins = (JSON.parse(json) as { plugins?: unknown } | null)?.plugins;
    return typeof plugins === 'object' && plugins !== null ? Object.keys(plugins) : [];
  } catch {
    return [];
  }
}

/**
 * Installed plugin names a switch can act on, sorted (HIVE-176): the part
 * before `@` of the same keys {@link sessionPluginOverrides} reads, so a
 * listed switch always has a key behind it. A name outside the guard's
 * alphabet, or `hive`, is left out: it could never be switched off.
 */
export function installedPluginNames(json: string): string[] {
  const names = registryKeys(json)
    .map((key) => key.split('@')[0] ?? '')
    .filter((name) => SESSION_PLUGIN_NAME.test(name) && name !== 'hive');
  return [...new Set(names)].sort();
}

/**
 * `enabledPlugins` overrides that keep the named plugins out of a Hive
 * session (HIVE-176): every registry key whose name is listed, set `false`.
 *
 * Keyed by the exact `name@marketplace`, because that is the only key Claude
 * Code honours, and measured against a real `claude`: a `--settings` file
 * carrying these drops the plugins for that run and leaves the rest loaded.
 */
export function sessionPluginOverrides(
  json: string,
  disabled: readonly string[],
): Record<string, false> {
  const off = new Set(disabled);
  const overrides: Record<string, false> = {};
  for (const key of registryKeys(json)) {
    if (off.has(key.split('@')[0] ?? '')) overrides[key] = false;
  }
  return overrides;
}

/** {@link sessionPluginOverrides} from the registry file; `{}` when there is none. */
export async function readSessionPluginOverrides(
  file: string,
  disabled: readonly string[],
): Promise<Record<string, false>> {
  try {
    return sessionPluginOverrides(await readFile(file, 'utf8'), disabled);
  } catch {
    return {};
  }
}

/** {@link installedPluginNames} from the registry file; `[]` when there is none. */
export async function readInstalledPluginNames(file: string): Promise<string[]> {
  try {
    return installedPluginNames(await readFile(file, 'utf8'));
  } catch {
    return [];
  }
}

/** The user's own skills and every installed plugin's, `plugin:skill`; unsorted, the caller merges (HIVE-345). */
export async function readClaudeSkillNames(user: string, installedPlugins: string): Promise<string[]> {
  const [mine, plugins] = await Promise.all([skillsUnder(user), pluginSkills(installedPlugins)]);
  return [...mine, ...plugins];
}

/** The adapter's `installed`. Paths are resolved per call, so `CLAUDE_CONFIG_DIR` is read when asked. */
export const createClaudeInstalled = (): HarnessInstalled => ({
  skillNames: () => readClaudeSkillNames(userSkillsRoot(), installedPluginsFile()),
  pluginNames: () => readInstalledPluginNames(installedPluginsFile()),
  sessionOverrides: (disabled) => readSessionPluginOverrides(installedPluginsFile(), disabled),
});
