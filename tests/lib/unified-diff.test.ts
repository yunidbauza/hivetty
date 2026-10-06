import { describe, expect, it } from 'vitest';

import { type DiffLine, parseUnifiedDiff, splitRows } from '@lib/unified-diff';

const MODIFIED = [
  'diff --git a/src/fees/validator.ts b/src/fees/validator.ts',
  'index 1a2b3c4..5d6e7f8 100644',
  '--- a/src/fees/validator.ts',
  '+++ b/src/fees/validator.ts',
  '@@ -114,4 +114,4 @@ export function validate(filing: Filing): Result {',
  '   const fee = feeTable.for(filing.state, filing.year);',
  "-  if (filing.total < 400) return reject('underpaid');",
  "+  if (filing.total < fee.minimum) return reject('underpaid');",
  "   if (filing.entity === 'llc') return ok();",
  '   return checkFranchiseTax(filing);',
  '@@ -200,2 +200,3 @@',
  ' }',
  '+',
  '+export const VERSION = 2;',
  '',
].join('\n');

describe('parseUnifiedDiff', () => {
  it('reads a modified file, its hunks and both sides’ numbers', () => {
    const [file] = parseUnifiedDiff(MODIFIED);
    expect(file).toMatchObject({ path: 'src/fees/validator.ts', oldPath: null, status: 'modified', binary: false });
    expect(file?.hunks).toHaveLength(2);
    expect(file?.hunks[0]).toMatchObject({ oldStart: 114, newStart: 114 });
    expect(file?.hunks[0]?.lines).toEqual([
      { kind: 'context', oldN: 114, newN: 114, text: '  const fee = feeTable.for(filing.state, filing.year);' },
      { kind: 'del', oldN: 115, newN: null, text: "  if (filing.total < 400) return reject('underpaid');" },
      { kind: 'add', oldN: null, newN: 115, text: "  if (filing.total < fee.minimum) return reject('underpaid');" },
      { kind: 'context', oldN: 116, newN: 116, text: "  if (filing.entity === 'llc') return ok();" },
      { kind: 'context', oldN: 117, newN: 117, text: '  return checkFranchiseTax(filing);' },
    ]);
    expect(file?.hunks[1]?.lines.map((l) => [l.kind, l.oldN, l.newN])).toEqual([
      ['context', 200, 200], ['add', null, 201], ['add', null, 202],
    ]);
  });

  it('reads an added and a deleted file', () => {
    const files = parseUnifiedDiff([
      'diff --git a/new.ts b/new.ts', 'new file mode 100644', 'index 0000000..1111111', '--- /dev/null', '+++ b/new.ts',
      '@@ -0,0 +1,2 @@', '+one', '+two',
      'diff --git a/old.ts b/old.ts', 'deleted file mode 100644', 'index 1111111..0000000', '--- a/old.ts', '+++ /dev/null',
      '@@ -1 +0,0 @@', '-gone',
    ].join('\n'));
    expect(files.map((f) => [f.path, f.status])).toEqual([['new.ts', 'added'], ['old.ts', 'deleted']]);
    expect(files[0]?.hunks[0]?.lines.map((l) => l.newN)).toEqual([1, 2]);
    expect(files[1]?.hunks[0]?.lines).toEqual([{ kind: 'del', oldN: 1, newN: null, text: 'gone' }]);
  });

  it('reads a pure rename and a rename with changes', () => {
    const files = parseUnifiedDiff([
      'diff --git a/a/x.ts b/b/x.ts', 'similarity index 100%', 'rename from a/x.ts', 'rename to b/x.ts',
      'diff --git a/p q.ts b/r q.ts', 'similarity index 90%', 'rename from p q.ts', 'rename to r q.ts', 'index 1..2 100644',
      '--- a/p q.ts', '+++ b/r q.ts', '@@ -1 +1 @@', '-a', '+b',
    ].join('\n'));
    expect(files.map((f) => [f.path, f.oldPath, f.status, f.hunks.length])).toEqual([
      ['b/x.ts', 'a/x.ts', 'renamed', 0],
      ['r q.ts', 'p q.ts', 'renamed', 1],
    ]);
  });

  it('marks a binary file and gives it no hunks', () => {
    const [file] = parseUnifiedDiff(['diff --git a/logo.png b/logo.png', 'index 1..2 100644', 'Binary files a/logo.png and b/logo.png differ'].join('\n'));
    expect(file).toMatchObject({ path: 'logo.png', binary: true, hunks: [] });
  });

  it('marks the line before "\\ No newline at end of file"', () => {
    const [file] = parseUnifiedDiff([
      'diff --git a/x b/x', '--- a/x', '+++ b/x', '@@ -1 +1 @@', '-old', '\\ No newline at end of file', '+new', '\\ No newline at end of file',
    ].join('\n'));
    expect(file?.hunks[0]?.lines).toEqual([
      { kind: 'del', oldN: 1, newN: null, text: 'old', noNewline: true },
      { kind: 'add', oldN: null, newN: 1, text: 'new', noNewline: true },
    ]);
  });

  it('takes a path with spaces from the git header when there is no ---/+++ pair', () => {
    const [file] = parseUnifiedDiff(['diff --git a/my file.bin b/my file.bin', 'Binary files differ'].join('\n'));
    expect(file?.path).toBe('my file.bin');
  });

  it('unquotes a path git quoted', () => {
    const [file] = parseUnifiedDiff(['diff --git "a/caf\\303\\251.ts" "b/caf\\303\\251.ts"', '--- "a/caf\\303\\251.ts"', '+++ "b/caf\\303\\251.ts"', '@@ -1 +1 @@', '-a', '+b'].join('\n'));
    expect(file?.path).toBe('café.ts');
  });

  it('does not read a removed "-- x" or added "++ x" line as a header', () => {
    const [file] = parseUnifiedDiff(['diff --git a/x b/x', '--- a/x', '+++ b/x', '@@ -1 +1 @@', '--- x', '+++ y'].join('\n'));
    expect(file?.path).toBe('x');
    expect(file?.hunks[0]?.lines.map((l) => [l.kind, l.text])).toEqual([['del', '-- x'], ['add', '++ y']]);
  });

  it('is empty for an empty diff', () => {
    expect(parseUnifiedDiff('')).toEqual([]);
  });
});

