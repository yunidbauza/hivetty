// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { APP_NAME, DEV_USER_DATA_NAME } from '@shared/app-name';

describe('the app name (HIVE-326)', () => {
  it('is HiveTTY, the identity and the name people read', () => {
    expect(APP_NAME).toBe('HiveTTY');
  });

  it('keeps a dev run out of the packaged userData folder, which APFS matches case-insensitively', () => {
    expect(DEV_USER_DATA_NAME.toLowerCase()).not.toBe(APP_NAME.toLowerCase());
    expect(DEV_USER_DATA_NAME).toBe('hivetty-dev');
  });
});
