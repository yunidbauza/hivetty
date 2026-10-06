import { GitPullRequest, Hexagon } from '@phosphor-icons/react';
import { type RefObject, useMemo, useRef, useState } from 'react';

import { addJiraComment } from '@/lib/jira';
import { BRIDGE_ERROR } from '@/lib/utils';
import { isAgent } from '@/types/entity';

import { Button } from '@components/ui/button';
import { Icon } from '@components/ui/icon';
import { SegmentedControl } from '@components/ui/segmented-control';
import { AdfBlocks } from '@features/work/components/adf-blocks';
import {
  activeMention,
  initials,
  MentionList,
  useMentionPicker,
} from '@features/work/components/mention-picker';
import { LinesSkeleton, TicketProblem } from '@features/work/components/ticket-page-parts';
import { commentTime } from '@features/work/ticket-presentation';
import type { JiraComment, JiraMention, JiraUser } from '@shared/jira-contract';
import type { LedgerEntry } from '@shared/ledger-contract';
import {
  useAppendTicketComment,
  useEntity,
  useLoadTicketDetail,
  useOpenTicket,
  useTicketDetail,
  useTicketEvents,
} from '@stores/hive-store';
import { useSetWorkConversation, useWorkConversation, type WorkConversation } from '@stores/ui-store';

const MODES = [
  { value: 'comments', label: 'Comments' },
  { value: 'everything', label: 'Everything' },
] as const satisfies readonly { value: WorkConversation; label: string }[];

type Item =
  | { kind: 'comment'; at: number; comment: JiraComment }
  | { kind: 'event'; at: number; entry: LedgerEntry };

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export { initials } from '@features/work/components/mention-picker';

/**
 * The gutter of a comment the Hive posted for an agent (HIVE-216): the agent's
 * own glyph in a rounded square. Its own component so a person's row never
 * subscribes to the fleet.
 */
function ViaFace({ agent }: { agent: string }) {
  const entity = useEntity(agent);
  const icon = entity !== undefined && isAgent(entity) ? entity.icon : 'ph-robot';
  return (
    <span
      aria-hidden
      data-gutter="agent"
      className="grid size-[26px] place-items-center rounded-lg border border-border bg-chip text-brand"
    >
      <Icon name={icon} size={14} />
    </span>
  );
}

const ROW = 'group grid grid-cols-[30px_minmax(0,1fr)] gap-2.5 rounded-lg px-1.5 py-[7px] hover:bg-panel focus-within:bg-panel';
const ACTION = 'text-control text-brand hover:underline';

/**
 * One comment: a face, the author, and a fixed slot that holds the time until
 * the row is hovered or focused, when Reply and Copy link take its place. The
 * slot keeps its width either way, so revealing them never shifts the line.
 */
function CommentItem({
  comment,
  url,
  onReply,
}: {
  comment: JiraComment;
  url: string | undefined;
  onReply: (comment: JiraComment) => void;
}) {
  const copy = () => {
    if (url === undefined) return;
    void navigator.clipboard.writeText(`${url}?focusedCommentId=${comment.id}`);
  };

  return (
    <li className={ROW}>
      {comment.via === undefined ? (
        <span
          aria-hidden
          className="grid size-[26px] place-items-center rounded-full bg-panel-2 text-micro font-semibold text-ink"
        >
          {initials(comment.author)}
        </span>
      ) : (
        <ViaFace agent={comment.via.agent} />
      )}
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex items-baseline gap-2 text-control">
          <span className="font-medium text-ink">{comment.via?.agent ?? comment.author}</span>
          {comment.via === undefined ? null : <span className="text-micro text-subtle">via Hive TTY</span>}
          <span className="flex-1" />
          <span className="relative w-[120px] shrink-0 text-right">
            <time
              dateTime={comment.created}
              className="tabular-nums text-micro text-subtle group-has-[:focus-visible]:invisible group-hover:invisible"
            >
              {commentTime(comment.created)}
            </time>
            {/* Opacity, not `invisible`: visibility:hidden leaves the tab order, and nothing else in the row takes focus. */}
            <span className="absolute inset-0 flex justify-end gap-3 opacity-0 group-has-[:focus-visible]:opacity-100 group-hover:opacity-100">
              <button type="button" className={ACTION} onClick={() => onReply(comment)}>
                Reply
              </button>
              <button type="button" className={ACTION} onClick={copy}>
                Copy link
              </button>
            </span>
          </span>
        </div>
        <div className="text-ui">
          <AdfBlocks blocks={comment.body} />
        </div>
      </div>
    </li>
  );
}

