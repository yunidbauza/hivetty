import type { JobLog } from '../../../shared/github-contract';

/**
 * A failed job's log, cut to the failure before it crosses IPC (HIVE-206, D3).
 *
 * The log is the whole job, from the REST endpoint (`actions.ts` says why), so
 * it is first narrowed to the failed step: the output between its
 * `##[group]Run …` header's `##[endgroup]` (past the echoed script) and its
 * last `##[error]`. Within that, the first failure marker with 5 lines above and 60
 * below; else the last 80.
 * A summary line (`Tests: …`) outside the window is kept after an ellipsis.
 * Never more than 64 KB, dropped from the front.
 */
/* The renderer's `classifyLogLine` keeps a copy of this marker; change both. */
const FAILURE = /✕|✗|\bFAIL\b|\bError\b|##\[error\]/;
const SUMMARY = /^\s*(Tests?|Test Files|Test Suites):/;
/** The REST log's BOM and timestamp, and `gh run view --log`'s job and step columns before it. */
const PREFIX = /^\uFEFF?(?:[^\t]*\t[^\t]*\t)?\d{4}-\d\d-\d\dT[\d:.]+Z ?/;
/* Built from a string: an ANSI escape is a control character, which a regex literal may not hold (no-control-regex). */
const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');
const ABOVE = 5;
const BELOW = 60;
const TAIL = 80;
const CAP = 64 * 1024;

/** The failed step's output as `[from, to)`: past its header's `##[endgroup]`, through its last `##[error]`: an earlier one is a continue-on-error step, and steps after the real failure only run under `if: always()`. Null without one. */
function failedStep(lines: readonly string[]): [number, number] | null {
  const error = lines.findLastIndex((line) => line.startsWith('##[error]'));
  if (error === -1) return null;
  let open = -1;
  for (let i = error - 1; i >= 0 && open === -1; i -= 1) if (lines[i]?.startsWith('##[group]Run ') === true) open = i;
  if (open === -1) return [0, error + 1];
  const close = lines.findIndex((line, i) => i > open && i < error && line.startsWith('##[endgroup]'));
  return [close === -1 ? open + 1 : close + 1, error + 1];
}

export function cutLog(raw: string): JobLog {
  const job = raw.split(/\r?\n/).map((line) => line.replace(PREFIX, '').replace(ANSI, ''));
  while (job.length > 0 && job[job.length - 1] === '') job.pop();
  const [from, to] = failedStep(job) ?? [0, job.length];
  const all = job.slice(from, to);

  const at = all.findIndex((line) => FAILURE.test(line));
  const start = at === -1 ? Math.max(0, all.length - TAIL) : Math.max(0, at - ABOVE);
  const end = at === -1 ? all.length : Math.min(all.length, at + BELOW + 1);
  let lines = all.slice(start, end);
  const summary = all.slice(end).filter((line) => SUMMARY.test(line));
  if (summary.length > 0) lines = [...lines, '…', ...summary];
  let truncated = from > 0 || to < job.length || start > 0 || end < all.length;

  while (lines.length > 1 && lines.join('\n').length > CAP) {
    lines = lines.slice(1);
    truncated = true;
  }
  return { lines, truncated };
}
