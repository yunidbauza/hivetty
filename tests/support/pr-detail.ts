import type { PrDetail, PrFile, PrThread } from '@shared/github-contract';

/** One PR's detail with every field defaulted (HIVE-205). */
export function prDetail(overrides: Partial<PrDetail> = {}): PrDetail {
  return {
    id: 'PR_kwDO1182',
    owner: 'acme',
    repo: 'incorpx-server',
    number: 1182,
    title: 'Fee rule validator for Delaware filings',
    url: 'https://github.com/acme/incorpx-server/pull/1182',
    state: 'open',
    isDraft: false,
    body: 'Validates every Delaware filing.\n\n- [x] Corporations pass\n- [ ] LLCs are checked',
    createdAt: '2026-10-03T08:50:00Z',
    mergedAt: null,
    baseRef: 'main',
    headRef: 'feat/incorp-598-fee-rule',
    headSha: '9f3c2ab',
    additions: 214,
    deletions: 38,
    changedFiles: 9,
    author: 'yunid',
    reviewDecision: 'CHANGES_REQUESTED',
    mergeStateStatus: 'BLOCKED',
    comments: [],
    reviews: [],
    reviewRequests: [],
    threads: [],
    checks: [],
    files: [],
    ...overrides,
  };
}

/** One changed file (HIVE-207). */
export function prFile(overrides: Partial<PrFile> = {}): PrFile {
  return {
    path: 'src/fees/validator.ts',
    additions: 88,
    deletions: 9,
    changeType: 'modified',
    viewed: 'unviewed',
    ...overrides,
  };
}

/** One open review thread on `src/fees/validator.ts:118`. */
export function prThread(overrides: Partial<PrThread> = {}): PrThread {
  return {
    id: 'PRRT_1',
    isResolved: false,
    isOutdated: false,
    path: 'src/fees/validator.ts',
    line: 118,
    originalLine: 118,
    diffSide: 'RIGHT',
    comments: [
      {
        author: 'acr',
        body: 'An LLC without a registered agent passes validation.',
        createdAt: '2026-10-03T10:50:00Z',
        url: 'https://github.com/acme/incorpx-server/pull/1182#discussion_r1',
        diffHunk:
          "@@ -114,4 +114,5 @@ export function validate(filing: Filing): Result {\n   const fee = feeTable.for(filing.state, filing.year);\n+  if (filing.total < fee.minimum) return reject('underpaid');\n-  if (filing.total < 400) return reject('underpaid');\n   if (filing.entity === 'llc') return ok();\n   return checkFranchiseTax(filing);",
      },
    ],
    ...overrides,
  };
}
