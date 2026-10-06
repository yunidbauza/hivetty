import { describe, expect, it } from 'vitest';

import { BAND, classifyLogLine, COL, foldPushes, jobState, layoutGraph, NODE_H, timeText, worst } from '@/lib/checks-graph';
import type { RunJob, WorkflowDef, WorkflowRun } from '@shared/github-contract';

const run = (over: Partial<WorkflowRun>): WorkflowRun => ({
  id: 1, number: 1, attempt: 1, status: 'completed', conclusion: 'success', headSha: 'a', event: 'push',
  workflowName: 'CI', createdAt: '2026-10-03T14:00:00Z', updatedAt: '2026-10-03T14:01:00Z', url: 'u', ...over,
});

describe('jobState', () => {
  it.each([
    ['completed', 'success', 'passed'], ['completed', 'failure', 'failed'], ['completed', 'cancelled', 'failed'],
    ['completed', 'timed_out', 'failed'], ['completed', 'skipped', 'skipped'], ['completed', 'neutral', 'skipped'],
    ['in_progress', null, 'running'], ['queued', null, 'waiting'], ['waiting', null, 'waiting'], ['pending', null, 'waiting'],
  ] as const)('%s + %s is %s', (status, conclusion, state) => {
    expect(jobState(status, conclusion)).toBe(state);
  });

  it('ranks failed over running over waiting over passed over skipped', () => {
    expect(worst(['passed', 'running', 'failed'])).toBe('failed');
    expect(worst(['passed', 'waiting'])).toBe('waiting');
    expect(worst(['skipped', 'passed'])).toBe('passed');
  });
});

describe('foldPushes', () => {
  it('folds runs by head sha, oldest push first, at most eight', () => {
    const runs = Array.from({ length: 10 }, (_, i) => run({ id: 10 - i, number: 10 - i, headSha: `s${String(10 - i)}` }));
    const pushes = foldPushes(runs);
    expect(pushes.map((p) => p.sha)).toEqual(['s3', 's4', 's5', 's6', 's7', 's8', 's9', 's10']);
  });

  it('takes the worst state across a push’s workflows, and the failing run’s number', () => {
    const [push] = foldPushes([
      run({ id: 2, number: 2208, workflowName: 'Preview', headSha: 'x' }),
      run({ id: 1, number: 2207, conclusion: 'failure', headSha: 'x', createdAt: '2026-10-03T13:59:00Z' }),
    ]);
    expect(push).toMatchObject({ sha: 'x', number: 2207, state: 'failed', startedAt: '2026-10-03T13:59:00Z' });
    expect(push?.runs).toHaveLength(2);
  });

  it('keeps only the newest run of each workflow within a push, so a workflow is drawn once (D1)', () => {
    const [push] = foldPushes([
      run({ id: 3, number: 2209, headSha: 'x', createdAt: '2026-10-03T14:02:00Z' }),
      run({ id: 2, number: 2208, workflowName: 'Preview', headSha: 'x' }),
      run({ id: 1, number: 2207, conclusion: 'failure', headSha: 'x', createdAt: '2026-10-03T13:59:00Z' }),
    ]);
    expect(push?.runs.map((r) => r.id)).toEqual([3, 2]);
    expect(push).toMatchObject({ number: 2209, state: 'passed', startedAt: '2026-10-03T14:00:00Z' });
  });

  it('calls a push with a run in flight running', () => {
    expect(foldPushes([run({ status: 'queued', conclusion: null })])[0]?.state).toBe('running');
  });
});

describe('timeText', () => {
  const now = Date.parse('2026-10-03T14:05:00Z');
  it.each([
    ['passed', '2026-10-03T14:00:00Z', '2026-10-03T14:00:38Z', '38s'],
    ['failed', '2026-10-03T14:00:00Z', '2026-10-03T14:03:10Z', 'failed · 3m 10s'],
    ['running', '2026-10-03T14:02:46Z', null, 'running · 2m 14s'],
    ['waiting', null, null, 'waits'],
    ['skipped', null, null, 'skipped'],
    ['failed', null, null, 'failed'],
  ] as const)('%s from %s to %s reads %s', (state, start, end, text) => {
    expect(timeText(state, start, end, now)).toBe(text);
  });
});

describe('classifyLogLine', () => {
  it.each([
    ['  ✓ accepts a corporation (41 ms)', 'muted'],
    ['Tests: 1 failed, 46 passed, 47 total', 'muted'],
    ['  ✕ rejects a Delaware LLC (88 ms)', 'fail'],
    ['FAIL test/integration/fee-rule.spec.ts', 'fail'],
    ['##[error]Process completed with exit code 1.', 'fail'],
    ['    > 84 |     .toBe(422);', 'fail'],
    ['    expect(received).toBe(expected)', 'plain'],
  ] as const)('%s is %s', (line, tone) => {
    expect(classifyLogLine(line)).toBe(tone);
  });
});

