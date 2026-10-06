import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

import type { WorkflowDef, WorkflowJobDef } from '../../../shared/github-contract';

/**
 * The workflow files' job graph (HIVE-206), read without a YAML parser.
 *
 * Reads three things and nothing else: the top-level `name:`, each job id under
 * `jobs:`, and per job its `name:` and `needs:` (a scalar, a flow list or a
 * block list). It executes nothing and expands nothing: `${{ … }}` stays text.
 * Anything it does not understand is skipped, so a file it cannot read costs
 * that file's edges, never an error.
 */

const MAX_FILES = 20;
const MAX_BYTES = 256 * 1024;

const indentOf = (line: string): number => line.length - line.trimStart().length;
/** A value without its comment and quotes. A `#` inside quotes is kept. */
function scalar(raw: string): string {
  const value = raw.trim();
  if (value.startsWith('"') || value.startsWith("'")) {
    const end = value.indexOf(value[0] ?? '', 1);
    return end === -1 ? value.slice(1) : value.slice(1, end);
  }
  const hash = value.search(/\s#/);
  return (hash === -1 ? value : value.slice(0, hash)).trim();
}
const list = (raw: string): string[] =>
  scalar(raw).replace(/^\[|\]$/g, '').split(',').map(scalar).filter((item) => item !== '');

export function parseWorkflow(file: string, text: string): WorkflowDef {
  const lines = text.split(/\r?\n/);
  let name: string | null = null;
  const jobs: WorkflowJobDef[] = [];
  let inJobs = false;
  let jobIndent = -1;
  let job: WorkflowJobDef | null = null;
  let blockNeeds = -1;
  let keyIndent = -1;

  for (const line of lines) {
    if (line.trim() === '' || line.trimStart().startsWith('#')) continue;
    const indent = indentOf(line);
    const body = line.trim();

    if (indent === 0) {
      inJobs = body === 'jobs:';
      job = null;
      blockNeeds = -1;
      if (body.startsWith('name:')) name = scalar(body.slice(5)) || null;
      continue;
    }
    if (!inJobs) continue;

    if (jobIndent === -1 || indent === jobIndent) {
      const id = /^([A-Za-z_][A-Za-z0-9_-]*):\s*(\{\})?$/.exec(body);
      if (id !== null) {
        jobIndent = indent;
        job = { id: id[1] ?? '', name: null, needs: [] };
        jobs.push(job);
        blockNeeds = -1;
        keyIndent = -1;
        continue;
      }
    }
    if (job === null || indent <= jobIndent) continue;

    if (blockNeeds !== -1 && indent >= blockNeeds && body.startsWith('- ')) {
      job.needs.push(scalar(body.slice(2)));
      continue;
    }
    blockNeeds = -1;

    /* Only the job's own keys, one level in: `strategy.matrix.needs` is not a need. The first key fixes the level. */
    if (keyIndent === -1) keyIndent = indent;
    if (indent !== keyIndent) continue;
    if (body.startsWith('name:')) job.name = scalar(body.slice(5)) || null;
    else if (body === 'needs:') blockNeeds = indent;
    else if (body.startsWith('needs:')) job.needs = list(body.slice(6));
  }
  return { file, name, jobs };
}

export async function readWorkflows(checkout: string): Promise<WorkflowDef[]> {
  const dir = join(checkout, '.github', 'workflows');
  let names: string[];
  try {
    names = (await readdir(dir)).filter((n) => /\.ya?ml$/.test(n)).sort().slice(0, MAX_FILES);
  } catch {
    return [];
  }
  const defs: WorkflowDef[] = [];
  for (const file of names) {
    try {
      const path = join(dir, file);
      if ((await stat(path)).size > MAX_BYTES) continue;
      defs.push(parseWorkflow(file, await readFile(path, 'utf8')));
    } catch {
      /* unreadable: this file has no edges */
    }
  }
  return defs;
}
