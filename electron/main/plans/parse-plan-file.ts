import type { PlanPart, PlanStep, PlanTask, PlanTaskStatus } from '@shared/plan-contract';

/** `## Task 3: Name` or `### Task: Name`; the number is optional. */
const TASK = /^#{2,3}\s+Task\s*(\d+)?\s*:\s*(.+)$/;
/** The skill's `risk: … est: …` trailer, set off by a run of two or more spaces. */
const TRAILER = /\s{2,}(?:risk|est):.*$/;
/** A checkbox at any indent, so nested sub-steps count. */
const STEP = /^\s*[-*]\s+\[([ xX])\]\s+(.+)$/;
const FENCE = /^\s*(?:```|~~~)/;
const HEADING = /^#{1,6}\s/;

const statusOf = (steps: readonly PlanStep[]): PlanTaskStatus => {
  const done = steps.filter((step) => step.done).length;
  if (steps.length > 0 && done === steps.length) return 'completed';
  return done > 0 ? 'in_progress' : 'pending';
};

/**
 * A `hive:plan` file's tasks (HIVE-180).
 *
 * `## Task N: <name>   risk: … est: …` is the skill's shape; `###` is
 * accepted too, and a task with no number takes its 1-based position. Steps
 * are checkbox lines under a task, outside code fences, until the next
 * heading. Status comes from the steps: all ticked is completed, some is in
 * progress, none (or no steps) is pending. No task headings is no plan — an
 * empty list, never an error.
 */
export function parsePlanFile(markdown: string): PlanTask[] {
  const tasks: { id: string; title: string; steps: PlanStep[] }[] = [];
  let current: (typeof tasks)[number] | undefined;
  let fenced = false;
  for (const line of markdown.split(/\r?\n/)) {
    if (FENCE.test(line)) {
      fenced = !fenced;
      continue;
    }
    if (fenced) continue;
    const task = TASK.exec(line);
    if (task !== null) {
      current = {
        id: task[1] ?? String(tasks.length + 1),
        title: (task[2] ?? '').replace(TRAILER, '').trim(),
        steps: [],
      };
      tasks.push(current);
      continue;
    }
    if (HEADING.test(line)) {
      current = undefined;
      continue;
    }
    const step = current === undefined ? null : STEP.exec(line);
    if (current !== undefined && step !== null) {
      current.steps.push({ text: (step[2] ?? '').trim(), done: step[1] !== ' ' });
    }
  }
  return tasks.map(({ id, title, steps }) => ({ id, title, status: statusOf(steps), steps }));
}

const PART = /^PR:\s*(\d+)\s+of\s+(\d+)\s*$/;
/** The free-text form plans used before `PR: n of N`: `PRs: 2. This is PR B …`. */
const LEGACY_PART = /^PRs:\s*(\d+)\b.*?\bThis (?:plan )?is PR ([A-Z])\b/;

/**
 * Which PR of a split a plan is (HIVE-359), from its header: the lines before
 * the first `## ` heading. `PR: n of N` is the skill's line; the legacy line
 * counts only with two or more PRs, so `PRs: 1 — PR 3 of 4` (an Epic
 * position, not a split) and `PR: <url>` give nothing.
 */
export function parsePlanPart(markdown: string): PlanPart | undefined {
  for (const line of markdown.split(/\r?\n/)) {
    if (line.startsWith('## ')) return undefined;
    const plain = line.replaceAll('**', '');
    const part = PART.exec(plain);
    const legacy = LEGACY_PART.exec(plain);
    // A is 1: char code 65.
    const [index, of] =
      part !== null
        ? [Number(part[1]), Number(part[2])]
        : legacy !== null
          ? [(legacy[2] ?? '').charCodeAt(0) - 64, Number(legacy[1])]
          : [Number.NaN, Number.NaN];
    if (Number.isSafeInteger(index) && Number.isSafeInteger(of) && of >= 2 && index >= 1 && index <= of) return { index, of };
  }
  return undefined;
}