const job = (id: number, name: string, over: Partial<RunJob> = {}): RunJob => ({
  id, runId: 1, name, status: 'completed', conclusion: 'success', startedAt: '2026-10-03T14:00:00Z',
  completedAt: '2026-10-03T14:00:38Z', url: `https://x/${String(id)}`, steps: [], ...over,
});
const wf = (file: string, jobs: [string, string[], string?][], name: string | null = 'CI'): WorkflowDef =>
  ({ file, name, jobs: jobs.map(([id, needs, label]) => ({ id, needs, name: label ?? null })) });
const NOW = Date.parse('2026-10-03T14:05:00Z');
const at = (graph: ReturnType<typeof layoutGraph>, key: string) => graph.nodes.find((n) => n.key === key);
const col = (graph: ReturnType<typeof layoutGraph>, key: string) => (at(graph, key)?.x ?? -1) / COL;

describe('layoutGraph', () => {
  const ci = wf('ci.yml', [['install', []], ['lint', ['install']], ['unit', ['install']], ['build', ['lint', 'unit']]]);
  const runs = [run({ id: 1, workflowName: 'CI' })];
  const jobs = { 1: [job(11, 'install'), job(12, 'lint'), job(13, 'unit'), job(14, 'build')] };

  it('puts each job in the column of its longest needs chain: a fan-out then a fan-in', () => {
    const graph = layoutGraph([ci], runs, jobs, new Set(), NOW);
    expect([col(graph, 'install'), col(graph, 'lint'), col(graph, 'unit'), col(graph, 'build')]).toEqual([0, 1, 1, 2]);
  });

  it('centres a column in the band, ninety apart', () => {
    const graph = layoutGraph([ci], runs, jobs, new Set(), NOW);
    expect(at(graph, 'install')?.y).toBe(BAND / 2 - NODE_H / 2);
    expect([at(graph, 'lint')?.y, at(graph, 'unit')?.y]).toEqual([BAND / 2 - 45 - 24, BAND / 2 + 45 - 24]);
    expect(graph.height).toBe(BAND);
    expect(graph.width).toBe(2 * COL + 160);
  });

  it('draws an edge from x+150 to x as a cubic with 36px handles, coloured by its target', () => {
    const failing = { 1: [job(11, 'install'), job(12, 'lint', { conclusion: 'failure' }), job(13, 'unit', { status: 'in_progress', conclusion: null, completedAt: null }), job(14, 'build', { status: 'queued', conclusion: null })] };
    const graph = layoutGraph([ci], runs, failing, new Set(), NOW);
    const edge = graph.edges.find((e) => e.key === 'install>lint');
    expect(edge?.d).toBe(`M150 150 C186 150, 164 ${String(150 - 45)}, 200 ${String(150 - 45)}`);
    expect(Object.fromEntries(graph.edges.map((e) => [e.key, e.state]))).toMatchObject({
      'install>lint': 'bad', 'install>unit': 'flow', 'lint>build': 'wait', 'unit>build': 'wait',
    });
  });

  it('lays out a job with no needs, a missing need and a cycle without crashing', () => {
    const odd = wf('ci.yml', [['a', ['b']], ['b', ['a']], ['c', ['ghost']], ['d', []]]);
    const graph = layoutGraph([odd], runs, { 1: [] }, new Set(), NOW);
    expect(graph.nodes.map((n) => n.key).sort()).toEqual(['a', 'b', 'c', 'd']);
    expect(col(graph, 'c')).toBe(0);
    expect(graph.nodes.every((n) => n.state === 'waiting' && n.time === 'waits')).toBe(true);
    expect(graph.edges.every((e) => !e.key.includes('ghost'))).toBe(true);
  });

  it('folds matrix legs into one box in the worst state, and opens it into its legs', () => {
    const matrix = wf('ci.yml', [['unit', []], ['report', ['unit']]]);
    const legs = { 1: [...Array.from({ length: 5 }, (_, i) => job(20 + i, `unit (${String(i)})`)), job(30, 'unit (5)', { conclusion: 'failure' }), job(31, 'report')] };
    const folded = layoutGraph([matrix], runs, legs, new Set(), NOW);
    expect(at(folded, 'unit')).toMatchObject({ count: 6, state: 'failed', matrix: 'unit', jobId: null });
    const open = layoutGraph([matrix], runs, legs, new Set(['unit']), NOW);
    expect(open.nodes.filter((n) => n.key.startsWith('unit#'))).toHaveLength(6);
    expect(open.edges.filter((e) => e.key.endsWith('>report'))).toHaveLength(6);
  });

  it('matches a job named by an expression on the text before it', () => {
    const named = wf('ci.yml', [['e2e', [], 'e2e ${{ matrix.browser }}']]);
    const graph = layoutGraph([named], runs, { 1: [job(40, 'e2e chromium')] }, new Set(), NOW);
    expect(at(graph, 'e2e')).toMatchObject({ jobId: 40, state: 'passed' });
  });

  it('groups a second workflow in a box past the first, with no edge between them', () => {
    const preview = wf('preview.yml', [['preview', []]], 'Preview');
    const both = [run({ id: 1, workflowName: 'CI' }), run({ id: 2, workflowName: 'Preview' })];
    const graph = layoutGraph([ci, preview], both, { ...jobs, 2: [job(50, 'preview', { runId: 2 })] }, new Set(), NOW);
    expect(col(graph, 'preview')).toBe(3);
    expect(graph.groups).toEqual([{ file: 'preview.yml', x: 3 * COL - 8, y: BAND / 2 - 24 - 8, w: 176, h: 64 }]);
    expect(graph.files).toEqual(['ci.yml', 'preview.yml']);
    expect(graph.edges.some((e) => e.key.includes('preview'))).toBe(false);
  });

  it('lays out one workflow once when a push ran it twice (push and pull_request)', () => {
    const twice = [run({ id: 1, workflowName: 'CI', event: 'pull_request' }), run({ id: 2, workflowName: 'CI', event: 'push' })];
    const graph = layoutGraph([ci], twice, { 1: jobs[1], 2: jobs[1].map((j) => ({ ...j, id: j.id + 100, runId: 2 })) }, new Set(), NOW);
    const keys = graph.nodes.map((n) => n.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toHaveLength(4);
    expect(new Set(graph.edges.map((e) => e.key)).size).toBe(graph.edges.length);
  });

  it('keeps node and edge keys unique when two workflows name a job alike', () => {
    const other = wf('other.yml', [['install', []], ['lint', ['install']]], 'Other');
    const both = [run({ id: 1, workflowName: 'CI' }), run({ id: 2, workflowName: 'Other' })];
    const graph = layoutGraph([ci, other], both, { ...jobs, 2: [job(70, 'install', { runId: 2 }), job(71, 'lint', { runId: 2 })] }, new Set(), NOW);
    const keys = graph.nodes.map((n) => n.key);
    expect(keys).toHaveLength(6);
    expect(new Set(keys).size).toBe(6);
    expect(new Set(graph.edges.map((e) => e.key)).size).toBe(graph.edges.length);
    expect(at(graph, 'install')?.x).toBe(0);
  });

  it('orders workflows by file name, whatever order their runs arrive in, so the same one is always boxed', () => {
    const preview = wf('preview.yml', [['preview', []]], 'Preview');
    const previewFirst = [run({ id: 2, workflowName: 'Preview' }), run({ id: 1, workflowName: 'CI' })];
    const graph = layoutGraph([ci, preview], previewFirst, { ...jobs, 2: [job(50, 'preview', { runId: 2 })] }, new Set(), NOW);
    expect(graph.files).toEqual(['ci.yml', 'preview.yml']);
    expect(graph.groups.map((g) => g.file)).toEqual(['preview.yml']);
    expect(col(graph, 'install')).toBe(0);
  });

  it('opens matrix legs in name order, numbers counted as numbers', () => {
    const matrix = wf('ci.yml', [['unit', []]]);
    const legs = { 1: [job(21, 'unit (10)'), job(22, 'unit (3)'), job(23, 'unit (1)'), job(24, 'unit (2)')] };
    const open = layoutGraph([matrix], runs, legs, new Set(['unit']), NOW);
    expect(open.nodes.map((n) => n.label)).toEqual(['unit (1)', 'unit (2)', 'unit (3)', 'unit (10)']);
  });

  it('draws jobs from a run with no workflow file as boxes without edges', () => {
    const graph = layoutGraph([], [run({ id: 1, workflowName: '.github/workflows/gone.yml' })], { 1: [job(60, 'lint'), job(61, 'unit')] }, new Set(), NOW);
    expect(graph.nodes.map((n) => [n.label, n.x])).toEqual([['lint', 0], ['unit', 0]]);
    expect(graph.edges).toEqual([]);
  });

  it('gives a running job its steps as progress', () => {
    const steps = [1, 2, 3, 4].map((number) => ({ number, name: `s${String(number)}`, status: number <= 1 ? 'completed' : 'queued', conclusion: null, startedAt: null, completedAt: null }));
    const graph = layoutGraph([ci], runs, { 1: [job(11, 'install', { status: 'in_progress', conclusion: null, completedAt: null, steps })] }, new Set(), NOW);
    expect(at(graph, 'install')?.progress).toBe(0.25);
  });
});
