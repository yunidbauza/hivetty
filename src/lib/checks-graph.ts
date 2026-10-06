import { formatDuration } from '@/lib/format-duration';

import type { RunJob, WorkflowDef, WorkflowJobDef, WorkflowRun } from '@shared/github-contract';

/**
 * The Checks tab's pure math (HIVE-206): job states, runs folded into pushes,
 * time captions, log line tones, and the job graph's layout. No React; the
 * store's selectors and the components both read it.
 */

export type JobState = 'passed' | 'failed' | 'running' | 'waiting' | 'skipped';
export type PushState = 'passed' | 'failed' | 'running';

/** One push: every workflow run of one head sha. `startedAt` is its earliest run. */
export interface Push { sha: string; number: number; state: PushState; runs: WorkflowRun[]; startedAt: string }

export function jobState(status: string, conclusion: string | null): JobState {
  if (status === 'in_progress') return 'running';
  if (status !== 'completed') return 'waiting';
  if (conclusion === 'success') return 'passed';
  if (conclusion === 'skipped' || conclusion === 'neutral') return 'skipped';
  return 'failed';
}

const RANK: Record<JobState, number> = { skipped: 0, passed: 1, waiting: 2, running: 3, failed: 4 };

export const worst = (states: readonly JobState[]): JobState =>
  states.reduce<JobState>((acc, state) => (RANK[state] > RANK[acc] ? state : acc), 'skipped');

/**
 * Runs (newest first, as `gh run list` gives them) folded by head sha: the last
 * `max` pushes, oldest first (D1). A workflow run twice on one push keeps only
 * its newest run, so each workflow file is drawn once.
 */
export function foldPushes(runs: readonly WorkflowRun[], max = 8): Push[] {
  const bySha = new Map<string, WorkflowRun[]>();
  for (const one of runs) {
    const group = bySha.get(one.headSha) ?? [];
    if (!group.some((r) => r.workflowName === one.workflowName)) bySha.set(one.headSha, [...group, one]);
  }
  return [...bySha]
    .slice(0, max)
    .map(([sha, group]): Push => {
      const state = worst(group.map((r) => jobState(r.status, r.conclusion)));
      const failing = group.find((r) => jobState(r.status, r.conclusion) === 'failed');
      return {
        sha,
        number: (failing ?? group[0])?.number ?? 0,
        state: state === 'failed' ? 'failed' : state === 'running' || state === 'waiting' ? 'running' : 'passed',
        runs: group,
        startedAt: group.map((r) => r.createdAt).sort()[0] ?? '',
      };
    })
    .reverse();
}

/** "38s", "failed · 3m 10s", "running · 2m 14s", "waits", "skipped". */
export function timeText(state: JobState, startedAt: string | null, completedAt: string | null, now: number): string {
  if (state === 'waiting') return 'waits';
  if (state === 'skipped') return 'skipped';
  const start = startedAt === null ? Number.NaN : Date.parse(startedAt);
  const end = completedAt === null ? now : Date.parse(completedAt);
  const took = Number.isNaN(start) || Number.isNaN(end) ? '' : formatDuration(end - start);
  if (state === 'passed') return took;
  const word = state === 'failed' ? 'failed' : 'running';
  return took === '' ? word : `${word} · ${took}`;
}

export type LogTone = 'muted' | 'fail' | 'plain';

/* A copy of main's `log-cut.ts` marker: `src/` cannot import main. Change both. */
const FAILURE = /✕|✗|\bFAIL\b|\bError\b|##\[error\]/;
const PASS = /^\s*(✓|√)/;
const SUMMARY = /^\s*(Tests?|Test Files|Test Suites):/;
const SOURCE_MARK = /^\s*>\s*\d+\s*\|/;

/** A log line's tone: passing lines and the summary muted, the failure and its marked source line red. */
export function classifyLogLine(line: string): LogTone {
  if (PASS.test(line) || SUMMARY.test(line)) return 'muted';
  if (FAILURE.test(line) || SOURCE_MARK.test(line)) return 'fail';
  return 'plain';
}

