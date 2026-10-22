// @vitest-environment node
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  installedPluginNames,
  readInstalledPluginNames,
  readSessionPluginOverrides,
  sessionPluginOverrides,
} from '../../../../../electron/main/harness/claude-code/installed';

/** Moved from `skills/available.test.ts` with the parsing it covers (HIVE-345). */
let root: string;

const at = (...parts: string[]) => join(root, ...parts);

const registry = async (plugins: Record<string, string>) => {
  const file = at('claude', 'plugins', 'installed_plugins.json');

  await mkdir(join(root, 'claude', 'plugins'), { recursive: true });
  await writeFile(
    file,
    JSON.stringify({
      version: 2,
      plugins: Object.fromEntries(
        Object.entries(plugins).map(([key, path]) => [
          key,
          [{ scope: 'user', installPath: path, version: '1.0.0' }],
        ]),
      ),
    }),
    'utf8',
  );

  return file;
};

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'hive-installed-'));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('the plugins a Hive session switches off (HIVE-176)', () => {
  const REGISTRY = JSON.stringify({
    version: 2,
    plugins: {
      'workstream@claude-kit': [{ scope: 'user', installPath: '/p/w' }],
      'superpowers@claude-plugins-official': [{ scope: 'user', installPath: '/p/s' }],
      'jira-writer@claude-kit': [{ scope: 'user', installPath: '/p/j' }],
      'workstream-extras@acme': [{ scope: 'user', installPath: '/p/x' }],
    },
  });

  it('keys the overrides by the exact name@marketplace, and only for listed names', () => {
    expect(sessionPluginOverrides(REGISTRY, ['workstream', 'superpowers'])).toEqual({
      'workstream@claude-kit': false,
      'superpowers@claude-plugins-official': false,
    });
    expect(sessionPluginOverrides(REGISTRY, [])).toEqual({});
    expect(sessionPluginOverrides('not json', ['workstream'])).toEqual({});
  });

  it('lists installed plugin names a switch can act on, sorted', () => {
    expect(installedPluginNames(REGISTRY)).toEqual([
      'jira-writer',
      'superpowers',
      'workstream',
      'workstream-extras',
    ]);
    // The app's own name, and one the guard would refuse, are never offered.
    const odd = JSON.stringify({ plugins: { 'hive@local': [], 'bad name@x': [], 'ok@x': [] } });
    expect(installedPluginNames(odd)).toEqual(['ok']);
  });

  it('reads both from the registry file, and answers empty when there is none', async () => {
    await registry({ 'workstream@claude-kit': at('w'), 'ponytail@ponytail': at('p') });
    const file = at('claude', 'plugins', 'installed_plugins.json');

    expect(await readSessionPluginOverrides(file, ['workstream'])).toEqual({ 'workstream@claude-kit': false });
    expect(await readInstalledPluginNames(file)).toEqual(['ponytail', 'workstream']);
    expect(await readSessionPluginOverrides(at('nope.json'), ['workstream'])).toEqual({});
    expect(await readInstalledPluginNames(at('nope.json'))).toEqual([]);
  });
});
