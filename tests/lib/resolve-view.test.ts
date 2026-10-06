import { describe, expect, it } from 'vitest';

import type { Agent, Session, Terminal } from '@/types/entity';
import {
  isEntityView,
  isTerminalView,
  resolveView,
  type ViewState,
} from '@/lib/resolve-view';

/**
 * The view-state machine, tested exhaustively (story 040). The component's only
 * job is to render what this returns, so every state and every precedence rule
 * is pinned here rather than inferred from JSX.
 */

const session = { kind: 'session', id: 'hero-refresh' } as Session;
const agent = { kind: 'agent', id: 'slack-agent' } as Agent;

describe('resolveView', () => {
  it('shows the orchestrator for the reserved tab', () => {
    expect(resolveView({ home: false, work: false, agents: false, prs: false, activeTab: 'orch', picker: false, settings: false, entity: null, editorFull: false })).toBe(
      'orchestrator',
    );
  });

  it('shows a session for a session entity', () => {
    expect(
      resolveView({ home: false, work: false, agents: false, prs: false, activeTab: 'hero-refresh', picker: false, settings: false, entity: session, editorFull: false }),
    ).toBe('session');
  });

  it('shows an agent for an agent entity', () => {
    expect(
      resolveView({ home: false, work: false, agents: false, prs: false, activeTab: 'slack-agent', picker: false, settings: false, entity: agent, editorFull: false }),
    ).toBe('agent');
  });

  it('shows the picker whenever it is open', () => {
    expect(resolveView({ home: false, work: false, agents: false, prs: false, activeTab: 'orch', picker: true, settings: false, entity: null, editorFull: false })).toBe(
      'picker',
    );
  });

  describe('precedence', () => {
    it('lets the picker win over every underlying view', () => {
      /**
       * The picker is a full-stage overlay that deliberately does not change
       * `activeTab` — closing it has to return the user to what they were
       * looking at, which only works if the tab underneath is untouched.
       */
      for (const entity of [null, session, agent]) {
        expect(
          resolveView({
            home: false, work: false, agents: false, prs: false,
            activeTab: entity?.id ?? 'orch',
            picker: true,
            settings: false,
            entity,
            editorFull: false,
          }),
        ).toBe('picker');
      }
    });

    it('falls back to the orchestrator when the tab names no entity', () => {
      // A session can be removed while its tab is open. Stranding the user on a
      // blank stage is worse than sending them home.
      expect(
        resolveView({ home: false, work: false, agents: false, prs: false, activeTab: 'deleted-session', picker: false, settings: false, entity: null, editorFull: false }),
      ).toBe('orchestrator');
    });
  });

  it('resolves to exactly one state for every input combination', () => {
    const states = new Set<ViewState>();

    for (const settings of [true, false]) {
      for (const picker of [true, false]) {
        for (const editorFull of [true, false]) {
          for (const entity of [null, session, agent]) {
            for (const activeTab of ['orch', 'hero-refresh', 'slack-agent', 'gone']) {
              states.add(
                resolveView({ home: false, work: false, agents: false, prs: false, activeTab, picker, settings, entity, editorFull }),
              );
            }
          }
        }
      }
    }

    // All six states are reachable, and nothing else is.
    expect([...states].sort()).toEqual([
      'agent',
      'editor',
      'orchestrator',
      'picker',
      'session',
      'settings',
    ]);
  });

  describe('settings (story 101)', () => {
    /**
     * The realistic route into settings is the picker discovering it has no
     * projects to offer. If the picker won here, the user would be looking at
     * two stacked full-stage overlays.
     */
    it('wins over the picker', () => {
      expect(
        resolveView({
          home: false, work: false, agents: false, prs: false,
          activeTab: 'orch',
          picker: true,
          settings: true,
          entity: null,
          editorFull: false,
        }),
      ).toBe('settings');
    });

    it('wins over every underlying view', () => {
      for (const entity of [null, session, agent]) {
        expect(
          resolveView({
            home: false, work: false, agents: false, prs: false,
            activeTab: entity?.id ?? 'orch',
            picker: false,
            settings: true,
            entity,
            editorFull: false,
          }),
        ).toBe('settings');
      }
    });

    it('yields to the underlying view once closed', () => {
      // Closing settings must return the user to the terminal they were
      // watching, which only works because it never touched `activeTab`.
      expect(
        resolveView({
          home: false, work: false, agents: false, prs: false,
          activeTab: 'hero-refresh',
          picker: false,
          settings: false,
          entity: session,
          editorFull: false,
        }),
      ).toBe('session');
    });
  });

  /**
   * The editor, and the asymmetry that makes split placement work.
   *
   * `editorFull` is one boolean rather than the two facts behind it precisely
   * so that a split stage never resolves here: in a split the editor is a
   * *layout* of the entity view, and returning 'editor' would make
   * `isEntityView` false for a stage that is still showing a session's meta bar
   * and message row.
   */
  describe('the editor', () => {
    it('fills the stage when a file is open in full-stage placement', () => {
      expect(
        resolveView({
          home: false, work: false, agents: false, prs: false,
          activeTab: 'hero-refresh',
          picker: false,
          settings: false,
          entity: session,
          editorFull: true,
        }),
      ).toBe('editor');
    });

    it('yields to both overlays', () => {
      expect(
        resolveView({
          home: false, work: false, agents: false, prs: false,
          activeTab: 'orch',
          picker: true,
          settings: false,
          entity: null,
          editorFull: true,
        }),
      ).toBe('picker');
      expect(
        resolveView({
          home: false, work: false, agents: false, prs: false,
          activeTab: 'orch',
          picker: false,
          settings: true,
          entity: null,
          editorFull: true,
        }),
      ).toBe('settings');
    });

    it('leaves the underlying view untouched — split never resolves here', () => {
      // What a split stage passes: a file is open, but placement is 'split', so
      // the caller reports editorFull: false and the session view survives.
      expect(
        resolveView({
          home: false, work: false, agents: false, prs: false,
          activeTab: 'hero-refresh',
          picker: false,
          settings: false,
          entity: session,
          editorFull: false,
        }),
      ).toBe('session');
    });

    it('is not an entity view', () => {
      expect(isEntityView('editor')).toBe(false);
    });
  });
});

