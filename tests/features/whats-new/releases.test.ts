import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { majorMinor, RELEASES, whatsNewFor } from '@features/whats-new/releases';

const shown = { seen: null, off: false, fresh: false };

describe('majorMinor', () => {
  it('drops the patch, so 1.0.3 is 1.0', () => {
    expect(majorMinor('1.0.3')).toBe('1.0');
    expect(majorMinor('2.4.0-beta.1')).toBe('2.4');
  });
});

describe('whatsNewFor', () => {
  it('shows 1.0 to someone arriving on any 1.0.x who has not seen it', () => {
    expect(whatsNewFor('1.0.0', shown)?.version).toBe('1.0');
    expect(whatsNewFor('1.0.3', { ...shown, seen: '0.15' })?.version).toBe('1.0');
  });

  it('shows nothing once that version was seen', () => {
    expect(whatsNewFor('1.0.2', { ...shown, seen: '1.0' })).toBeNull();
  });

  it('shows nothing for a release without an entry, or after the opt-out, or on a fresh install', () => {
    expect(whatsNewFor('1.1.0', shown)).toBeNull();
    expect(whatsNewFor('1.0.0', { ...shown, off: true })).toBeNull();
    expect(whatsNewFor('1.0.0', { ...shown, fresh: true })).toBeNull();
  });
});

describe('RELEASES', () => {
  it('gives 1.0 its three slides', () => {
    const entry = RELEASES.find((r) => r.version === '1.0');
    expect(entry?.slides.map((s) => s.title)).toEqual([
      'Home is the comb',
      'Jira, from ticket to Done',
      'Pull requests, without leaving',
    ]);
  });

  /** Every major ships with an entry: a new x.0 with nothing to say fails here, before it ships. */
  it('has an entry for the version in package.json when it is a major', () => {
    const { version } = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as { version: string };
    const [major, minor] = version.split('.').map(Number) as [number, number];
    if (major >= 1 && minor === 0) expect(RELEASES.some((r) => r.version === majorMinor(version))).toBe(true);
  });
});
