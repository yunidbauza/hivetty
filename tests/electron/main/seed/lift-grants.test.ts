// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { parseList, readFrontmatter } from '../../../../electron/shared/agent-contract';
import { matches } from '../../../../electron/shared/permission-rules';
import { liftGrants } from '../../../../electron/main/seed/lift-grants';
import { hashPart } from '../../../../electron/main/seed/merge';

/** What a wake holds after the lift, folded as `definition.ts` folds it: tools: then grants:, once. */
const held = (text: string): string[] => {
  const fields = readFrontmatter(text)?.fields;
  const list = (key: string) => parseList(fields?.get(key)?.value ?? '[]') ?? [];
  return [...new Set([...list('tools'), ...list('grants')])];
};

describe('liftGrants (HIVE-409)', () => {
  const agent = (lines: string) => `---\nname: shipper\n${lines}\n---\nBody\n`;

  it('moves rules beyond the shipped list into grants:, and tools: becomes the shipped list', () => {
    const out = liftGrants(agent('tools: [Read, Bash, Edit]'), agent('tools: [Read, Bash]'));
    expect(out).toContain('tools: [Read, Bash]\n');
    expect(out).toContain('grants: [Edit]');
  });

  it('drops a scoped rule a bare shipped tool already covers', () => {
    const out = liftGrants(
      agent('tools: [Read, Write, Skill, Bash(gh pr view *), Bash(git -C * fetch *), Bash, mcp__hive__jira_transition]'),
      agent('tools: [Read, Write, Skill, Bash, mcp__hive__jira_transition]'),
    );
    expect(out).toContain('tools: [Read, Write, Skill, Bash, mcp__hive__jira_transition]\n');
    expect(out).toContain('grants: []');
  });

  it('keeps a bare tool the shipped list lacks, and the scoped rules it covers go', () => {
    const out = liftGrants(agent('tools: [Read, Bash(git *), Bash]'), agent('tools: [Read]'));
    expect(out).toContain('tools: [Read]\n');
    expect(out).toContain('grants: [Bash]');
  });

  // Amended (sess-0z): a tools: missing a shipped entry is lifted too. Otherwise a release that adds a tool
  // to a shipped agent never reaches any installed copy, since every one of them is missing it.
  it('a tools: missing a shipped entry is lifted too, and the shipped entry arrives', () => {
    const out = liftGrants(agent('tools: [Read]'), agent('tools: [Read, Bash]'));
    expect(out).toContain('tools: [Read, Bash]\n');
    expect(out).toContain('grants: []');
  });

  it('a tool a release adds arrives, and the extras land in grants:', () => {
    const out = liftGrants(
      agent('tools: [Read, Skill, Bash, Bash(gh pr view *), mcp__hive__pr]'),
      agent('tools: [Read, Edit, Skill, Bash]'),
    );
    expect(out).toContain('tools: [Read, Edit, Skill, Bash]\n');
    expect(out).toContain('grants: [mcp__hive__pr]');
  });

  it('a file that already has grants: is untouched', () => {
    const current = agent('tools: [Read, Bash, Edit]\ngrants: []');
    expect(liftGrants(current, agent('tools: [Read, Bash]'))).toBe(current);
  });

  it('a file whose tools: equals the shipped list is untouched', () => {
    const current = agent('tools: [Read, Bash]');
    expect(liftGrants(current, agent('tools: [Read, Bash]'))).toBe(current);
  });

  it('a list that does not parse, on either side, leaves the file alone', () => {
    const current = agent('tools: Read, Bash');
    expect(liftGrants(current, agent('tools: [Read]'))).toBe(current);
    const mine = agent('tools: [Read, Edit]');
    expect(liftGrants(mine, agent('tools: Read'))).toBe(mine);
  });

  it('an entry that cannot be written back safely leaves the file alone', () => {
    // parseList strips one pair of quotes: "'*'" would be written back as '*', which reads as *.
    for (const bad of ['"\'*\'"', '" *"', 'a]b']) {
      const current = agent(`tools: [Read, ${bad}]`);
      expect(liftGrants(current, agent('tools: [Read]'))).toBe(current);
    }
  });

  it('a file without frontmatter is untouched', () => {
    expect(liftGrants('no fence\n', agent('tools: [Read]'))).toBe('no fence\n');
  });

  it('what the wake allows never shrinks', () => {
    const before = agent('tools: [Read, Bash(git *), Edit, WebFetch(domain:x.com)]');
    const out = liftGrants(before, agent('tools: [Read, Grep]'));
    for (const rule of ['Read', 'Bash(git *)', 'Edit', 'WebFetch(domain:x.com)']) expect(out).toContain(rule);
  });

  it.each([
    ['a merge', 'Bash', { command: 'gh pr merge 1 --squash --repo behiques/hivetty' }],
    ['a git call', 'Bash', { command: 'git -C /w fetch origin' }],
    ['a read', 'Read', { file_path: '/w/a.ts' }],
  ])('every call the old tools: allowed is still allowed after the lift: %s', (_name, tool, input) => {
    const before = agent('tools: [Read, Bash, Bash(gh pr merge * --repo behiques/hivetty), Bash(git -C * fetch *)]');
    const out = liftGrants(before, agent('tools: [Read, Bash]'));
    const allowed = (rules: string[]) => rules.some((rule) => matches(rule, tool, input));
    expect(allowed(held(before))).toBe(true);
    expect(allowed(held(out))).toBe(true);
  });

  it('keeps a merge rule a bare Bash sits beside, since no bare rule allows a merge', () => {
    const out = liftGrants(agent('tools: [Read, Bash, Bash(gh pr merge *)]'), agent('tools: [Read, Bash]'));
    expect(out).toContain('tools: [Read, Bash]\n');
    expect(out).toContain('grants: [Bash(gh pr merge *)]');
  });

  it('a lift keeps every rule it moves, in order', () => {
    const out = liftGrants(agent('tools: [Read, Bash(git *), Edit, WebFetch(domain:x.com)]'), agent('tools: [Read]'));
    expect(out).toContain('tools: [Read]\n');
    expect(out).toContain('grants: [Bash(git *), Edit, WebFetch(domain:x.com)]');
  });
});

