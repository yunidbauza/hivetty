import type { HarnessAdapter } from '../port';

import { launch } from './launch';

/** Adapter #1. `launch` arrived with HIVE-234; later stories add the rest. */
export const claudeCodeAdapter: HarnessAdapter = {
  id: 'claude-code',
  capabilities: {},
  launch,
};