export const NODE_W = 160;
export const NODE_H = 48;
export const COL = 200;
export const ROW = 90;
export const BAND = 300;
/** An edge leaves under the box's right end (the artifact's W = 150) and bends on 36px handles. */
const EDGE_OUT = 150;
const HANDLE = 36;
const GROUP_PAD = 8;

export type EdgeState = 'ok' | 'bad' | 'wait' | 'flow';
export interface GraphNode {
  key: string; label: string; x: number; y: number; state: JobState; time: string;
  progress: number | null; jobId: number | null; count: number; matrix: string | null;
}
export interface GraphEdge { key: string; d: string; state: EdgeState }
export interface GraphGroup { file: string; x: number; y: number; w: number; h: number }
export interface ChecksGraph { nodes: GraphNode[]; edges: GraphEdge[]; groups: GraphGroup[]; files: string[]; width: number; height: number }

const EDGE_OF: Record<JobState, EdgeState> = { passed: 'ok', failed: 'bad', running: 'flow', waiting: 'wait', skipped: 'wait' };

/** Longest `needs` chain per job id; a missing need is ignored and a cycle is cut at its back edge. */
function depths(defs: readonly WorkflowJobDef[]): Map<string, number> {
  const byId = new Map(defs.map((def) => [def.id, def]));
  const memo = new Map<string, number>();
  const visit = (id: string, stack: Set<string>): number => {
    const known = memo.get(id);
    if (known !== undefined) return known;
    if (stack.has(id)) return -1;
    stack.add(id);
    let depth = 0;
    for (const need of byId.get(id)?.needs ?? []) if (byId.has(need)) depth = Math.max(depth, visit(need, stack) + 1);
    stack.delete(id);
    memo.set(id, depth);
    return depth;
  };
  for (const def of defs) visit(def.id, new Set());
  return memo;
}

/** The gh jobs a definition ran as: its display name, a matrix leg `name (…)`, or text before a `${{`. */
function claims(def: WorkflowJobDef, name: string): boolean {
  const display = def.name ?? def.id;
  const cut = display.indexOf('${{');
  if (cut !== -1) {
    const prefix = display.slice(0, cut).trim();
    return prefix !== '' && name.startsWith(prefix);
  }
  return name === display || name.startsWith(`${display} (`);
}

interface Unit { def: WorkflowJobDef; legs: RunJob[] }
interface Placed { node: GraphNode; defId: string; col: number }

function nodeOf(key: string, label: string, legs: readonly RunJob[], now: number, matrix: string | null): GraphNode {
  const states = legs.map((leg) => jobState(leg.status, leg.conclusion));
  const state = legs.length === 0 ? 'waiting' : worst(states);
  const shown = legs.find((leg) => jobState(leg.status, leg.conclusion) === state) ?? legs[0];
  const steps = shown?.steps ?? [];
  return {
    key, label, x: 0, y: 0, state,
    time: timeText(state, shown?.startedAt ?? null, shown?.completedAt ?? null, now),
    progress: state === 'running' && steps.length > 0 ? steps.filter((s) => s.status === 'completed').length / steps.length : null,
    jobId: matrix === null && legs.length === 1 ? (legs[0]?.id ?? null) : null,
    count: legs.length > 1 ? legs.length : 1,
    matrix,
  };
}

