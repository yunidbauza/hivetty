import { Check } from '@phosphor-icons/react';
import { marked, type Token, type Tokens } from 'marked';
import { Fragment, useMemo, type ReactNode } from 'react';

/**
 * Markdown as React elements (HIVE-205, D18): a PR's body and its comments.
 *
 * **There is no `dangerouslySetInnerHTML` here and there must never be one.**
 * Anyone who can open a PR writes this text. `marked`'s lexer only tokenises;
 * this file decides what each token becomes, and an `html` token, an image or
 * anything the lexer adds later renders as its own source, as text. A link
 * opens only for `http(s):` and `mailto:`. Shared because HIVE-207's thread
 * bodies render the same way.
 */

const SAFE_HREF = /^(https?:|mailto:)/i;

/** marked 13 escapes inline text in the lexer; React escapes again, so undo the first. */
const ENTITIES: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };
const plain = (text: string) => text.replace(/&(?:amp|lt|gt|quot|#39);/g, (entity) => ENTITIES[entity] ?? entity);

function inline(tokens: readonly Token[] | undefined): ReactNode {
  return (tokens ?? []).map((token, i) => <Fragment key={i}>{inlineOne(token)}</Fragment>);
}

function inlineOne(token: Token): ReactNode {
  switch (token.type) {
    case 'strong':
      return <strong className="font-semibold text-ink">{inline((token as Tokens.Strong).tokens)}</strong>;
    case 'em':
      return <em>{inline((token as Tokens.Em).tokens)}</em>;
    case 'del':
      return <del>{inline((token as Tokens.Del).tokens)}</del>;
    case 'codespan':
      return (
        <code className="rounded bg-chip px-1 py-px font-mono text-ui-sm">
          {plain((token as Tokens.Codespan).text)}
        </code>
      );
    case 'br':
      return <br />;
    case 'link': {
      const link = token as Tokens.Link;
      const label = inline(link.tokens);
      return SAFE_HREF.test(link.href) ? (
        <a href={link.href} target="_blank" rel="noreferrer" className="text-brand hover:underline">
          {label}
        </a>
      ) : (
        label
      );
    }
    case 'text': {
      const text = token as Tokens.Text;
      return text.tokens ? inline(text.tokens) : plain(text.text);
    }
    case 'escape':
      return plain((token as Tokens.Escape).text);
    default:
      return token.raw;
  }
}

/** A task list is the PR's test plan: GitHub's tick, or an empty box. */
function TestPlan({ items }: { items: Tokens.ListItem[] }) {
  return (
    <ul className="mb-[0.75em] grid gap-[0.35em] text-control text-muted">
      {items.map((item, i) => (
        <li key={i} className="flex items-center gap-2">
          {item.checked ? (
            <Check size={13} role="img" aria-label="done" className="shrink-0 text-green" />
          ) : (
            <span role="img" aria-label="to do" className="mx-0.5 size-[9px] shrink-0 rounded-xs border border-subtle" />
          )}
          <span>{itemBody(item)}</span>
        </li>
      ))}
    </ul>
  );
}

/** A GFM table, scrolling sideways rather than squeezing a wide one. */
function Table({ table }: { table: Tokens.Table }) {
  const align = (a: Tokens.TableCell['align']) => (a === 'right' ? 'text-right' : a === 'center' ? 'text-center' : 'text-left');
  return (
    <div className="mb-[0.75em] overflow-x-auto">
      <table className="border-collapse text-[0.92em]">
        <thead>
          <tr>
            {table.header.map((cell, j) => (
              <th key={j} className={`border-b border-border px-2.5 py-1.5 font-semibold text-ink ${align(cell.align)}`}>
                {inline(cell.tokens)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, r) => (
            <tr key={r}>
              {row.map((cell, j) => (
                <td key={j} className={`border-b border-border-soft px-2.5 py-1.5 align-top ${align(cell.align)}`}>
                  {inline(cell.tokens)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const itemBody = (item: Tokens.ListItem): ReactNode =>
  item.tokens.map((token, j) =>
    token.type === 'text' ? <Fragment key={j}>{inlineOne(token)}</Fragment> : block(token, j),
  );

function block(token: Token, i: number): ReactNode {
  switch (token.type) {
    case 'space':
      return null;
    case 'paragraph':
      return (
        <p key={i} className="mb-[0.75em]">
          {inline((token as Tokens.Paragraph).tokens)}
        </p>
      );
    case 'heading':
      return (
        <p key={i} className="mt-[1.5em] mb-[0.5em] text-[1.05em] font-semibold text-ink first:mt-0">
          {inline((token as Tokens.Heading).tokens)}
        </p>
      );
    case 'code':
      return (
        <pre key={i} className="mb-[0.75em] overflow-x-auto rounded-md bg-term-bg p-2.5 font-mono text-control text-muted">
          {(token as Tokens.Code).text}
        </pre>
      );
    case 'blockquote':
      return (
        <blockquote key={i} className="mb-[0.75em] border-l-2 border-border pl-3 text-muted">
          {(token as Tokens.Blockquote).tokens.map(block)}
        </blockquote>
      );
    case 'hr':
      return <hr key={i} className="my-[1.25em] border-border-soft" />;
    case 'list': {
      const list = token as Tokens.List;
      if (list.items.some((item) => item.task)) return <TestPlan key={i} items={list.items} />;
      const Tag = list.ordered ? 'ol' : 'ul';
      return (
        <Tag key={i} className={list.ordered ? 'mb-[0.75em] list-decimal pl-5' : 'mb-[0.75em] list-disc pl-5'}>
          {list.items.map((item, j) => (
            <li key={j} className="mb-[0.35em] [&>p]:mb-[0.35em]">
              {itemBody(item)}
            </li>
          ))}
        </Tag>
      );
    }
    case 'table':
      return <Table key={i} table={token as Tokens.Table} />;
    default:
      return (
        <p key={i} className="mb-[0.75em] whitespace-pre-wrap">
          {token.raw}
        </p>
      );
  }
}

export function Markdown({ source }: { source: string }) {
  const tokens = useMemo(() => marked.lexer(source, { gfm: true }), [source]);
  return <div className="text-ui leading-[1.7]">{tokens.map(block)}</div>;
}
