import { Fragment } from 'react';

import { cn } from '@/lib/utils';

import type { AdfBlock, AdfRun } from '@shared/jira-contract';

/**
 * Rendered ADF (HIVE-71).
 *
 * Takes the block/run structure main produced and maps it to elements this file
 * owns. **There is no `dangerouslySetInnerHTML` here and there must never be
 * one**: a Jira comment is arbitrary text written by anyone with access to the
 * issue, and rendering it as markup would make every project this app can read
 * a path into the app. Main hands over text and mark names; this decides what
 * they look like.
 *
 * The `unknown` kind is a node type main had never met — a panel, a media
 * group, a status lozenge. Its text renders as an ordinary paragraph, slightly
 * muted, because a comment the app cannot fully render is still a comment the
 * user needs to read.
 */

function Run({ run }: { run: AdfRun }) {
  if (run.mention) {
    return (
      <span data-mention className="rounded bg-chip px-1 py-px font-medium text-brand">
        {run.text}
      </span>
    );
  }

  const className = cn(
    run.marks.includes('strong') && 'font-semibold text-ink',
    run.marks.includes('em') && 'italic',
    run.marks.includes('strike') && 'line-through',
    run.marks.includes('code') &&
      'rounded bg-chip px-1 py-px font-mono text-[0.9em]',
  );

  if (run.href !== undefined) {
    return (
      <a
        href={run.href}
        target="_blank"
        rel="noreferrer"
        className={cn(className, 'text-brand hover:underline')}
      >
        {run.text}
      </a>
    );
  }

  // A hard break arrives as a run whose text is a newline; `whitespace-pre-wrap`
  // on the block is what makes it show.
  return className === '' ? (
    <>{run.text}</>
  ) : (
    <span className={className}>{run.text}</span>
  );
}

function Runs({ runs }: { runs: AdfRun[] }) {
  return (
    <>
      {runs.map((run, index) => (
        // Index keys: runs have no identity of their own, and the list is
        // replaced wholesale whenever the comment is re-read.
        <Fragment key={index}>
          <Run run={run} />
        </Fragment>
      ))}
    </>
  );
}

function Block({ block }: { block: AdfBlock }) {
  if (block.kind === 'rule') {
    return <hr className="border-border-soft" />;
  }

  if (block.kind === 'code') {
    return (
      <pre className="overflow-x-auto rounded-md bg-term-bg px-2 py-1.5 font-mono text-[0.9em] text-ink">
        {block.runs.map((run) => run.text).join('')}
      </pre>
    );
  }

  if (block.kind === 'heading') {
    return (
      <p data-heading className="text-[1.08em] font-semibold text-ink">
        <Runs runs={block.runs} />
      </p>
    );
  }

  if (block.kind === 'quote') {
    return (
      <p className="border-l-2 border-border pl-2.5 whitespace-pre-wrap text-muted">
        <Runs runs={block.runs} />
      </p>
    );
  }

  if (block.kind === 'bullet' || block.kind === 'ordered') {
    return (
      // The marker is its own column, so a wrapped line hangs under the text, not the bullet.
      <p
        data-list
        className="flex gap-[0.5em] whitespace-pre-wrap text-muted"
        style={{ paddingLeft: `${String((block.depth ?? 0) * 1.25 + 0.75)}em` }}
      >
        <span aria-hidden className="text-subtle">{block.kind === 'bullet' ? '•' : '–'}</span>
        <span className="min-w-0">
          <Runs runs={block.runs} />
        </span>
      </p>
    );
  }

  return (
    <p
      className={cn(
        'whitespace-pre-wrap',
        // Slightly muted, so a node the app could not structure is visibly
        // different from one it could — without hiding it.
        block.kind === 'unknown' ? 'text-subtle' : 'text-muted',
      )}
    >
      <Runs runs={block.runs} />
    </p>
  );
}

/**
 * Spacing in `em`, so it scales with whatever size the caller sets: paragraphs
 * apart, list items close, a heading with room above and its body close below.
 */
const FLOW =
  '[&>*+*]:mt-[0.75em] [&>[data-list]+[data-list]]:mt-[0.35em] [&>*+[data-heading]]:mt-[1.5em] [&>[data-heading]+*]:mt-[0.5em]';

export function AdfBlocks({ blocks, className }: { blocks: AdfBlock[]; className?: string }) {
  if (blocks.length === 0) {
    return (
      <p className="text-control text-subtle">
        This comment has nothing this app can display.
      </p>
    );
  }

  return (
    <div className={cn('text-control leading-relaxed', FLOW, className)}>
      {blocks.map((block, index) => (
        <Fragment key={index}>
          <Block block={block} />
        </Fragment>
      ))}
    </div>
  );
}