export function layoutGraph(
  workflows: readonly WorkflowDef[],
  runs: readonly WorkflowRun[],
  jobsByRun: Readonly<Record<number, RunJob[]>>,
  expanded: ReadonlySet<string>,
  now: number,
): ChecksGraph {
  const sections: { file: string; placed: Placed[]; needs: Map<string, string[]> }[] = [];
  let base = 0;

  const flowOf = (one: WorkflowRun) => workflows.find((w) => w.name === one.workflowName || one.workflowName.endsWith(w.file));
  const fileOf = (one: WorkflowRun) => flowOf(one)?.file ?? one.workflowName;
  /*
    `runs` is newest first: a workflow that ran twice for one sha (push and
    pull_request) is drawn once, from its newest run. Then by file name, so the
    first (unboxed) workflow does not change with the order runs arrive in.
  */
  const chosen = runs
    .filter((one, i) => runs.findIndex((other) => other.workflowName === one.workflowName) === i)
    .sort((a, b) => fileOf(a).localeCompare(fileOf(b)));
  const seenKeys = new Set<string>();
  for (const one of chosen) {
    const flow = flowOf(one);
    const pool = [...(jobsByRun[one.id] ?? [])];
    const defs = flow?.jobs ?? [];
    const units: Unit[] = defs.map((def) => {
      /* Name order, numbers as numbers: GitHub lists matrix legs in no particular order. */
      const legs = pool.filter((j) => claims(def, j.name)).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
      for (const leg of legs) pool.splice(pool.indexOf(leg), 1);
      return { def, legs };
    });
    for (const free of pool) units.push({ def: { id: `job-${String(free.id)}`, name: free.name, needs: [] }, legs: [free] });

    const depth = depths(units.map((u) => u.def));
    const placed: Placed[] = [];
    for (const { def, legs } of units) {
      const col = base + (depth.get(def.id) ?? 0);
      const label = def.name ?? def.id;
      if (legs.length > 1 && !expanded.has(def.id)) placed.push({ node: nodeOf(def.id, label, legs, now, def.id), defId: def.id, col });
      else if (legs.length > 1) for (const leg of legs) placed.push({ node: nodeOf(`${def.id}#${String(leg.id)}`, leg.name, [leg], now, null), defId: def.id, col });
      else placed.push({ node: nodeOf(def.id, legs[0]?.name ?? label, legs, now, null), defId: def.id, col });
    }
    /* Two workflows may name a job alike: the later one's keys carry its file. */
    for (const p of placed) {
      if (seenKeys.has(p.node.key)) p.node.key = `${flow?.file ?? one.workflowName}:${p.node.key}`;
    }
    for (const p of placed) seenKeys.add(p.node.key);
    sections.push({ file: flow?.file ?? one.workflowName, placed, needs: new Map(units.map((u) => [u.def.id, u.def.needs])) });
    base += Math.max(0, ...placed.map((p) => p.col - base)) + 1;
  }

  const columns = new Map<number, Placed[]>();
  for (const p of sections.flatMap((s) => s.placed)) columns.set(p.col, [...(columns.get(p.col) ?? []), p]);
  const height = Math.max(BAND, ...[...columns.values()].map((c) => c.length * ROW));
  for (const [c, list] of columns) {
    list.forEach((p, i) => {
      p.node.x = c * COL;
      p.node.y = height / 2 + (i - (list.length - 1) / 2) * ROW - NODE_H / 2;
    });
  }

  const edges: GraphEdge[] = [];
  for (const section of sections) {
    for (const target of section.placed) {
      for (const need of section.needs.get(target.defId) ?? []) {
        for (const source of section.placed.filter((p) => p.defId === need && p.col < target.col)) {
          const x1 = source.node.x + EDGE_OUT;
          const y1 = source.node.y + NODE_H / 2;
          const x2 = target.node.x;
          const y2 = target.node.y + NODE_H / 2;
          edges.push({
            key: `${source.node.key}>${target.node.key}`,
            d: `M${String(x1)} ${String(y1)} C${String(x1 + HANDLE)} ${String(y1)}, ${String(x2 - HANDLE)} ${String(y2)}, ${String(x2)} ${String(y2)}`,
            state: EDGE_OF[target.node.state],
          });
        }
      }
    }
  }

  const groups = sections.slice(1).filter((s) => s.placed.length > 0).map((s): GraphGroup => {
    const xs = s.placed.map((p) => p.node.x);
    const ys = s.placed.map((p) => p.node.y);
    const x = Math.min(...xs) - GROUP_PAD;
    const y = Math.min(...ys) - GROUP_PAD;
    return { file: s.file, x, y, w: Math.max(...xs) + NODE_W + GROUP_PAD - x, h: Math.max(...ys) + NODE_H + GROUP_PAD - y };
  });

  const nodes = sections.flatMap((s) => s.placed.map((p) => p.node));
  const width = nodes.length === 0 ? 0 : Math.max(...nodes.map((n) => n.x)) + NODE_W;
  return { nodes, edges, groups, files: [...new Set(sections.map((s) => s.file))], width, height };
}