describe('isEntityView', () => {
  it('is true for both kinds of entity on the stage', () => {
    expect(isEntityView('session')).toBe(true);
    expect(isEntityView('agent')).toBe(true);
    expect(isEntityView('orchestrator')).toBe(false);
    expect(isEntityView('picker')).toBe(false);
    expect(isEntityView('settings')).toBe(false);
  });
});

/**
 * Split from `isEntityView` by HIVE-116, because the two questions stopped
 * having the same answer.
 *
 * An agent view is an entity view — the foreground gate suppresses a
 * notification about whatever the user is already looking at, whichever kind
 * it is — but it is not a *terminal* view. Answering true here is what used to
 * mount a read-only xterm, a session meta bar and a message row for an agent.
 */
describe('isTerminalView', () => {
  it('is true only where a terminal and its meta bar belong', () => {
    expect(isTerminalView('session')).toBe(true);
    expect(isTerminalView('agent')).toBe(false);
    expect(isTerminalView('orchestrator')).toBe(false);
    expect(isTerminalView('picker')).toBe(false);
    expect(isTerminalView('settings')).toBe(false);
    expect(isTerminalView('editor')).toBe(false);
  });
});

const terminal = { kind: 'terminal', id: 'term-01' } as Terminal;

it('shows a terminal for a terminal entity, and it is both an entity view and a terminal view', () => {
  const view = resolveView({ home: false, work: false, agents: false, prs: false, activeTab: 'term-01', picker: false, settings: false, entity: terminal, editorFull: false });
  expect(view).toBe('terminal');
  expect(isEntityView(view)).toBe(true);
  expect(isTerminalView(view)).toBe(true);
});

