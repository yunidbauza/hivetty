/**
 * `gh pr diff`'s text as files, hunks and lines with both sides' numbers
 * (HIVE-207). Pure: no React, no I/O. Metadata lines are read only before a
 * file's first hunk, so a removed `-- x` is never mistaken for `--- a/x`.
 */

export type DiffLineKind = 'context' | 'add' | 'del';

export interface DiffLine {
  kind: DiffLineKind;
  oldN: number | null;
  newN: number | null;
  text: string;
  /** git's "\ No newline at end of file" followed this line. */
  noNewline?: true;
}

export interface DiffHunk {
  header: string;
  oldStart: number;
  newStart: number;
  lines: DiffLine[];
}

export interface DiffFile {
  /** The new path; the old one for a deletion. */
  path: string;
  /** Set on a rename. */
  oldPath: string | null;
  status: 'modified' | 'added' | 'deleted' | 'renamed';
  binary: boolean;
  hunks: DiffHunk[];
}

const HUNK = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;
const ESCAPES: Record<string, number> = { n: 10, t: 9, '"': 34, '\\': 92 };

/** git's C-style quoting: `"caf\303\251"` is UTF-8 bytes in octal. Unquoted paths pass through. */
function unquote(path: string): string {
  if (!path.startsWith('"') || !path.endsWith('"')) return path;
  const body = path.slice(1, -1);
  const bytes: number[] = [];
  for (let i = 0; i < body.length; i += 1) {
    const c = body[i] ?? '';
    if (c !== '\\') {
      bytes.push(...new TextEncoder().encode(c));
      continue;
    }
    const next = body[i + 1] ?? '';
    if (/[0-7]/.test(next)) {
      bytes.push(parseInt(body.slice(i + 1, i + 4), 8));
      i += 3;
    } else {
      bytes.push(ESCAPES[next] ?? next.charCodeAt(0));
      i += 1;
    }
  }
  return new TextDecoder().decode(new Uint8Array(bytes));
}

const stripSide = (path: string): string => path.replace(/^[ab]\//, '');

/** `--- a/x` / `+++ b/x` to `x`; `/dev/null` to null. */
function sidePath(line: string): string | null {
  const raw = unquote(line.slice(4).replace(/\t.*$/, ''));
  return raw === '/dev/null' ? null : stripSide(raw);
}

/**
 * The path from `diff --git a/P b/P`. Only a fallback (binary files, pure
 * renames carry no `---`/`+++`): unquoted, both halves are the same path, so
 * it is the first half of the line's middle.
 */
function gitHeaderPath(rest: string): string {
  if (rest.startsWith('"')) return stripSide(unquote(rest.slice(0, rest.indexOf('"', 1) + 1)));
  const half = (rest.length - 5) / 2;
  return Number.isInteger(half) && half > 0 ? rest.slice(2, 2 + half) : stripSide(rest.split(' ')[0] ?? rest);
}

export function parseUnifiedDiff(text: string): DiffFile[] {
  const files: DiffFile[] = [];
  let file: DiffFile | null = null;
  let hunk: DiffHunk | null = null;
  let oldN = 0;
  let newN = 0;

  for (const line of text.split('\n')) {
    if (line.startsWith('diff --git ')) {
      file = { path: gitHeaderPath(line.slice('diff --git '.length)), oldPath: null, status: 'modified', binary: false, hunks: [] };
      files.push(file);
      hunk = null;
      continue;
    }
    if (file === null) continue;

    const header = HUNK.exec(line);
    if (header !== null) {
      oldN = Number(header[1]);
      newN = Number(header[2]);
      hunk = { header: line, oldStart: oldN, newStart: newN, lines: [] };
      file.hunks.push(hunk);
      continue;
    }

    if (hunk === null) {
      if (line.startsWith('new file mode')) file.status = 'added';
      else if (line.startsWith('deleted file mode')) file.status = 'deleted';
      else if (line.startsWith('rename from ')) {
        file.status = 'renamed';
        file.oldPath = unquote(line.slice('rename from '.length));
      } else if (line.startsWith('rename to ')) file.path = unquote(line.slice('rename to '.length));
      else if (line.startsWith('Binary files ')) file.binary = true;
      else if (line.startsWith('--- ')) {
        const path = sidePath(line);
        if (path !== null && file.status === 'deleted') file.path = path;
      } else if (line.startsWith('+++ ')) {
        const path = sidePath(line);
        if (path !== null) file.path = path;
      }
      continue;
    }

    if (line.startsWith('\\')) {
      const last = hunk.lines.at(-1);
      if (last !== undefined) last.noNewline = true;
    } else if (line.startsWith('+')) {
      hunk.lines.push({ kind: 'add', oldN: null, newN: newN++, text: line.slice(1) });
    } else if (line.startsWith('-')) {
      hunk.lines.push({ kind: 'del', oldN: oldN++, newN: null, text: line.slice(1) });
    } else if (line.startsWith(' ')) {
      hunk.lines.push({ kind: 'context', oldN: oldN++, newN: newN++, text: line.slice(1) });
    }
    // Anything else (the text's trailing empty line) adds nothing.
  }
  return files;
}

export interface SplitRow {
  left: DiffLine | null;
  right: DiffLine | null;
  /** `left`'s index in `hunk.lines`, so a click selects it without a search. */
  leftAt: number | null;
  rightAt: number | null;
}

/** Split's rows: context with itself, a deletion run beside the addition run that follows it. */
export function splitRows(hunk: DiffHunk): SplitRow[] {
  const rows: SplitRow[] = [];
  let dels: number[] = [];
  let adds: number[] = [];
  const line = (i: number | undefined) => (i === undefined ? null : (hunk.lines[i] ?? null));
  const flush = () => {
    for (let i = 0; i < Math.max(dels.length, adds.length); i += 1) {
      rows.push({ left: line(dels[i]), right: line(adds[i]), leftAt: dels[i] ?? null, rightAt: adds[i] ?? null });
    }
    dels = [];
    adds = [];
  };
  hunk.lines.forEach((l, i) => {
    if (l.kind === 'del') {
      if (adds.length > 0) flush();
      dels.push(i);
    } else if (l.kind === 'add') {
      adds.push(i);
    } else {
      flush();
      rows.push({ left: l, right: l, leftAt: i, rightAt: i });
    }
  });
  flush();
  return rows;
}
