import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createClaudeRecord } from '../../../../../electron/main/harness/claude-code/record';
import { claudeProjectDir } from '../../../../../electron/main/harness/claude-code/title-origin';

describe('the Claude Code record (HIVE-239)', () => {
  const CWD = '/repo/app';
  let home: string;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'hive-record-'));
  });
  afterEach(() => rmSync(home, { recursive: true, force: true }));

  const write = (uuid: string, lines: string[]) => {
    const dir = join(home, '.claude', 'projects', claudeProjectDir(CWD));
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${uuid}.jsonl`), lines.join('\n'));
    return join(dir, `${uuid}.jsonl`);
  };

  it('finds the transcript under the home it was given', () => {
    const path = write('u1', ['{}']);
    expect(createClaudeRecord(home).transcriptPath(CWD, 'u1')).toBe(path);
  });

  it('has a transcript only when one was written', () => {
    write('u1', ['{}']);
    const record = createClaudeRecord(home);
    expect(record.hasTranscript(CWD, 'u1')).toBe(true);
    expect(record.hasTranscript(CWD, 'u2')).toBe(false);
  });

  it("reads a title's origin from the transcript", () => {
    write('u1', [JSON.stringify({ type: 'custom-title', customTitle: 'mine' })]);
    const record = createClaudeRecord(home);
    expect(record.titleOrigin(CWD, 'u1', 'mine')).toBe('rename');
    expect(record.titleOrigin(CWD, 'u1', 'other')).toBe('unknown');
  });

  it("spells Claude's unnamed title as no name", () => {
    expect(createClaudeRecord(home).nameFromTitle('✳ Claude Code')).toBe('');
    expect(createClaudeRecord(home).nameFromTitle('✳ sess-07')).toBe('sess-07');
  });
});
