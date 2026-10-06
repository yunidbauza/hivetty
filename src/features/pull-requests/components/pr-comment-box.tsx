import { useState } from 'react';

import type { Pr } from '@/types/pull-request';

import { Button } from '@components/ui/button';
import { useCommentOnPr } from '@stores/hive-store';

/**
 * Comment on GitHub from the PR page (HIVE-205). The comment shows on the next
 * read, which `commentOnPr` starts on success; a failure keeps the draft and
 * shows GitHub's reason in amber. GitHub only: the mock's ▾ menu offers nothing
 * else yet (D20).
 */
export function PrCommentBox({ pr }: { pr: Pr }) {
  const comment = useCommentOnPr();
  const [draft, setDraft] = useState('');
  const [posting, setPosting] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const label = `Comment on #${String(pr.n)}`;

  const post = () => {
    const body = draft.trim();
    if (body === '') return;
    setPosting(true);
    setProblem(null);
    void comment(pr.owner, pr.repo, pr.n, body).then((result) => {
      setPosting(false);
      if (!result.ok) {
        setProblem(result.error.message);
        return;
      }
      setDraft('');
    });
  };

  return (
    <div className="mt-2.5 flex flex-col gap-3 rounded-xl border border-border-soft bg-panel px-3.5 py-3 focus-within:border-brand">
      <textarea
        rows={3}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        aria-label={label}
        placeholder={`${label}…`}
        className="resize-y bg-transparent text-ui text-ink outline-none placeholder:text-subtle"
      />
      <div className="flex items-center gap-2.5 text-control">
        <span className="rounded-md border border-border-soft px-2 py-0.5 text-ink">Comment on GitHub</span>
        <span className="text-muted">everyone on the PR sees it</span>
        <span className="flex-1" />
        <Button
          variant="primary"
          onClick={post}
          disabled={draft.trim() === ''}
          pending={posting}
        >
          {posting ? 'Posting…' : 'Comment'}
        </Button>
      </div>
      {/* Always mounted: a live region that mounts with its text is not reliably announced (HIVE-225). */}
      <div role="status" className="empty:-mt-3">
        {problem === null ? null : <p className="text-control text-amber-text">{problem}</p>}
      </div>
    </div>
  );
}
