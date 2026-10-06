import { appendFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createChangedFiles,
  foldTranscriptLines,
  type FileTally,
} from '../../../../electron/main/sessions/changed-files';
import { claudeProjectDir } from '../../../../electron/main/sessions/title-origin';
import { CH } from '../../../../electron/shared/ipc-contract';

const editLine = (filePath: string, lines: string[], extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    type: 'user',
    ...extra,
    toolUseResult: {
      filePath,
      oldString: 'a',
      newString: 'b',
      originalFile: 'x\n'.repeat(50),
      replaceAll: false,
      userModified: false,
      structuredPatch: [{ oldStart: 1, oldLines: 2, newStart: 1, newLines: 2, lines }],
    },
  });

const createLine = (filePath: string, content: string) =>
  JSON.stringify({
    type: 'user',
    toolUseResult: { type: 'create', filePath, content, structuredPatch: [], originalFile: null },
  });

const fold = (lines: string[]) => foldTranscriptLines(new Map<string, FileTally>(), lines);

describe('foldTranscriptLines (HIVE-201)', () => {
  it('counts + and - lines of an Edit and marks it M', () => {
    expect([...fold([editLine('/r/a.ts', [' ctx', '-old', '+new', '+more'])])]).toEqual([
      ['/r/a.ts', { mark: 'M', added: 2, removed: 1 }],
    ]);
  });

  it('a create counts its content lines and marks A; a later edit keeps A and adds', () => {
    const tallies = fold([createLine('/r/b.ts', 'one\ntwo\nthree\n'), editLine('/r/b.ts', ['-two', '+2'])]);
    expect(tallies.get('/r/b.ts')).toEqual({ mark: 'A', added: 4, removed: 1 });
  });

  it('a create of a file this session already edited stays M', () => {
    const tallies = fold([editLine('/r/c.ts', ['+x']), createLine('/r/c.ts', 'y\n')]);
    expect(tallies.get('/r/c.ts')?.mark).toBe('M');
  });

  it('ignores a sidechain line, a line with no toolUseResult, and a line that will not parse', () => {
    expect(
      fold([
        editLine('/r/d.ts', ['+x'], { isSidechain: true }),
        JSON.stringify({ type: 'assistant', message: {} }),
        '{"toolUseResult": {"filePath": "/r/e.ts", "structuredPatch": [',
        JSON.stringify({ toolUseResult: 'Error: string result' }),
      ]).size,
    ).toBe(0);
  });

  it('keeps first-seen order', () => {
    expect([...fold([editLine('/r/z.ts', ['+1']), editLine('/r/a.ts', ['+1'])]).keys()]).toEqual([
      '/r/z.ts',
      '/r/a.ts',
    ]);
  });
});

