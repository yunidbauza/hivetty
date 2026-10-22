import { mkdir, mkdtemp, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  containerOrigins,
  writeAliasContainerFiles,
  writeSessionContainerFiles,
  writeSharedContainerFiles,
} from '../../../../../electron/main/container/generated';
import { claudeCodeAdapter } from '../../../../../electron/main/harness/claude-code';
import { readHook } from '../../../../../electron/main/harness/claude-code/hooks';
import { writeMcpConfig } from '../../../../../electron/main/harness/claude-code/mcp-config';
import { writePluginDir } from '../../../../../electron/main/harness/claude-code/plugin';
import { foldTranscriptLines } from '../../../../../electron/main/harness/claude-code/transcript-edits';
import {
  writeAgentSettings,
  writeHookSettings,
} from '../../../../../electron/main/harness/claude-code/settings';
import { readAvailableSkillNames } from '../../../../../electron/main/skills/available';
import { readUserSkills } from '../../../../../electron/main/skills/read';

/**
 * HIVE-235's byte-identity pin. Recorded before the Claude writers moved behind the adapter;
 * the move must leave the snapshot file untouched.
 */

const ORIGIN = 'http://127.0.0.1:60123';
const URL = `${ORIGIN}/hook`;
const METRICS = `${ORIGIN}/metrics`;
const READY = `${ORIGIN}/ready`;
const DONE = `${ORIGIN}/done`;
const ORIGINS = { url: URL, origin: ORIGIN, metricsUrl: METRICS, readyUrl: READY };

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'hive-pin-'));
});

async function walk(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) =>
      entry.isDirectory() ? walk(join(dir, entry.name)) : Promise.resolve([join(dir, entry.name)]),
    ),
  );
  return nested.flat();
}

/** Every file under `root`: octal mode and content, the temp root spelled `<root>`. */
async function tree(): Promise<Record<string, { mode: string; content: string }>> {
  const files = (await walk(root)).sort();
  const out: Record<string, { mode: string; content: string }> = {};
  for (const file of files) {
    out[relative(root, file)] = {
      mode: ((await stat(file)).mode & 0o777).toString(8),
      content: (await readFile(file, 'utf8')).replaceAll(root, '<root>'),
    };
  }
  return out;
}

describe('the files a Claude Code session is launched with', () => {
  for (const transport of ['http', 'command'] as const) {
    for (const metrics of [true, false]) {
      it(`session settings, ${transport}, metrics ${metrics ? 'on' : 'off'}`, async () => {
        await writeHookSettings(root, URL, metrics ? METRICS : undefined, READY, transport, {
          'superpowers@claude-plugins-official': false,
        });
        expect(await tree()).toMatchSnapshot();
      });
    }

    it(`agent settings, ${transport}`, async () => {
      await writeAgentSettings(root, URL, READY, transport);
      expect(await tree()).toMatchSnapshot();
    });
  }

  for (const doneUrl of [DONE, null]) {
    it(`plugin dir, done url ${doneUrl === null ? 'absent' : 'present'}`, async () => {
      const source = await mkdtemp(join(tmpdir(), 'hive-pin-skills-'));
      await mkdir(join(source, 'review'), { recursive: true });
      await writeFile(
        join(source, 'review', 'SKILL.md'),
        '---\nname: review\ndescription: Review the diff\n---\nRead it closely.\n',
        'utf8',
      );
      await writePluginDir(join(root, 'plugin'), '1.2.3', await readUserSkills(source), doneUrl);
      expect(await tree()).toMatchSnapshot();
    });
  }

  it('shared exec-env container set', async () => {
    await writeSharedContainerFiles(root, containerOrigins(ORIGINS, 'host.docker.internal'));
    expect(await tree()).toMatchSnapshot();
  });

  it('shared exec-env container set, metrics off', async () => {
    const { metricsUrl: _metrics, ...withoutMetrics } = ORIGINS;
    await writeSharedContainerFiles(root, containerOrigins(withoutMetrics, 'host.docker.internal'));
    expect(await tree()).toMatchSnapshot();
  });

  it('session rewrite container set', async () => {
    await writeSessionContainerFiles(
      root,
      'sess-07',
      containerOrigins(ORIGINS, 'host.docker.internal'),
      { session: 'sess-07', token: 'tok-abc123' },
      { containerRoot: '/hive/container/sessions/sess-07', run: 'run-1' },
    );
    expect(await tree()).toMatchSnapshot();
  });

  it('alias container set', async () => {
    await writeAliasContainerFiles(root, 'gateway', containerOrigins(ORIGINS, 'gateway'), {
      containerRoot: '/hive/container/aliases/gateway',
    });
    expect(await tree()).toMatchSnapshot();
  });

  it('session mcp config', async () => {
    await writeMcpConfig(join(root, 'hive', 'hive.mcp.json'), {
      execPath: '/Applications/The Hive.app/Contents/MacOS/The Hive',
      scriptPath: '/Applications/The Hive.app/Contents/Resources/app.asar/out/mcp-host/index.js',
    });
    expect(await tree()).toMatchSnapshot();
  });
});