describe('splitRows', () => {
  const c = (n: number) => ({ kind: 'context' as const, oldN: n, newN: n, text: `c${n}` });
  const d = (n: number) => ({ kind: 'del' as const, oldN: n, newN: null, text: `d${n}` });
  const a = (n: number) => ({ kind: 'add' as const, oldN: null, newN: n, text: `a${n}` });
  const hunk = (lines: DiffLine[]) => ({ header: '@@', oldStart: 1, newStart: 1, lines });

  it('pairs a context line with itself', () => {
    expect(splitRows(hunk([c(1)]))).toEqual([{ left: c(1), right: c(1), leftAt: 0, rightAt: 0 }]);
  });
  it('pairs equal runs of deletions and additions index by index', () => {
    expect(splitRows(hunk([d(2), d(3), a(2), a(3)]))).toEqual([
      { left: d(2), right: a(2), leftAt: 0, rightAt: 2 }, { left: d(3), right: a(3), leftAt: 1, rightAt: 3 },
    ]);
  });
  it('pads the shorter side of unequal runs with null', () => {
    expect(splitRows(hunk([d(2), a(2), a(3), c(4)]))).toEqual([
      { left: d(2), right: a(2), leftAt: 0, rightAt: 1 },
      { left: null, right: a(3), leftAt: null, rightAt: 2 },
      { left: c(4), right: c(4), leftAt: 3, rightAt: 3 },
    ]);
  });
  it('leaves a deletion-only run and an addition-only run alone', () => {
    expect(splitRows(hunk([d(2), c(3), a(4)]))).toEqual([
      { left: d(2), right: null, leftAt: 0, rightAt: null },
      { left: c(3), right: c(3), leftAt: 1, rightAt: 1 },
      { left: null, right: a(4), leftAt: null, rightAt: 2 },
    ]);
  });
  it('starts a new pair when a deletion follows additions', () => {
    expect(splitRows(hunk([a(1), d(1)]))).toEqual([
      { left: null, right: a(1), leftAt: null, rightAt: 0 }, { left: d(1), right: null, leftAt: 1, rightAt: null },
    ]);
  });
  it('carries each side’s index in hunk.lines, so a click needs no indexOf', () => {
    const lines = [c(1), d(2), d(3), a(2), c(4), a(5)];
    expect(splitRows(hunk(lines)).map(({ leftAt, rightAt }) => [leftAt, rightAt])).toEqual([
      [0, 0], // context: one line, both sides
      [1, 3], // d(2) paired with a(2)
      [2, null], // d(3) unpaired
      [4, 4], // context
      [null, 5], // a(5) unpaired
    ]);
  });
});