describe('createChangedFiles (HIVE-201)', () => {
  const CWD = '/repo';
  let home: string;
  let transcript: { cwd: string; sessionUuid: string } | undefined;
  const fileOf = (uuid: string) => join(home, '.claude', 'projects', claudeProjectDir(CWD), `${uuid}.jsonl`);
  const stage = (uuid: string, text: string) => {
    mkdirSync(join(fileOf(uuid), '..'), { recursive: true });
    writeFileSync(fileOf(uuid), text);
  };

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'hive-changed-'));
    transcript = { cwd: CWD, sessionUuid: 'u1' };
  });

  const make = (send = vi.fn()) => ({
    send,
    files: createChangedFiles({
      send,
      home,
      transcriptOf: () => transcript,
      rootOf: () => Promise.resolve('/repo'),
    }),
  });

  it('publishes the session list relative to the root', async () => {
    stage('u1', editLine('/repo/src/a.ts', ['-x', '+y', '+z']) + '\n');
    const { send, files } = make();
    await files.onFileTool('sess-01');
    expect(send).toHaveBeenLastCalledWith(CH.changedFilesChanged, {
      entityId: 'sess-01',
      files: [{ path: 'src/a.ts', mark: 'M', added: 2, removed: 1 }],
    });
  });

  it('a second read starts at the last offset, so nothing is counted twice', async () => {
    stage('u1', editLine('/repo/a.ts', ['+1']) + '\n');
    const { send, files } = make();
    await files.onFileTool('sess-01');
    appendFileSync(fileOf('u1'), editLine('/repo/a.ts', ['+2']) + '\n');
    await files.onFileTool('sess-01');
    expect(send.mock.lastCall?.[1]).toMatchObject({ files: [{ path: 'a.ts', added: 2 }] });
  });

  it('a torn last line is not a record until its newline lands', async () => {
    const whole = editLine('/repo/a.ts', ['+1']);
    stage('u1', whole.slice(0, 40));
    const { send, files } = make();
    await files.onFileTool('sess-01');
    expect(send).not.toHaveBeenCalled();
    appendFileSync(fileOf('u1'), whole.slice(40) + '\n');
    await files.onFileTool('sess-01');
    expect(send.mock.lastCall?.[1]).toMatchObject({ files: [{ path: 'a.ts', added: 1 }] });
  });

  it('a new transcript uuid (/clear) reads the new file from 0 and keeps the list (D9)', async () => {
    stage('u1', editLine('/repo/a.ts', ['+1']) + '\n');
    const { send, files } = make();
    await files.onFileTool('sess-01');
    transcript = { cwd: CWD, sessionUuid: 'u2' };
    stage('u2', editLine('/repo/b.ts', ['+1']) + '\n');
    await files.onFileTool('sess-01');
    expect(send.mock.lastCall?.[1]).toMatchObject({ files: [{ path: 'a.ts' }, { path: 'b.ts' }] });
  });

  it('serialises overlapping triggers, so one append is never read twice', async () => {
    stage('u1', editLine('/repo/a.ts', ['+1']) + '\n');
    const { send, files } = make();
    await Promise.all([files.onFileTool('sess-01'), files.onFileTool('sess-01'), files.onFileTool('sess-01')]);
    expect(send.mock.lastCall?.[1]).toMatchObject({ files: [{ added: 1 }] });
  });

  it('no transcript yet, or no known session: publishes nothing and does not throw', async () => {
    const { send, files } = make();
    await files.onFileTool('sess-01');
    transcript = undefined;
    await files.onFileTool('sess-02');
    expect(send).not.toHaveBeenCalled();
  });

  it('lists every session and drops one with files: []', async () => {
    stage('u1', editLine('/repo/a.ts', ['+1']) + '\n');
    const { send, files } = make();
    await files.onFileTool('sess-01');
    expect(files.list().sessions).toEqual([
      { entityId: 'sess-01', files: [{ path: 'a.ts', mark: 'M', added: 1, removed: 0 }] },
    ]);
    files.drop('sess-01');
    expect(send).toHaveBeenLastCalledWith(CH.changedFilesChanged, { entityId: 'sess-01', files: [] });
    expect(files.list().sessions).toEqual([]);
    files.drop('sess-01');
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('a drop during a read, or before a queued one, publishes nothing stale and lists nothing', async () => {
    stage('u1', editLine('/repo/a.ts', ['+1']) + '\n');
    const send = vi.fn();
    let roots = 0;
    let release: (root: string) => void = () => {};
    const files = createChangedFiles({
      send,
      home,
      transcriptOf: () => transcript,
      rootOf: () => {
        roots += 1;
        return new Promise<string>((resolve) => {
          release = resolve;
        });
      },
    });
    const inFlight = files.onFileTool('sess-01');
    const queued = files.onFileTool('sess-01');
    await vi.waitFor(() => {
      expect(roots).toBe(1);
    });
    files.drop('sess-01');
    release('/repo');
    await inFlight;
    release('/repo');
    await queued;
    expect(send).not.toHaveBeenCalled();
    expect(files.list().sessions).toEqual([]);
  });

  it('drops a file outside the root, and the root itself', async () => {
    stage(
      'u1',
      [
        editLine('/elsewhere/x.ts', ['+1']),
        editLine('/repo-other/y.ts', ['+1']),
        editLine('/repo', ['+1']),
        editLine('/repo/z.ts', ['+1']),
      ].join('\n') + '\n',
    );
    const { send, files } = make();
    await files.onFileTool('sess-01');
    expect(send.mock.lastCall?.[1]).toMatchObject({ files: [{ path: 'z.ts' }] });
    expect((send.mock.lastCall?.[1] as { files: unknown[] }).files).toHaveLength(1);
  });

  it('a session in an out-of-project worktree is relative to that worktree (HIVE-78)', async () => {
    stage('u1', editLine('/wt/feat/src/a.ts', ['+1']) + '\n');
    const send = vi.fn();
    const files = createChangedFiles({
      send,
      home,
      transcriptOf: () => transcript,
      rootOf: () => Promise.resolve('/wt/feat'),
    });
    await files.onFileTool('sess-01');
    expect(send.mock.lastCall?.[1]).toMatchObject({ files: [{ path: 'src/a.ts' }] });
  });

  it('no root (no project) publishes nothing', async () => {
    stage('u1', editLine('/repo/a.ts', ['+1']) + '\n');
    const send = vi.fn();
    const files = createChangedFiles({
      send,
      home,
      transcriptOf: () => transcript,
      rootOf: () => Promise.resolve(null),
    });
    await files.onFileTool('sess-01');
    expect(send).not.toHaveBeenCalled();
  });
});
