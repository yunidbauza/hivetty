import type { DiffFile } from '@lib/unified-diff';
import type { PrFile, PrThread } from '@shared/github-contract';

/**
 * The Files tab's derivations (HIVE-207): pure, computed on render, never
 * stored. Viewed is GitHub's own; DISMISSED (pushed to since you viewed it)
 * counts as not viewed.
 */

/** One folder of changed files; `dir` is '' for the repository root. */
export interface FileGroup {
  dir: string;
  files: PrFile[];
}

export const baseName = (path: string): string => path.slice(path.lastIndexOf('/') + 1);

/** Files grouped by their whole directory (`src/fees`), root first, each sorted by name. */
export function fileTree(files: readonly PrFile[], filter = ''): FileGroup[] {
  const needle = filter.trim().toLowerCase();
  const groups = new Map<string, PrFile[]>();
  for (const file of files) {
    if (needle !== '' && !file.path.toLowerCase().includes(needle)) continue;
    const cut = file.path.lastIndexOf('/');
    const dir = cut === -1 ? '' : file.path.slice(0, cut);
    groups.set(dir, [...(groups.get(dir) ?? []), file]);
  }
  return [...groups]
    .sort(([a], [b]) => (a === '' ? -1 : b === '' ? 1 : a.localeCompare(b)))
    .map(([dir, list]) => ({ dir, files: list.sort((x, y) => baseName(x.path).localeCompare(baseName(y.path))) }));
}

/** "9 files · 2 open threads · viewed 3 of 9": `total` is GitHub's count, which may pass the files read. */
export function filesSummary(files: readonly PrFile[], total: number, threads: readonly PrThread[]) {
  return {
    files: total,
    openThreads: threads.filter((thread) => !thread.isResolved).length,
    viewed: files.filter((file) => file.viewed === 'viewed').length,
  };
}

export function threadMark(path: string, threads: readonly PrThread[]): 'open' | 'resolved' | null {
  const mine = threads.filter((thread) => thread.path === path);
  if (mine.length === 0) return null;
  return mine.some((thread) => !thread.isResolved) ? 'open' : 'resolved';
}

/** The tab opens on the first file with an open thread, else the first file. */
export function firstFile(tree: readonly FileGroup[], threads: readonly PrThread[]): string | null {
  const all = tree.flatMap((group) => group.files);
  return (all.find((file) => threadMark(file.path, threads) === 'open') ?? all[0])?.path ?? null;
}

/** A diff row's address: the new side's number on the right, the old side's on the left. */
export const lineKey = (side: 'L' | 'R', n: number): string => `${side}:${n}`;

/**
 * Where each of a file's threads sits (HIVE-207): under the line `line` names
 * on its `diffSide` (RIGHT the new number, LEFT the old), or at the top as
 * outdated when GitHub says so, it has no line, or the diff no longer shows it.
 */
export function placeThreads(file: DiffFile, threads: readonly PrThread[]): { outdated: PrThread[]; at: Map<string, PrThread[]> } {
  const shown = new Set<string>();
  for (const hunk of file.hunks) {
    for (const line of hunk.lines) {
      if (line.newN !== null) shown.add(lineKey('R', line.newN));
      if (line.oldN !== null) shown.add(lineKey('L', line.oldN));
    }
  }
  const at = new Map<string, PrThread[]>();
  const outdated: PrThread[] = [];
  for (const thread of threads) {
    if (thread.path !== file.path) continue;
    const key = thread.line === null ? null : lineKey(thread.diffSide === 'LEFT' ? 'L' : 'R', thread.line);
    if (thread.isOutdated || key === null || !shown.has(key)) outdated.push(thread);
    else at.set(key, [...(at.get(key) ?? []), thread]);
  }
  return { outdated, at };
}