describe('Home (HIVE-195)', () => {
  const base = { activeTab: 'orch', picker: false, settings: false, entity: null, editorFull: false, work: false, agents: false, prs: false };

  it('resolves to home', () => {
    expect(resolveView({ ...base, home: true })).toBe('home');
  });

  it('loses to settings and the picker', () => {
    expect(resolveView({ ...base, home: true, settings: true })).toBe('settings');
    expect(resolveView({ ...base, home: true, picker: true })).toBe('picker');
  });

  it('wins over a full editor', () => {
    expect(resolveView({ ...base, home: true, editorFull: true })).toBe('home');
  });

  it('is neither an entity view nor a terminal view', () => {
    expect(isEntityView('home')).toBe(false);
    expect(isTerminalView('home')).toBe(false);
  });
});

describe('Work (HIVE-203)', () => {
  const base = { activeTab: 'orch', picker: false, settings: false, home: false, entity: null, editorFull: false, work: false, agents: false, prs: false };

  it('resolves to work', () => {
    expect(resolveView({ ...base, work: true })).toBe('work');
  });

  it('loses to settings and the picker', () => {
    expect(resolveView({ ...base, work: true, settings: true })).toBe('settings');
    expect(resolveView({ ...base, work: true, picker: true })).toBe('picker');
  });

  it('wins over a full editor and an entity', () => {
    expect(resolveView({ ...base, work: true, editorFull: true })).toBe('work');
    expect(resolveView({ ...base, work: true, activeTab: 'hero-refresh', entity: session })).toBe('work');
  });

  it('is neither an entity view nor a terminal view', () => {
    expect(isEntityView('work')).toBe(false);
    expect(isTerminalView('work')).toBe(false);
  });
});

describe('the Agents place (HIVE-204)', () => {
  const base = {
    home: false,
    work: false,
    agents: false,
    prs: false,
    activeTab: 'orch',
    picker: false,
    settings: false,
    entity: null,
    editorFull: false,
  };

  it('shows the agents stage when the place owns it and no agent is the tab', () => {
    expect(resolveView({ ...base, activeTab: 'orch', entity: null, agents: true })).toBe('agents');
    expect(resolveView({ ...base, activeTab: 'hero-refresh', entity: session, agents: true })).toBe('agents');
  });

  it('lets an agent tab resolve to the agent view on the Agents place', () => {
    expect(resolveView({ ...base, activeTab: agent.id, entity: agent, agents: true })).toBe('agent');
  });

  it('loses to settings, the picker, home and work', () => {
    expect(resolveView({ ...base, agents: true, prs: false, settings: true })).toBe('settings');
    expect(resolveView({ ...base, agents: true, prs: false, picker: true })).toBe('picker');
    expect(resolveView({ ...base, agents: true, prs: false, home: true })).toBe('home');
    expect(resolveView({ ...base, agents: true, prs: false, work: true })).toBe('work');
  });

  it('wins over a full editor', () => {
    expect(resolveView({ ...base, agents: true, prs: false, editorFull: true })).toBe('agents');
  });

  it('changes nothing when false', () => {
    expect(resolveView({ ...base, activeTab: 'orch', entity: null, agents: false })).toBe('orchestrator');
  });
});

describe('the PRs place (HIVE-205)', () => {
  const base = {
    home: false,
    work: false,
    agents: false,
    prs: true,
    activeTab: 'orch',
    picker: false,
    settings: false,
    entity: null,
    editorFull: false,
  };
  it('owns the stage in round two', () => expect(resolveView(base)).toBe('prs'));
  it('yields to both overlays', () => {
    expect(resolveView({ ...base, picker: true })).toBe('picker');
    expect(resolveView({ ...base, settings: true })).toBe('settings');
  });
  it('sits above the editor', () => expect(resolveView({ ...base, editorFull: true })).toBe('prs'));
  it('is not an entity or terminal view', () => {
    expect(isEntityView('prs')).toBe(false);
    expect(isTerminalView('prs')).toBe(false);
  });
});
