// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { cutLog } from '../../../../../electron/main/integrations/github/log-cut';

const P = 'integration\tRun integration tests\t2026-10-03T14:06:01.1234567Z ';
const log = (lines: string[]) => lines.map((l) => P + l).join('\n');

describe('cutLog', () => {
  it('strips gh’s job, step and timestamp prefix and ANSI colour', () => {
    expect(cutLog(log(['\u001b[31mhello\u001b[0m'])).lines).toEqual(['hello']);
  });

  it('keeps five lines above the first failure marker and sixty below', () => {
    const lines = [...Array.from({ length: 100 }, (_, i) => `ok ${String(i)}`), '  ✕ rejects an LLC (88 ms)', ...Array.from({ length: 100 }, (_, i) => `after ${String(i)}`)];
    const cut = cutLog(log(lines));
    expect(cut.lines[0]).toBe('ok 95');
    expect(cut.lines[5]).toBe('  ✕ rejects an LLC (88 ms)');
    expect(cut.lines).toHaveLength(66);
    expect(cut.truncated).toBe(true);
  });

  it('appends a summary line the window missed, after an ellipsis', () => {
    const lines = ['FAIL test/a.spec.ts', ...Array.from({ length: 100 }, () => 'noise'), 'Tests: 1 failed, 46 passed, 47 total'];
    const cut = cutLog(log(lines));
    expect(cut.lines.slice(-2)).toEqual(['…', 'Tests: 1 failed, 46 passed, 47 total']);
  });

  it('falls back to the last eighty lines when nothing failed by name', () => {
    const cut = cutLog(log(Array.from({ length: 200 }, (_, i) => `line ${String(i)}`)));
    expect(cut.lines).toHaveLength(80);
    expect(cut.lines[0]).toBe('line 120');
  });

  it('caps the kept text at 64 KB from the front', () => {
    const cut = cutLog(log(['Error: boom', ...Array.from({ length: 60 }, () => 'x'.repeat(2000))]));
    expect(cut.lines.join('\n').length).toBeLessThanOrEqual(64 * 1024);
    expect(cut.truncated).toBe(true);
  });

  it('keeps a short log whole', () => {
    expect(cutLog(log(['a', 'b']))).toEqual({ lines: ['a', 'b'], truncated: false });
  });

  describe('a whole-job log from the REST endpoint', () => {
    const T = '2026-10-03T16:41:35.2964790Z ';
    const rest = (lines: string[]) => `\uFEFF${lines.map((line) => T + line).join('\n')}\n`;
    const LOG = rest([
      'Current runner version: 2.337.0',
      '##[group]Run pnpm install',
      'pnpm install',
      '##[endgroup]',
      'npm warn Error-ish noise from an earlier step',
      '##[group]Run pnpm test',
      '\u001b[36;1mecho "  ✕ the echoed script, not the output"\u001b[0m',
      'shell: /usr/bin/bash -e {0}',
      '##[endgroup]',
      '  ✓ passes (1 ms)',
      '  ✕ fails (2 ms)',
      'Tests: 1 failed, 1 passed, 2 total',
      '##[error]Process completed with exit code 1.',
      '##[group]Run actions/upload-artifact',
      'a later step',
      '##[endgroup]',
    ]);

    it('strips the BOM and timestamps, and cuts to the failed step’s output past its echoed script', () => {
      expect(cutLog(LOG)).toEqual({
        lines: ['  ✓ passes (1 ms)', '  ✕ fails (2 ms)', 'Tests: 1 failed, 1 passed, 2 total', '##[error]Process completed with exit code 1.'],
        truncated: true,
      });
    });

    it('cuts to the last failed step when an earlier continue-on-error step also errored', () => {
      const cut = cutLog(
        rest([
          '##[group]Run pnpm audit',
          'pnpm audit',
          '##[endgroup]',
          'Error: advisory noise (continue-on-error)',
          '##[error]Process completed with exit code 1.',
          '##[group]Run pnpm test',
          'pnpm test',
          '##[endgroup]',
          '  ✕ the real failure (2 ms)',
          '##[error]Process completed with exit code 1.',
        ]),
      );
      expect(cut.lines).toEqual(['  ✕ the real failure (2 ms)', '##[error]Process completed with exit code 1.']);
    });

    it('keeps the whole job when nothing failed by name', () => {
      expect(cutLog(rest(['##[group]Run true', 'true', '##[endgroup]', 'ok'])).lines).toEqual(['##[group]Run true', 'true', '##[endgroup]', 'ok']);
    });
  });
});
