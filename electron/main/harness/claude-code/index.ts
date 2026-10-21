import type { HarnessAdapter } from '../port';

/** Adapter #1. Empty in phase 1's first story; HIVE-234 onward fills it. */
export const claudeCodeAdapter: HarnessAdapter = {
  id: 'claude-code',
  capabilities: {},
};
