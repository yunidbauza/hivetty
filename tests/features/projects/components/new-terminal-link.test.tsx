import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  emptySnapshot,
  type ConfigSnapshot,
  type ProjectStatus,
} from '@shared/config-contract';

import { NewTerminalLink } from '@features/projects/components/new-terminal-link';
import { resetProjectConfig, setProjectConfigForTest } from '@lib/project-config';
import { useHiveStore } from '@stores/hive-store';
import { useUiStore } from '@stores/ui-store';

import { testProjectKey } from '@tests/support/project-key';

/**
 * Opening a terminal in a project, from the tree (terminals).
 *
 * Against the real stores, exactly as `new-session-link.test.tsx` is: what the
 * link owes the user is a terminal on the right project, and only the entity
 * the store actually created can prove that.
 */

const CONFIG_PATH = '/home/dev/.hive/config.json';
const PROJECT = 'nova-web';
/** Deliberately not the id, so a name match cannot pass for an id match. */
const PROJECT_NAME = 'NOVA Web';

function snapshot(
  projects: { id: string; status: ProjectStatus }[],
): ConfigSnapshot {
  return {
    // The merged tree's own defaults, as `new-session-link.test.tsx` builds
    // them, so a field added to the snapshot lands here without a hand edit.
    ...emptySnapshot(CONFIG_PATH, '/bin/zsh'),
    projects: projects.map(({ id, status }) => ({
      id,
      path: status === 'ok' ? `/repos/${id}` : null,
      name: id,
      icon: 'ph-folder',
      origin: 'local' as const,
      status,
      key: testProjectKey(id),
      isRepo: true,
    })),
  };
}

beforeEach(() => {
  useHiveStore.getState().reset();
  useUiStore.getState().reset();
  resetProjectConfig();
});

afterEach(() => {
  resetProjectConfig();
});

describe('NewTerminalLink', () => {
  it('is named "Terminal in <project>", never "new …"', () => {
    setProjectConfigForTest(snapshot([{ id: PROJECT, status: 'ok' }]));
    render(<NewTerminalLink projectId={PROJECT} projectName={PROJECT_NAME} />);

    /*
      Playwright matches accessible names as a case-insensitive substring, and
      the header's `New session` button already needs `exact: true` to be told
      from the tree's session links. A second control whose name began "new "
      would make every existing locator worse.
    */
    const link = screen.getByRole('button', {
      name: `Terminal in ${PROJECT_NAME}`,
    });
    // The visible text is still inside the name — Label in Name.
    expect(link).toHaveTextContent('terminal');
    expect(link.getAttribute('aria-label')?.toLowerCase().startsWith('new')).toBe(
      false,
    );
  });

  it('spawns a terminal in the project on click, and opens it', async () => {
    setProjectConfigForTest(snapshot([{ id: PROJECT, status: 'ok' }]));
    render(<NewTerminalLink projectId={PROJECT} projectName={PROJECT_NAME} />);

    await userEvent.click(screen.getByRole('button'));

    const { order, entities } = useHiveStore.getState();
    const last = entities[order.at(-1)!];
    expect(last).toMatchObject({ kind: 'terminal', project: PROJECT });
    expect(useUiStore.getState().activeTab).toBe(last!.id);
  });

  it('says what the click is about to do', () => {
    setProjectConfigForTest(snapshot([{ id: PROJECT, status: 'ok' }]));
    render(<NewTerminalLink projectId={PROJECT} projectName={PROJECT_NAME} />);

    expect(screen.getByRole('button')).toHaveAttribute(
      'title',
      'Opens a login shell at the project root',
    );
  });

  it('is disabled with the same reason the session link gives', async () => {
    setProjectConfigForTest(snapshot([{ id: 'referral-api', status: 'ok' }]));
    render(<NewTerminalLink projectId={PROJECT} projectName={PROJECT_NAME} />);

    const link = screen.getByRole('button');
    expect(link).toBeDisabled();
    expect(link).toHaveAttribute('title', expect.stringContaining(CONFIG_PATH));

    await userEvent.click(link);
    expect(useHiveStore.getState().order).toHaveLength(0);
  });

  it('says host for a container project, and explains in the title', () => {
    const base = snapshot([{ id: PROJECT, status: 'ok' }]);
    setProjectConfigForTest({
      ...base,
      projects: base.projects.map((project) => ({
        ...project,
        container: { workspace: '/workspace', hiveDir: '/hive' },
      })),
    });
    render(<NewTerminalLink projectId={PROJECT} projectName={PROJECT_NAME} />);

    const link = screen.getByRole('button');
    // The trap is adjacency: an unlabelled terminal beside containerised
    // sessions reads as the container and lands on the Mac.
    expect(link).toHaveTextContent('terminal · host');
    expect(link).toHaveAttribute('title', expect.stringMatching(/container/i));
    expect(link).toBeEnabled();
  });
});
