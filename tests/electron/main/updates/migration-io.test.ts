// @vitest-environment node
import { execFile, spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { describe, expect, it } from 'vitest';

import { findInstalled, handOffArgs } from '../../../../electron/main/updates/migration-io';

const run = promisify(execFile);
const tmp = (): Promise<string> => mkdtemp(path.join(os.tmpdir(), 'migration-io-'));

/** The hand-off, run for real against a PID that has already exited, with `true` for `open`. */
const handOff = async (from: string, to: string, pid = 999_999): Promise<void> => {
  await run('/bin/sh', handOffArgs({ pid, target: '/Applications/HiveTTY.app', from, to, opener: 'true' }));
};

describe('the hand-off', () => {
  it('copies history, window state and Local Storage, and nothing else', async () => {
    const from = await tmp();
    const to = path.join(await tmp(), 'HiveTTY');
    await writeFile(path.join(from, 'sessions.json'), 'history');
    await writeFile(path.join(from, 'window-state.json'), 'window');
    await mkdir(path.join(from, 'Local Storage', 'leveldb'), { recursive: true });
    await writeFile(path.join(from, 'Local Storage', 'leveldb', 'CURRENT'), 'theme');
    await writeFile(path.join(from, 'jira-credential.bin'), 'secret');

    await handOff(from, to);

    expect(await readFile(path.join(to, 'sessions.json'), 'utf8')).toBe('history');
    expect(await readFile(path.join(to, 'window-state.json'), 'utf8')).toBe('window');
    expect(await readFile(path.join(to, 'Local Storage', 'leveldb', 'CURRENT'), 'utf8')).toBe('theme');
    await expect(readFile(path.join(to, 'jira-credential.bin'))).rejects.toThrow();
  });

  it('never overwrites or merges into what HiveTTY already has, and skips what The Hive never wrote', async () => {
    const from = await tmp();
    const to = await tmp();
    await writeFile(path.join(from, 'sessions.json'), 'old');
    await writeFile(path.join(to, 'sessions.json'), 'hivetty’s own');
    await mkdir(path.join(from, 'Local Storage'));
    await writeFile(path.join(from, 'Local Storage', 'OLD'), 'x');
    await mkdir(path.join(to, 'Local Storage'));

    await handOff(from, to);

    expect(await readFile(path.join(to, 'sessions.json'), 'utf8')).toBe('hivetty’s own');
    await expect(readFile(path.join(to, 'Local Storage', 'OLD'))).rejects.toThrow();
    await expect(readFile(path.join(to, 'window-state.json'))).rejects.toThrow();
  });

  it('copies only after the process has exited, so the quit\'s last flush is what moves', async () => {
    const from = await tmp();
    const to = await tmp();
    await writeFile(path.join(from, 'sessions.json'), 'before quit');
    const app = spawn('/bin/sleep', ['1']);

    const handing = handOff(from, to, app.pid);
    await new Promise((resolve) => setTimeout(resolve, 300));
    await writeFile(path.join(from, 'sessions.json'), 'flushed at quit');
    await handing;

    expect(await readFile(path.join(to, 'sessions.json'), 'utf8')).toBe('flushed at quit');
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
