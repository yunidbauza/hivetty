import { describe, expect, it } from 'vitest';

import type { UserRepo } from '@shared/github-contract';

import { filterRepos, REPO_LIMIT } from '@features/settings/filter-repos';

const repo = (slug: string): UserRepo => {
  const [owner, name] = slug.split('/');
  return {
    owner,
    name,
    url: `https://github.com/${slug}.git`,
    isPrivate: false,
    isFork: false,
    isArchived: false,
    pushedAt: '2026-10-22T00:00:00Z',
    isProject: false,
  };
};

const names = (result: ReturnType<typeof filterRepos>): string[] =>
  result.rows.map((row) => `${row.repo.owner}/${row.repo.name}`);

describe('filterRepos', () => {
  const many = Array.from({ length: 15 }, (_, i) => repo(`acme/repo-${i}`));

  it('caps at ten by default', () => {
    expect(REPO_LIMIT).toBe(10);
  });

  it('shows the first ten in the order given for an empty query, counting all', () => {
    const result = filterRepos(many, '  ');
    expect(names(result)).toEqual(many.slice(0, 10).map((r) => `acme/${r.name}`));
    expect(result.matched).toBe(15);
    expect(result.rows.every((row) => row.highlight === null)).toBe(true);
  });

  it('returns exactly ten of fifteen matches, and says fifteen matched', () => {
    const result = filterRepos(many, 'repo');
    expect(result.rows).toHaveLength(10);
    expect(result.matched).toBe(15);
    expect(names(result)[0]).toBe('acme/repo-0');
  });

  it('ranks name-prefix, then name-contains, then owner-only matches', () => {
    const repos = [repo('hive/zeta'), repo('acme/the-hive'), repo('acme/hive-team')];
    expect(names(filterRepos(repos, 'hive'))).toEqual([
      'acme/hive-team',
      'acme/the-hive',
      'hive/zeta',
    ]);
  });

  it('keeps the given order inside a tier', () => {
    const repos = [repo('a/hive-2'), repo('a/hive-1')];
    expect(names(filterRepos(repos, 'hive'))).toEqual(['a/hive-2', 'a/hive-1']);
  });

  it('matches case-insensitively and highlights within the name', () => {
    const [row] = filterRepos([repo('acme/The-Hive')], 'HIVE').rows;
    expect(row.highlight).toEqual({ start: 4, end: 8 });
  });

  it('has no highlight for an owner-only match', () => {
    const [row] = filterRepos([repo('cylesoftware/site')], 'cyle').rows;
    expect(row.highlight).toBeNull();
  });

  it('matches a typed owner/name slug', () => {
    expect(names(filterRepos([repo('acme/nova'), repo('beta/nova')], 'beta/no'))).toEqual([
      'beta/nova',
    ]);
  });

  it('answers nothing for no match', () => {
    expect(filterRepos([repo('acme/nova')], 'zzz')).toEqual({ rows: [], matched: 0 });
  });

  it('honours an explicit limit', () => {
    expect(filterRepos(many, '', 3).rows).toHaveLength(3);
  });
});
