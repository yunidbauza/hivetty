import { describe, expect, it } from 'vitest';

import { DEFAULT_INPUT_PROFILE, inputProfileFor } from '@lib/harness/input-profile';
import {
  LINE_KILL_SEQUENCE,
  LINE_MOTION_SEQUENCE,
  NEWLINE_SEQUENCE,
  claimBareBack,
} from '@lib/terminal/keymap';

describe('input profiles (HIVE-240)', () => {
  it('makes the default profile exactly the keys the terminal has always sent', () => {
    expect(DEFAULT_INPUT_PROFILE.newline).toBe(NEWLINE_SEQUENCE);
    expect(DEFAULT_INPUT_PROFILE.lineKill).toBe(LINE_KILL_SEQUENCE);
    expect(DEFAULT_INPUT_PROFILE.lineMotion).toBe(LINE_MOTION_SEQUENCE);
    expect(DEFAULT_INPUT_PROFILE.claimsBareBack).toBe(claimBareBack);
  });

  it('gives Claude Code the default, and the default to anything no harness drives', () => {
    expect(inputProfileFor('claude-code')).toBe(DEFAULT_INPUT_PROFILE);
    expect(inputProfileFor(undefined)).toBe(DEFAULT_INPUT_PROFILE);
  });
});
