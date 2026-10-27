import { describe, expect, it } from 'vitest';

import { parsePlanFile, parsePlanPart } from '../../../../electron/main/plans/parse-plan-file';

/** A condensed `hive:plan` file in the skill's own shape (`.hive/` is gitignored, so inlined). */
const PLAN = [
  '# Thing plan',
  '',
  'Goal: x',
  '',
  '## Task 1: Parse the file                risk: no       est: 20m',
  '',
  'Steps:',
  '- [x] Write the failing test',
  '- [x] Run it',
  '  - [x] nested sub-step',
  '',
  '```markdown',
  '- [ ] not a step, inside a fence',
  '### Task 9: not a task either',
  '```',
  '',
  '## Task 2: Wire it                        risk: yes      est: 20m',
  '',
  '- [x] Write the failing test',
  '- [ ] Minimal implementation',
  '',
  '### Task: A task with no number',
  '',
  '- [ ] Only step',
  '',
  '## Notes',
  '- [ ] a checkbox under a non-task heading is not a step',
].join('\n');

describe('parsePlanFile', () => {
  it('reads tasks, strips the risk/est trailer, and derives status from steps', () => {
    expect(parsePlanFile(PLAN)).toEqual([
      {
        id: '1',
        title: 'Parse the file',
        status: 'completed',
        steps: [
          { text: 'Write the failing test', done: true },
          { text: 'Run it', done: true },
          { text: 'nested sub-step', done: true },
        ],
      },
      {
        id: '2',
        title: 'Wire it',
        status: 'in_progress',
        steps: [
          { text: 'Write the failing test', done: true },
          { text: 'Minimal implementation', done: false },
        ],
      },
      {
        id: '3',
        title: 'A task with no number',
        status: 'pending',
        steps: [{ text: 'Only step', done: false }],
      },
    ]);
  });

  it('unticking a step re-opens a completed task', () => {
    expect(parsePlanFile(PLAN.replace('- [x] Run it', '- [ ] Run it'))[0]?.status).toBe('in_progress');
  });

  it('a task with no steps is pending', () => {
    expect(parsePlanFile('## Task 1: Solo')[0]).toEqual({
      id: '1',
      title: 'Solo',
      status: 'pending',
      steps: [],
    });
  });

  it('no task headings is no plan, not an error', () => {
    expect(parsePlanFile('# Just prose\n- [ ] x')).toEqual([]);
  });

  it('accepts [X] and * bullets as steps', () => {
    expect(parsePlanFile('## Task 1: Caps\n* [X] shouted\n- [x] quiet')[0]?.status).toBe('completed');
  });

  it('keeps a title that has no trailer, and a ~~~ fence hides its contents', () => {
    expect(parsePlanFile('## Task 4: Plain title\n~~~\n- [ ] hidden\n~~~\n- [ ] shown')).toEqual([
      { id: '4', title: 'Plain title', status: 'pending', steps: [{ text: 'shown', done: false }] },
    ]);
  });

  it('reads a CRLF file', () => {
    expect(parsePlanFile('## Task 1: Windows\r\n- [x] done\r\n')[0]).toEqual({
      id: '1',
      title: 'Windows',
      status: 'completed',
      steps: [{ text: 'done', done: true }],
    });
  });
});

describe('parsePlanPart (HIVE-359)', () => {
  const header = (line: string) => `# X plan\n\nGoal: g\n${line}\nArchitecture: a\n\n## Task 1: A\n- [ ] one\n`;

  it('reads the structured PR line', () => {
    expect(parsePlanPart(header('PR: 2 of 3'))).toEqual({ index: 2, of: 3 });
  });

  it('reads the free-text form plans were written in before it, letter to number', () => {
    expect(parsePlanPart(header('PRs: 2. This is PR B (Tasks 1-7). PR A (`a.md`) is independent.'))).toEqual({ index: 2, of: 2 });
    expect(parsePlanPart(header('PRs: 2. **This plan is PR A**'))).toEqual({ index: 1, of: 2 });
  });

  it('gives no part to a one-PR plan, a PR link, or an Epic position', () => {
    expect(parsePlanPart(header('PRs: 1 (all tasks)'))).toBeUndefined();
    expect(parsePlanPart(header('PRs: 1 — PR 3 of 4.'))).toBeUndefined();
    expect(parsePlanPart(header('PRs: 1, PR C of 4. Starts after A and B.'))).toBeUndefined();
    expect(parsePlanPart(header('PR: https://github.com/o/r/pull/331'))).toBeUndefined();
    expect(parsePlanPart(header('PR: 3 of 2'))).toBeUndefined();
    expect(parsePlanPart(header('PR: 1 of 1'))).toBeUndefined();
    expect(parsePlanPart(header('PRs: 2. This is PR C'))).toBeUndefined();
    expect(parsePlanPart(header(`PR: 1 of ${'9'.repeat(400)}`))).toBeUndefined();
    expect(parsePlanPart(header(`PRs: ${'9'.repeat(400)}. This is PR A`))).toBeUndefined();
  });

  it('reads only the header, never a task body', () => {
    expect(parsePlanPart('# X\n\n## Task 1: A\nPR: 1 of 2\n')).toBeUndefined();
  });
});
