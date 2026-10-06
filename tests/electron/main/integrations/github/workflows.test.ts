// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { parseWorkflow, readWorkflows } from '../../../../../electron/main/integrations/github/workflows';

const CI = `name: CI
on: [push]
jobs:
  install:
    runs-on: ubuntu-latest
  lint:
    name: Lint
    needs: install   # a comment
  unit:
    needs: [install, "lint"]
    strategy:
      matrix:
        node: [18, 20]
        needs: nope
  e2e:
    name: 'e2e \${{ matrix.browser }}'
    needs:
      - unit
      - lint
`;

describe('parseWorkflow', () => {
  it('reads a block needs list at the same indent as its key', () => {
    const def = parseWorkflow('ci.yml', 'jobs:\n  build:\n    needs:\n    - lint\n    - unit\n    name: Build\n  lint:\n    runs-on: x\n');
    expect(def.jobs[0]).toEqual({ id: 'build', name: 'Build', needs: ['lint', 'unit'] });
    expect(def.jobs.map((j) => j.id)).toEqual(['build', 'lint']);
  });

  it('reads the name, each job id, its name and its needs in every shape', () => {
    expect(parseWorkflow('ci.yml', CI)).toEqual({
      file: 'ci.yml',
      name: 'CI',
      jobs: [
        { id: 'install', name: null, needs: [] },
        { id: 'lint', name: 'Lint', needs: ['install'] },
        { id: 'unit', name: null, needs: ['install', 'lint'] },
        { id: 'e2e', name: 'e2e ${{ matrix.browser }}', needs: ['unit', 'lint'] },
      ],
    });
  });

  it('answers no jobs for text that is not a workflow, and never throws', () => {
    expect(parseWorkflow('x.yml', '::: not yaml\n\t- [')).toEqual({ file: 'x.yml', name: null, jobs: [] });
  });
});

describe('readWorkflows', () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'hive-wf-')); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it('reads .yml and .yaml in file-name order', async () => {
    mkdirSync(join(dir, '.github/workflows'), { recursive: true });
    writeFileSync(join(dir, '.github/workflows/preview.yaml'), 'jobs:\n  preview:\n    needs: build\n');
    writeFileSync(join(dir, '.github/workflows/ci.yml'), CI);
    writeFileSync(join(dir, '.github/workflows/notes.md'), 'jobs:\n');
    const defs = await readWorkflows(dir);
    expect(defs.map((d) => d.file)).toEqual(['ci.yml', 'preview.yaml']);
  });

  it('answers [] when there is no workflows directory', async () => {
    await expect(readWorkflows(dir)).resolves.toEqual([]);
  });

  it('skips a file over the size cap', async () => {
    mkdirSync(join(dir, '.github/workflows'), { recursive: true });
    writeFileSync(join(dir, '.github/workflows/big.yml'), `jobs:\n  a: {}\n${'#'.repeat(300 * 1024)}`);
    await expect(readWorkflows(dir)).resolves.toEqual([]);
  });
});