it('reads hooks and wraps context the Claude way (HIVE-236)', () => {
  expect(claudeCodeAdapter.readHook).toBe(readHook);
  expect(claudeCodeAdapter.contextReply('ctx')).toEqual({
    hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: 'ctx' },
  });
});

describe('claudeCodeAdapter (HIVE-238)', () => {
  it('folds transcript edits', () => {
    expect(claudeCodeAdapter.foldEdits).toBe(foldTranscriptLines);
  });
});

/**
 * HIVE-345's pin: the three things the app reads out of `~/.claude`, for one fixed tree. The
 * literals were recorded against the readers before they moved behind `installed`.
 */
describe('what is installed for Claude Code (HIVE-345)', () => {
  const skill = async (dir: string) => {
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'SKILL.md'), '---\nname: x\n---\n', 'utf8');
  };

  beforeEach(async () => {
    const claude = join(root, 'claude');
    vi.stubEnv('CLAUDE_CONFIG_DIR', claude);
    await skill(join(claude, 'skills', 'mine'));
    await mkdir(join(claude, 'skills', 'notes'), { recursive: true });
    await skill(join(root, 'p', 'ponytail', 'skills', 'ponytail'));
    await skill(join(root, 'p', 'ws-user', 'skills', 'standup'));
    await skill(join(root, 'p', 'ws-project', 'skills', 'other'));
    await skill(join(root, 'hive', 'skills', 'release-notes'));
    await mkdir(join(claude, 'plugins'), { recursive: true });
    await writeFile(
      join(claude, 'plugins', 'installed_plugins.json'),
      JSON.stringify({
        version: 2,
        plugins: {
          'ponytail@ponytail': [{ scope: 'user', installPath: join(root, 'p', 'ponytail') }],
          'workstream@claude-kit': [
            { scope: 'project', installPath: join(root, 'p', 'ws-project') },
            { scope: 'user', installPath: join(root, 'p', 'ws-user') },
          ],
          'hive@local': [],
        },
      }),
      'utf8',
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('the enabledPlugins a session settings file carries', async () => {
    expect(await claudeCodeAdapter.installed.sessionOverrides(['workstream', 'superpowers'])).toEqual({
      'workstream@claude-kit': false,
    });
  });

  it('the plugins Settings lists', async () => {
    expect(await claudeCodeAdapter.installed.pluginNames()).toEqual(['ponytail', 'workstream']);
  });

  it('the skill names an agent may reference', async () => {
    expect(
      await readAvailableSkillNames(join(root, 'hive', 'skills'), () => claudeCodeAdapter.installed.skillNames()),
    ).toEqual({
      all: ['mine', 'ponytail:ponytail', 'release-notes', 'workstream:standup'],
      hive: ['release-notes'],
    });
    expect((await claudeCodeAdapter.installed.skillNames()).sort()).toEqual([
      'mine',
      'ponytail:ponytail',
      'workstream:standup',
    ]);
  });
});
