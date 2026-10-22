import type { FileTally } from '../port';

const lineCount = (text: string): number =>
  text === '' ? 0 : text.split('\n').length - (text.endsWith('\n') ? 1 : 0);

/**
 * Fold transcript lines into per-file tallies (HIVE-201).
 *
 * The facts, measured on claude's own transcripts: a user line's
 * `toolUseResult` carries `filePath` and `structuredPatch` (hunks whose
 * `lines` start `+`, `-` or a space); a `Write` adds `type: 'create' |
 * 'update'`, and a create's patch is empty, so its `+N` is `content`'s line
 * count. `isSidechain: true` is a subagent's, and not this session's (D10).
 *
 * The substring test runs before `JSON.parse`, as `titleRecord` does: most
 * lines are large and irrelevant, and `originalFile` makes these large too.
 */
export function foldTranscriptLines(
  tallies: Map<string, FileTally>,
  lines: readonly string[],
): Map<string, FileTally> {
  for (const line of lines) {
    if (!line.includes('"toolUseResult"')) continue;
    let record: { isSidechain?: unknown; toolUseResult?: unknown };
    try {
      record = JSON.parse(line) as typeof record;
    } catch {
      continue;
    }
    if (record.isSidechain === true) continue;
    const result = record.toolUseResult;
    if (typeof result !== 'object' || result === null) continue;
    const { filePath, structuredPatch, type, content } = result as Record<string, unknown>;
    if (typeof filePath !== 'string' || !Array.isArray(structuredPatch)) continue;

    let added = 0;
    let removed = 0;
    if (type === 'create' && typeof content === 'string') {
      added = lineCount(content);
    } else {
      for (const hunk of structuredPatch) {
        const hunkLines = (hunk as { lines?: unknown } | null)?.lines;
        if (!Array.isArray(hunkLines)) continue;
        for (const text of hunkLines) {
          if (typeof text !== 'string') continue;
          if (text.startsWith('+')) added += 1;
          else if (text.startsWith('-')) removed += 1;
        }
      }
    }
    const before = tallies.get(filePath);
    tallies.set(filePath, {
      mark: before?.mark ?? (type === 'create' ? 'A' : 'M'),
      added: (before?.added ?? 0) + added,
      removed: (before?.removed ?? 0) + removed,
    });
  }
  return tallies;
}
