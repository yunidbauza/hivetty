// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  app: { isPackaged: true, getPath: () => '/Applications/The Hive.app/Contents/MacOS/The Hive' },
}));

const { probeUpdateCapability, demoteToManual } = await import(
  '../../../../electron/main/updates/capability'
);

const base = {
  packaged: true,
  platform: 'darwin' as NodeJS.Platform,
  bundlePath: '/Applications/The Hive.app',
};

/** What `codesign --display --verbose=2` prints for a Developer ID build. */
const DEVELOPER_ID = `Executable=/Applications/The Hive.app/Contents/MacOS/The Hive
Identifier=dev.yunidbauza.the-hive
Format=app bundle with Mach-O thin (arm64)
Authority=Developer ID Application: Someone (TEAMID)
Authority=Developer ID Certification Authority`;

/** …and for an ad-hoc one, which is what this project actually ships. */
const ADHOC = `Executable=/Applications/The Hive.app/Contents/MacOS/The Hive
Identifier=dev.yunidbauza.the-hive
Format=app bundle with Mach-O thin (arm64)
Signature=adhoc
Info.plist entries=32`;

describe('probeUpdateCapability', () => {
  it('refuses to check at all in a development run', async () => {
    const capability = await probeUpdateCapability({
      ...base,
      packaged: false,
      codesign: vi.fn(),
    });

    expect(capability).toMatchObject({ canCheck: false, mode: 'manual' });
    expect(capability.reason).toContain('development run');
  });

  it('reads a Developer ID as a verified self-install', async () => {
    const capability = await probeUpdateCapability({
      ...base,
      codesign: vi.fn().mockResolvedValue(DEVELOPER_ID),
    });

    expect(capability).toMatchObject({
      canCheck: true,
      mode: 'self-install',
      unverified: false,
    });
  });

  it('reads an ad-hoc signature as a self-install worth attempting, but unverified', async () => {
    // The distinction the whole design rests on: allowed to try, not trusted.
    const capability = await probeUpdateCapability({
      ...base,
      codesign: vi.fn().mockResolvedValue(ADHOC),
    });

    expect(capability).toMatchObject({
      canCheck: true,
      mode: 'self-install',
      unverified: true,
    });
    expect(capability.reason).toContain('ad-hoc signed');
  });

  it('falls back to manual for an unsigned bundle', async () => {
    const capability = await probeUpdateCapability({
      ...base,
      codesign: vi.fn().mockResolvedValue('Executable=/x\ncode object is not signed at all'),
    });

    expect(capability).toMatchObject({ mode: 'manual', canCheck: true });
  });

  it('treats a missing or failing codesign as manual, not as an error', async () => {
    // No Command Line Tools installed is a perfectly ordinary machine, and it
    // must not turn into an error dialog on launch.
    const capability = await probeUpdateCapability({
      ...base,
      codesign: vi.fn().mockRejectedValue(new Error('spawn codesign ENOENT')),
    });

    expect(capability).toMatchObject({ mode: 'manual', canCheck: true });
    expect(capability.reason).toContain('ENOENT');
  });

  it('never reads a signature off a non-mac build', async () => {
    const codesign = vi.fn();
    const capability = await probeUpdateCapability({
      ...base,
      platform: 'win32',
      codesign,
    });

    expect(codesign).not.toHaveBeenCalled();
    expect(capability).toMatchObject({ mode: 'self-install', unverified: false });
  });
});

describe('demoteToManual', () => {
  it('resolves the uncertainty to a no, rather than leaving it open', async () => {
    const before = await probeUpdateCapability({
      ...base,
      codesign: vi.fn().mockResolvedValue(ADHOC),
    });
    const after = demoteToManual(before, 'code signature not valid');

    expect(before.unverified).toBe(true);
    // Not `unverified: true` any more — it has been verified, negatively.
    expect(after).toMatchObject({ mode: 'manual', unverified: false });
    expect(after.reason).toContain('code signature not valid');
  });
});
