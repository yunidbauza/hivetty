import { describe, expect, it } from 'vitest';

import { fileTree, filesSummary, firstFile, placeThreads, threadMark } from '@lib/pr-files';
import { parseUnifiedDiff } from '@lib/unified-diff';
import { prFile, prThread } from '@tests/support/pr-detail';

const FILES = [
  prFile({ path: 'src/fees/validator.ts', viewed: 'viewed' }),
  prFile({ path: 'README.md', viewed: 'dismissed' }),
  prFile({ path: 'src/fees/delaware.rule.ts', viewed: 'viewed' }),
  prFile({ path: 'test/integration/fee-rule.spec.ts' }),
];

describe('fileTree', () => {
  it('groups by directory, root first, folders and names sorted', () => {
    expect(fileTree(FILES).map((g) => [g.dir, g.files.map((f) => f.path)])).toEqual([
      ['', ['README.md']],
      ['src/fees', ['src/fees/delaware.rule.ts', 'src/fees/validator.ts']],
      ['test/integration', ['test/integration/fee-rule.spec.ts']],
    ]);
  });
  it('filters by path, case-insensitively, and drops an emptied folder', () => {
    expect(fileTree(FILES, '  FEES/V ').map((g) => [g.dir, g.files.map((f) => f.path)])).toEqual([['src/fees', ['src/fees/validator.ts']]]);
  });
});

describe('filesSummary', () => {
  it('counts the total, open threads, and viewed with DISMISSED as not viewed', () => {
    const threads = [prThread(), prThread({ id: 'T2', isResolved: true })];
    expect(filesSummary(FILES, 9, threads)).toEqual({ files: 9, openThreads: 1, viewed: 2 });
  });
});

describe('threadMark', () => {
  it('is open with any open thread, resolved when all are, null with none', () => {
    const open = prThread();
    const done = prThread({ id: 'T2', isResolved: true });
    expect(threadMark('src/fees/validator.ts', [open, done])).toBe('open');
    expect(threadMark('src/fees/validator.ts', [done])).toBe('resolved');
    expect(threadMark('README.md', [open])).toBeNull();
  });
});

describe('firstFile', () => {
  it('is the first file in tree order with an open thread', () => {
    expect(firstFile(fileTree(FILES), [prThread()])).toBe('src/fees/validator.ts');
  });
  it('else the first file, else null', () => {
    expect(firstFile(fileTree(FILES), [prThread({ isResolved: true })])).toBe('README.md');
    expect(firstFile([], [])).toBeNull();
  });
});

describe('placeThreads', () => {
  const [file] = parseUnifiedDiff([
    'diff --git a/src/fees/validator.ts b/src/fees/validator.ts', '--- a/src/fees/validator.ts', '+++ b/src/fees/validator.ts',
    '@@ -116,3 +116,3 @@', ' keep', '-old', '+new', ' tail',
  ].join('\n'));

  it('puts a RIGHT thread under its new line and a LEFT thread under its old one', () => {
    const right = prThread({ id: 'R', line: 117, diffSide: 'RIGHT' });
    const left = prThread({ id: 'L', line: 117, diffSide: 'LEFT' });
    const placed = placeThreads(file!, [right, left]);
    expect(placed.at.get('R:117')).toEqual([right]);
    expect(placed.at.get('L:117')).toEqual([left]);
    expect(placed.outdated).toEqual([]);
  });

  it('lists an outdated thread, one with no line, and one off the hunks at the top', () => {
    const outdated = prThread({ id: 'O', isOutdated: true });
    const noLine = prThread({ id: 'N', line: null });
    const off = prThread({ id: 'F', line: 400 });
    expect(placeThreads(file!, [outdated, noLine, off]).outdated).toEqual([outdated, noLine, off]);
  });

  it('ignores another file’s threads', () => {
    const placed = placeThreads(file!, [prThread({ path: 'README.md', line: 117 })]);
    expect(placed.outdated).toEqual([]);
    expect(placed.at.size).toBe(0);
  });
});
