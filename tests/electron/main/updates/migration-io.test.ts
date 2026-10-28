// @vitest-environment node
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { carryOver, findInstalled } from '../../../../electron/main/updates/migration-io';

const tmp = (): Promise<string> => mkdtemp(path.join(os.tmpdir(), 'migration-io-'));

describe('carryOver', () => {
  it('copies history, window state and Local Storage, and nothing else', async () => {
    const from = await tmp();
    const to = path.join(await tmp(), 'HiveTTY');
    await writeFile(path.join(from, 'sessions.json'), 'history');
    await writeFile(path.join(from, 'window-state.json'), 'window');
    await mkdir(path.join(from, 'Local Storage', 'leveldb'), { recursive: true });
    await writeFile(path.join(from, 'Local Storage', 'leveldb', 'CURRENT'), 'theme');
    await writeFile(path.join(from, 'jira-credential.bin'), 'secret');

    await carryOver(from, to);

    expect(await readFile(path.join(to, 'sessions.json'), 'utf8')).toBe('history');
    expect(await readFile(path.join(to, 'window-state.json'), 'utf8')).toBe('window');
    expect(await readFile(path.join(to, 'Local Storage', 'leveldb', 'CURRENT'), 'utf8')).toBe('theme');
    await expect(readFile(path.join(to, 'jira-credential.bin'))).rejects.toThrow();
  });

  it('never overwrites what HiveTTY already has, and skips what The Hive never wrote', async () => {
    const from = await tmp();
    const to = await tmp();
    await writeFile(path.join(from, 'sessions.json'), 'old');
    await writeFile(path.join(to, 'sessions.json'), 'hivetty’s own');

    await carryOver(from, to);

    expect(await readFile(path.join(to, 'sessions.json'), 'utf8')).toBe('hivetty’s own');
    await expect(readFile(path.join(to, 'window-state.json'))).rejects.toThrow();
  });
});

describe('findInstalled', () => {
  it('answers the first directory holding HiveTTY.app, else null', async () => {
    const a = await tmp();
    const b = await tmp();
    expect(await findInstalled([a, b])).toBeNull();

    await mkdir(path.join(b, 'HiveTTY.app'));
    expect(await findInstalled([a, b])).toBe(path.join(b, 'HiveTTY.app'));
  });
});
