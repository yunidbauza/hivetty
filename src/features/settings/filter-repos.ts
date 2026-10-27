import type { UserRepo } from '@shared/github-contract';

/**
 * Which of the user's repositories the clone picker shows for what they typed.
 *
 * At most {@link REPO_LIMIT} rows, so the settings pane has a fixed ceiling
 * however many repositories the account has; the filter itself always runs
 * over everything main sent, and `matched` is the count before the cap so the
 * header can say how many were left out.
 *
 * Three tiers: the name starts with the query, the name contains it, only the
 * `owner/name` slug contains it. Inside a tier the order main sent is kept,
 * which is most recently pushed first.
 */

export const REPO_LIMIT = 10;

export interface RepoMatch {
  repo: UserRepo;
  /** Indexes into `repo.name`; `null` when the match was not in the name. */
  highlight: { start: number; end: number } | null;
}

export function filterRepos(
  repos: readonly UserRepo[],
  query: string,
  limit = REPO_LIMIT,
): { rows: RepoMatch[]; matched: number } {
  const q = query.trim().toLowerCase();

  if (q === '') {
    return {
      rows: repos.slice(0, limit).map((repo) => ({ repo, highlight: null })),
      matched: repos.length,
    };
  }

  const prefix: RepoMatch[] = [];
  const inName: RepoMatch[] = [];
  const elsewhere: RepoMatch[] = [];

  for (const repo of repos) {
    const at = repo.name.toLowerCase().indexOf(q);
    if (at === 0) {
      prefix.push({ repo, highlight: { start: 0, end: q.length } });
    } else if (at > 0) {
      inName.push({ repo, highlight: { start: at, end: at + q.length } });
    } else if (`${repo.owner}/${repo.name}`.toLowerCase().includes(q)) {
      elsewhere.push({ repo, highlight: null });
    }
  }

  const all = [...prefix, ...inName, ...elsewhere];
  return { rows: all.slice(0, limit), matched: all.length };
}