/** One ledger event: a glyph and one line, `<from> <the body's first line>`. No actions. */
function EventItem({ entry }: { entry: LedgerEntry }) {
  const pr = entry.meta?.['pr'] !== undefined;
  const Glyph = pr ? GitPullRequest : Hexagon;

  return (
    <li className="grid grid-cols-[30px_minmax(0,1fr)] items-center gap-2.5 px-1.5 py-1 text-control text-muted">
      <span data-glyph={pr ? 'pr' : 'session'} className="grid place-items-center text-subtle">
        <Glyph size={13} aria-hidden />
      </span>
      <span className="min-w-0 truncate">
        <span className="text-ink">{entry.from}</span> {entry.body.split('\n')[0]}
      </span>
    </li>
  );
}

/**
 * Comment on Jira from the page (HIVE-203). The post logic is the card
 * conversation's: the trimmed markdown goes to main, and the comment Jira
 * answers with is shown at once rather than re-reading the thread. A refusal
 * keeps the draft, with Jira's own words, in amber.
 */
function ReplyBox({
  ticketKey,
  replyTo,
  onForget,
  box,
  mentions,
  setMentions,
}: {
  ticketKey: string;
  /** The author Reply was pressed on; only the placeholder says so. */
  replyTo: string | null;
  onForget: () => void;
  box: RefObject<HTMLTextAreaElement | null>;
  /** The people the comment will mention, drawn as chips above the box (HIVE-216). */
  mentions: JiraMention[];
  setMentions: (next: JiraMention[]) => void;
}) {
  const append = useAppendTicketComment();
  const [draft, setDraft] = useState('');
  const [posting, setPosting] = useState(false);
  const [problem, setProblem] = useState<string[] | null>(null);
  const [caret, setCaret] = useState(0);
  const mention = activeMention(draft, caret);
  const picker = useMentionPicker(mention?.query ?? null);
  const listId = `${ticketKey}-mentions`;
  const highlighted = picker.open ? picker.users[picker.active] : undefined;

  const pick = (user: JiraUser) => {
    if (mention === null) return;
    setDraft(draft.slice(0, mention.start) + draft.slice(caret));
    setCaret(mention.start);
    if (!mentions.some((m) => m.accountId === user.accountId)) {
      setMentions([...mentions, { accountId: user.accountId, name: user.displayName }]);
    }
  };

  const post = () => {
    const markdown = draft.trim();
    if (markdown === '' && mentions.length === 0) return;

    setPosting(true);
    setProblem(null);
    void addJiraComment({ key: ticketKey, markdown, ...(mentions.length === 0 ? {} : { mentions }) }).then((result) => {
      setPosting(false);
      if (result === null) return setProblem([BRIDGE_ERROR]);
      if (!result.ok) return setProblem([result.error.message, ...(result.error.details ?? [])]);
      setDraft('');
      onForget();
      append(ticketKey, result.value);
    });
  };

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border-soft bg-panel p-3">
      {mentions.length === 0 ? null : (
        <div className="flex flex-wrap items-center gap-1.5">
          {mentions.map((mention) => (
            <span
              key={mention.accountId}
              className="inline-flex items-center gap-1 rounded bg-chip py-0.5 pl-1.5 pr-1 text-control font-medium text-brand"
            >
              @{mention.name}
              <button
                type="button"
                aria-label={`Remove mention of ${mention.name}`}
                onClick={() => setMentions(mentions.filter((m) => m.accountId !== mention.accountId))}
                className="px-0.5 text-muted hover:text-ink"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="relative">
        <textarea
          ref={box}
          rows={3}
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            setCaret(event.target.selectionStart);
          }}
          onSelect={(event) => setCaret(event.currentTarget.selectionStart)}
          onKeyDown={(event) => {
            if (picker.open) {
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault();
                picker.move(event.key === 'ArrowDown' ? 1 : -1);
                return;
              }
              const chosen = picker.current();
              if (event.key === 'Enter' && chosen !== undefined) {
                event.preventDefault();
                pick(chosen);
                return;
              }
              if (event.key === 'Escape') {
                event.preventDefault();
                picker.dismiss();
                return;
              }
            }
            if (event.key === 'Escape' && draft === '') onForget();
          }}
          aria-label={`Comment on ${ticketKey}`}
          role="combobox"
          aria-expanded={picker.open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={highlighted === undefined ? undefined : `${listId}-${highlighted.accountId}`}
          placeholder={replyTo === null ? 'Add a comment — markdown works' : `Reply to ${replyTo}…`}
          className="w-full resize-y bg-transparent text-ui text-ink outline-none placeholder:text-subtle"
        />
        {picker.open ? (
          <MentionList
            id={listId}
            users={picker.users}
            failed={picker.failed}
            active={picker.active}
            onPick={pick}
          />
        ) : null}
      </div>
      <div className="flex items-center gap-2 text-control">
        <span className="rounded-full border border-border-soft px-2.5 py-0.5 text-ink">Comment on Jira</span>
        <span className="text-muted">everyone on the ticket sees it</span>
        <span className="flex-1" />
        <Button
          variant="primary"
          onClick={post}
          disabled={draft.trim() === '' && mentions.length === 0}
          pending={posting}
        >
          {posting ? 'Posting…' : 'Comment'}
        </Button>
      </div>
      {/* Always mounted: a live region that mounts with its text is not reliably announced (HIVE-225). */}
      <div role="status" className="flex flex-col gap-3 empty:-mt-3">
        {problem?.map((line) => (
          <p key={line} className="text-control text-amber-text">
            {line}
          </p>
        ))}
      </div>
    </div>
  );
}

/**
 * The ticket page's conversation (HIVE-203): Jira's comments, newest
 * `JIRA_MAX_COMMENTS` oldest-first, and — on Everything — the ledger's events
 * for the ticket interleaved with them by time.
 */
export function TicketPageConversation({ ticketKey }: { ticketKey: string }) {
  const mine = useTicketDetail(ticketKey);
  const events = useTicketEvents(ticketKey);
  const ticket = useOpenTicket(ticketKey);
  const mode = useWorkConversation();
  const setMode = useSetWorkConversation();
  const load = useLoadTicketDetail();
  const comments = mine?.comments;
  const total = mine?.total ?? comments?.length ?? 0;
  const problem = mine?.problems.comments;
  const retry = () => void load(ticketKey, 'page');
  const box = useRef<HTMLTextAreaElement>(null);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [mentions, setMentions] = useState<JiraMention[]>([]);
  // The chip Reply added, so replying to someone else swaps it rather than notifying both.
  const [replied, setReplied] = useState<string | null>(null);

  const reply = (to: JiraComment) => {
    setReplyTo(to.author);
    // An agent's comment is the token owner's in Jira, which is you: nobody to notify.
    const target = to.via === undefined ? to.authorId : undefined;
    setReplied(target ?? null);
    setMentions((held) => {
      const kept = held.filter((m) => m.accountId !== replied);
      if (target === undefined || kept.some((m) => m.accountId === target)) return kept;
      return [...kept, { accountId: target, name: to.author }];
    });
    box.current?.focus();
  };
  const forget = () => {
    setReplyTo(null);
    setReplied(null);
    setMentions([]);
  };

  const items = useMemo<Item[]>(() => {
    const said: Item[] = (comments ?? []).map((comment) => ({
      kind: 'comment',
      at: Date.parse(comment.created),
      comment,
    }));
    if (mode === 'comments') return said;
    const done: Item[] = events.map((entry) => ({ kind: 'event', at: entry.ts, entry }));
    return [...said, ...done].sort((a, b) => a.at - b.at);
  }, [comments, events, mode]);

  return (
    <section aria-labelledby={`${ticketKey}-conversation`} className="mt-7 flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <h2 id={`${ticketKey}-conversation`} className="text-ui-lg font-semibold text-ink">
          Conversation
        </h2>
        <span className="text-control text-muted">
          {plural(total, 'comment', 'comments')} · {plural(events.length, 'event', 'events')}
        </span>
        <span className="flex-1" />
        <SegmentedControl label="Show" options={MODES} value={mode} onChange={setMode} />
      </div>

      {comments === undefined ? (
        problem === undefined ? (
          <LinesSkeleton label="Loading conversation" />
        ) : (
          <TicketProblem message={problem} onRetry={retry} />
        )
      ) : (
        <>
          {total > comments.length ? (
            <p className="text-control text-subtle">
              {`Showing the latest ${comments.length} of ${total}`}
              {ticket?.url ? (
                <>
                  {' · '}
                  <a href={ticket.url} target="_blank" rel="noreferrer" className="text-brand hover:underline">
                    Open in Jira
                  </a>
                </>
              ) : null}
            </p>
          ) : null}
          {problem === undefined ? null : (
            <TicketProblem message={problem} onRetry={retry} readAt={mine?.readAt} />
          )}
          {items.length === 0 ? (
            <p className="text-control text-subtle">No comments yet.</p>
          ) : (
            <ul aria-label="Conversation" className="flex flex-col gap-0.5">
              {items.map((item) =>
                item.kind === 'comment' ? (
                  <CommentItem key={`c-${item.comment.id}`} comment={item.comment} url={ticket?.url} onReply={reply} />
                ) : (
                  <EventItem key={`e-${item.entry.id}`} entry={item.entry} />
                ),
              )}
            </ul>
          )}
        </>
      )}

      <ReplyBox
        ticketKey={ticketKey}
        replyTo={replyTo}
        onForget={forget}
        box={box}
        mentions={mentions}
        setMentions={setMentions}
      />
    </section>
  );
}
