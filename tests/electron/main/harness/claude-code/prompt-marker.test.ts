// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { claudeCodeAdapter } from '../../../../../electron/main/harness/claude-code';
import { promptMarker } from '../../../../../electron/main/harness/claude-code/prompt-marker';
import { ledgerMarker, type LedgerEntry } from '../../../../../electron/shared/ledger-contract';

const entry: LedgerEntry = {
  id: '20261021-120000-0001',
  ts: 0,
  ref: 'k7',
  from: 'overmind',
  to: 'sess-a',
  kind: 'ask',
  body: 'which branch?',
};

describe('promptMarker (HIVE-240)', () => {
  it('types the ledger marker and the carriage return that submits it', () => {
    expect(promptMarker(entry)).toBe(`${ledgerMarker(entry)}\r`);
    expect(promptMarker(entry)).not.toContain('which branch?');
  });

  it('is what Claude Code declares, as a prompt-marker harness', () => {
    expect(claudeCodeAdapter.promptMarker).toBe(promptMarker);
    expect(claudeCodeAdapter.capabilities.contextDelivery).toBe('prompt-marker');
  });
});
