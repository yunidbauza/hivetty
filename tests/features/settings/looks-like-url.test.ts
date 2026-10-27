import { describe, expect, it } from 'vitest';

import { looksLikeUrl } from '@features/settings/looks-like-url';

describe('looksLikeUrl', () => {
  it.each([
    'https://github.com/acme/nova.git',
    'HTTPS://github.com/acme/nova',
    'http:',
    'ssh://git@github.com/acme/nova.git',
    'git://example.com/x.git',
    'file:///tmp/remote.git',
    '  git@github.com:acme/nova.git',
  ])('treats %s as a URL', (value) => {
    expect(looksLikeUrl(value)).toBe(true);
  });

  it.each(['', 'nova', 'acme/nova', 'hive-team', 'git', 'cyle home'])(
    'treats %s as a search',
    (value) => {
      expect(looksLikeUrl(value)).toBe(false);
    },
  );
});
