import { describe, expect, it } from 'vitest';

import { foldTranscriptLines } from '../../../../../electron/main/harness/claude-code/transcript-edits';
import type { FileTally } from '../../../../../electron/main/harness/port';

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
