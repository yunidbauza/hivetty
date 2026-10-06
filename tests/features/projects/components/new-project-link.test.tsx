import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { NewProjectLink } from '@features/projects/components/new-project-link';
import {
  resetProjectConfig,
  setAttachedServerForTest,
  setProjectConfigForTest,
} from '@lib/project-config';
import { emptySnapshot } from '@shared/config-contract';

const chooseProjectDirectory = vi.fn();
const addProjectToConfig = vi.fn();

vi.mock('@lib/project-config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@lib/project-config')>();
  return {
    ...actual,
    chooseProjectDirectory: () => chooseProjectDirectory(),
    addProjectToConfig: (request: unknown) => addProjectToConfig(request),
  };
});

/**
 * Put this window in the attached state (HIVE-144 review, C1).
 *
 * The snapshot is the plain one on purpose: while attached, `config:get` is
 * answered by the server, whose own `remote.mode` reads `'local'`. Attachment
 * is the runtime fact beside it, and `setAttachedServerForTest` is the only
 * place it lives.
 */
function attach(): void {
  setProjectConfigForTest(emptySnapshot('/home/dev/.hive/config.json', '/bin/zsh'));
  setAttachedServerForTest('mini.tail1234.ts.net');
}

/**
 * Mapping a project from the rail, without a detour through Settings.
 *
 * The flow itself is `useAddProject`'s, and is asserted there. What this file
 * owes is the button: that the click reaches that flow, and that the visible
 * word is in the accessible name so a screen-reader user and a sighted user
 * are talking about the same control.
 */
describe('NewProjectLink', () => {
  beforeEach(() => {
    chooseProjectDirectory.mockReset();
    addProjectToConfig.mockReset();
    chooseProjectDirectory.mockResolvedValue(null);
    addProjectToConfig.mockResolvedValue(undefined);
  });

  it('maps the directory the user chooses', async () => {
    const user = userEvent.setup();
    chooseProjectDirectory.mockResolvedValue('/repos/nova-web');

    render(<NewProjectLink />);
    await user.click(screen.getByRole('button', { name: /new project/i }));

    await waitFor(() => {
      expect(addProjectToConfig).toHaveBeenCalledWith({
        path: '/repos/nova-web',
      });
    });
  });

  it('writes nothing when the dialog is cancelled', async () => {
    const user = userEvent.setup();
    chooseProjectDirectory.mockResolvedValue(null);

    render(<NewProjectLink />);
    await user.click(screen.getByRole('button', { name: /new project/i }));

    expect(addProjectToConfig).not.toHaveBeenCalled();
  });

  /**
   * Label in Name: the accessible name contains the visible text, so voice
   * control reaches this button by the word the user can read on it. It says
   * more than the visible text because a rail button reached out of context
   * has to name what kind of thing it adds.
   */
  it('keeps the visible word in the accessible name', () => {
    render(<NewProjectLink variant="cta" />);

    expect(
      screen.getByRole('button', { name: 'Add a new project' }),
    ).toHaveTextContent('new project');
  });

  /**
   * Two registers, one control: same role, same accessible name, so nothing
   * reached by name, by voice or by a screen reader can tell the empty state's
   * button from the panel head's +. The head's is the plus alone; the empty
   * state's carries the words and the border.
   */
  it('keeps the same control in both registers', () => {
    const { unmount } = render(<NewProjectLink />);

    const icon = screen.getByRole('button', { name: 'Add a new project' });
    expect(icon).toHaveTextContent('');
    // The atom's ghost border is reset: the icon draws none (HIVE-225).
    expect(icon).toHaveClass('border-0');
    expect(icon.className).not.toContain('border-border');

    unmount();
    render(<NewProjectLink variant="cta" />);

    const cta = screen.getByRole('button', { name: 'Add a new project' });
    expect(cta).toHaveTextContent('new project');
    expect(cta.className).toContain('border-border');
  });

  it('cannot open a second dialog while one is open', async () => {
    const user = userEvent.setup();
    chooseProjectDirectory.mockReturnValue(new Promise<string | null>(() => {}));

    render(<NewProjectLink />);
    const button = screen.getByRole('button', { name: /new project/i });
    await user.click(button);

    await waitFor(() => expect(button).toHaveAttribute('aria-disabled', 'true'));
    expect(chooseProjectDirectory).toHaveBeenCalledTimes(1);
  });

  /**
   * While attached to someone else's Hive, `config:choose-directory` opens on
   * the server, which has no window. The click still never reaches the bridge;
   * what changed in HIVE-146 is that it now reaches the server-side picker
   * instead of nothing.
   */
  describe('attached to a remote server', () => {
    afterEach(() => {
      resetProjectConfig();
    });

    /**
     * HIVE-144 disabled this control while attached, because the only thing it
     * could do was fail. HIVE-146 gave it something to do, so the assertion
     * inverts: it stays live, and a click opens the server-side picker.
     */
    it('stays live and opens the picker', async () => {
      attach();
      const user = userEvent.setup();

      render(<NewProjectLink />);
      const button = screen.getByRole('button', { name: /new project/i });
      expect(button).toBeEnabled();

      await user.click(button);

      expect(
        await screen.findByRole('dialog', { name: /Choose a project folder/i }),
      ).toBeInTheDocument();
    });

    it('never opens the native dialog', async () => {
      attach();
      const user = userEvent.setup();

      render(<NewProjectLink />);
      await user.click(screen.getByRole('button', { name: /new project/i }));

      expect(chooseProjectDirectory).not.toHaveBeenCalled();
    });
  });
});