describe('liftGrants against the base (HIVE-418)', () => {
  const agent = (lines: string) => `---\nname: shipper\n${lines}\n---\nBody\n`;
  /** The base's `tools` hash, as the manifest records it for a shipped `tools:` line. */
  const baseOf = (line: string): string => hashPart(line);
  const OLD = 'tools: [Read, Write, Skill, Bash, mcp__hive__jira_comment]';
  const NEW = agent('tools: [Read, Write, Skill, Bash]');

  it('leaves an untouched older shipped list to the merge: nothing lifted', () => {
    const current = agent(OLD);
    expect(liftGrants(current, NEW, baseOf(OLD))).toBe(current);
  });

  it('lifts only what a card appended after the older shipped list', () => {
    const out = liftGrants(agent('tools: [Read, Write, Skill, Bash, mcp__hive__jira_comment, Edit, WebFetch]'), NEW, baseOf(OLD));
    expect(out).toContain('tools: [Read, Write, Skill, Bash]\n');
    expect(out).toContain('grants: [Edit, WebFetch]');
    expect(held(out)).not.toContain('mcp__hive__jira_comment');
  });

  it('a card grant the new release ships is not kept as a grant', () => {
    const out = liftGrants(agent(`${OLD.slice(0, -1)}, Edit]`), agent('tools: [Read, Edit, Write, Skill, Bash]'), baseOf(OLD));
    expect(out).toContain('tools: [Read, Edit, Write, Skill, Bash]\n');
    expect(out).toContain('grants: []');
  });

  it('with no prefix matching the base, lifts as before', () => {
    const out = liftGrants(agent('tools: [Write, Read, Edit]'), agent('tools: [Read, Write]'), baseOf(OLD));
    expect(out).toContain('tools: [Read, Write]\n');
    expect(out).toContain('grants: [Edit]');
  });

  it('with no base, lifts as before', () => {
    const out = liftGrants(agent(`${OLD.slice(0, -1)}, Edit]`), NEW, undefined);
    expect(out).toContain('grants: [mcp__hive__jira_comment, Edit]');
  });
});
