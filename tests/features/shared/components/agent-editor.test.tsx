import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AgentEditor,
  FORM_MIN_PX,
  SOURCE_MIN_PX,
  runRefusal,
} from '@features/shared/components/agent-editor';
import { DEFAULT_AGENT_SPLIT_RATIO, useAppearanceStore } from '@stores/appearance-store';
import { surfaceText } from '@tests/support/editor-surface';

import type { AgentProblem } from '@shared/agent-contract';

const SOURCE = `---
name: slack-watcher
description: Watches #incorp-dev and my mentions.
icon: ChatCircleDots                # a Phosphor name
wake:
  every: 5m                         # floor 1m
  on: [ledger]
autonomy: ask                       # ask | act
limits:
  turns: 40
---
You are the Slack watcher.
`;

interface Props {
  path: string | null;
  source: string;
  dirty: boolean;
  problems: AgentProblem[];
  onChange: (source: string) => void;
  onSave: () => void;
  onDelete: () => void;
  onRevert: () => void;
  notice: string | null;
  taken: readonly string[];
}

const props: Props = {
  path: '/root/agents/slack-watcher/AGENT.md',
  source: SOURCE,
  dirty: false,
  problems: [],
  taken: [],
  onChange: vi.fn(),
  onSave: vi.fn(),
  onDelete: vi.fn(),
  onRevert: vi.fn(),
  notice: null,
};

const setup = (over: Partial<Props> = {}) => {
  const onChange = vi.fn();
  const merged: Props = { ...props, onChange, ...over };

  render(<AgentEditor {...merged} />);

  return { ...merged, onChange: merged.onChange as ReturnType<typeof vi.fn> };
};

beforeEach(() => {
  useAppearanceStore.getState().reset();
});

describe('AgentEditor', () => {
  it('opens on the Form tab', () => {
    setup();

    expect(screen.getByRole('tab', { name: 'Form' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(
      screen.getByDisplayValue('Watches #incorp-dev and my mentions.'),
    ).toBeInTheDocument();
  });

  it('Form and Source are a WAI-ARIA tablist with linked panels (HIVE-225)', () => {
    setup();
    const form = screen.getByRole('tab', { name: 'Form' });
    const source = screen.getByRole('tab', { name: 'Source' });
    expect(form).toHaveAttribute('tabindex', '0');
    expect(source).toHaveAttribute('tabindex', '-1');
    act(() => form.focus());
    fireEvent.keyDown(form, { key: 'ArrowRight' });
    expect(source).toHaveFocus();
    expect(source).toHaveAttribute('aria-selected', 'true');
    const panel = document.getElementById(source.getAttribute('aria-controls')!);
    expect(panel).toHaveAttribute('role', 'tabpanel');
    expect(panel).toHaveAttribute('aria-labelledby', source.id);
  });

  it('shows the path, which is where the bytes go', () => {
    setup();

    expect(
      screen.getByText('/root/agents/slack-watcher/AGENT.md'),
    ).toBeInTheDocument();
  });

  it('says "not saved yet" before it has a path', () => {
    setup({ path: null });

    expect(screen.getByText('not saved yet')).toBeInTheDocument();
  });

  /*
    happy-dom does not evaluate container queries, so this asserts the classes
    that do the work and that both panes are mounted.
  */
  it('shows Form and Source together, with the tabs hidden by the 900px container query', () => {
    setup();

    expect(screen.getByRole('textbox', { name: 'description' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Agent source' })).toBeInTheDocument();
    expect(screen.getByRole('tablist', { name: 'Agent editor view' })).toHaveClass('@min-[900px]:hidden');
    expect(screen.getByRole('slider', { name: 'Resize the form and the source' }).parentElement).toHaveClass(
      '@min-[900px]:grid-cols-[minmax(460px,var(--agent-form-w))_12px_minmax(320px,1fr)]',
    );
  });

  it('puts a resize seam between Form and Source, wide only, drawn as the rails’ grip gutter', () => {
    setup();

    const seam = screen.getByRole('slider', { name: 'Resize the form and the source' });
    expect(seam).toHaveClass('hidden', '@min-[900px]:block', 'w-3', 'bg-bg');
    expect(seam.querySelectorAll('.rounded-full')).toHaveLength(3);
  });

  it('in tabs layout, always shows Form | Source and never the seam', async () => {
    render(<AgentEditor {...props} layout="tabs" />);

    const tabs = screen.getByRole('tablist', { name: 'Agent editor view' });
    expect(tabs).not.toHaveClass('@min-[900px]:hidden');
    expect(screen.queryByRole('slider', { name: 'Resize the form and the source' })).toBeNull();

    await userEvent.click(screen.getByRole('tab', { name: 'Source' }));
    expect(screen.getByRole('textbox', { name: 'Agent source' }).closest('.hidden')).toBeNull();
  });

  it('holds both panes to their minimum widths while dragging, and double-click resets', () => {
    setup();

    const seam = screen.getByRole('slider', { name: 'Resize the form and the source' });
    (seam.parentElement as HTMLElement).getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 1000, height: 600 }) as DOMRect;

    fireEvent.pointerDown(seam);
    fireEvent.pointerMove(window, { clientX: 100 });
    fireEvent.pointerUp(window);
    expect(useAppearanceStore.getState().agentSplitRatio).toBeCloseTo((FORM_MIN_PX + 6) / 1000);

    fireEvent.pointerDown(seam);
    fireEvent.pointerMove(window, { clientX: 950 });
    fireEvent.pointerUp(window);
    expect(useAppearanceStore.getState().agentSplitRatio).toBeCloseTo(1 - (SOURCE_MIN_PX + 6) / 1000);

    fireEvent.doubleClick(seam);
    expect(useAppearanceStore.getState().agentSplitRatio).toBe(DEFAULT_AGENT_SPLIT_RATIO);
  });

  it('reads unsaved in amber while dirty', () => {
    setup({ dirty: true });

    expect(screen.getByText('unsaved')).toHaveClass('text-amber-text');
  });

  it("runRefusal gives today's sentences", () => {
    expect(runRefusal(null, false)).toBe('Save it first — there is no definition on disk yet.');
    expect(runRefusal('/a/AGENT.md', true)).toBe('Save first — a wake reads the file, not this buffer.');
    expect(runRefusal('/a/AGENT.md', false)).toBeNull();
  });

  describe('the form patches the file', () => {
    it('changes only the value, keeping the trailing comment', async () => {
      const { onChange } = setup();

      await userEvent.click(screen.getByRole('radio', { name: 'act' }));

      const next = onChange.mock.calls[0]?.[0] as string;

      expect(next).toContain('autonomy: act');
      expect(next).toContain('# ask | act');
      // Every other line survives untouched — the whole point of patching.
      expect(next).toContain('icon: ChatCircleDots                # a Phosphor name');
      expect(next).toContain('You are the Slack watcher.');
    });

    it('writes a wake interval', async () => {
      const { onChange } = setup();

      await userEvent.click(screen.getByRole('radio', { name: '15m' }));

      expect(onChange.mock.calls[0]?.[0]).toContain('every: 15m');
    });

    it('removes the line entirely for wake off, since absence is the value', async () => {
      // `every: off` is not a value the grammar has — manual-only is expressed
      // by the key simply not being there.
      const { onChange } = setup();

      await userEvent.click(screen.getByRole('radio', { name: 'off' }));

      expect(onChange.mock.calls[0]?.[0]).not.toContain('every:');
    });

    /*
      Was driven through the icon field, which is a picker rather than a text
      box since the roster landed. `description` is the remaining free-text
      field, and the assertion it carries — a keystroke reaches the buffer — is
      unchanged.
    */
    it('edits a text field', async () => {
      const { onChange } = setup();

      await userEvent.type(screen.getByDisplayValue('Watches #incorp-dev and my mentions.'), '!');

      expect(onChange.mock.calls[0]?.[0]).toContain('Watches #incorp-dev and my mentions.!');
    });

    it('removes the line when a field is cleared, rather than leaving key:', async () => {
      /*
        Absence is a value in this grammar and there is no token that spells
        it. Writing an empty `skills:` produced a line the parser rejects, so
        clearing an optional field jammed the form with no way out but the
        Source tab.
      */
      const withSkills = SOURCE.replace(
        'autonomy: ask',
        'skills: [a]\nautonomy: ask',
      );
      const onChange = vi.fn();

      render(<AgentEditor {...props} source={withSkills} onChange={onChange} />);
      await userEvent.clear(screen.getByDisplayValue('[a]'));

      expect(onChange.mock.calls[0]?.[0]).not.toContain('skills:');
    });
  });

  describe('a file with no frontmatter', () => {
    const FENCELESS = 'name: a\ndescription: d\n';

    it('says so instead of rendering a form that does nothing', () => {
      // Every field would read blank and every keystroke would be a no-op,
      // because patchFrontmatter returns the source unchanged. This is exactly
      // the file the pane promises can be opened and fixed.
      render(<AgentEditor {...props} source={FENCELESS} />);

      expect(
        screen.getByText('This file has no frontmatter.'),
      ).toBeInTheDocument();
      expect(screen.getByText(/Fix it in the Source tab/)).toBeInTheDocument();
    });

    it('still lets the Source tab edit it', async () => {
      const onChange = vi.fn();

      render(<AgentEditor {...props} source={FENCELESS} onChange={onChange} />);
      await userEvent.click(screen.getByRole('tab', { name: 'Source' }));
      await userEvent.type(
        screen.getByRole('textbox', { name: 'Agent source' }),
        '-',
      );

      expect(onChange).toHaveBeenCalled();
    });
  });

  /*
    Every frontmatter field has a `FIELD_HELP` sentence under its control; the
    body — the largest thing in the file and the one users read as a
    self-description rather than as the job — had none anywhere.
  */
  describe('what the body is for', () => {
    it('says the body is carried out on every wake', async () => {
      setup();

      await userEvent.click(screen.getByRole('tab', { name: 'Source' }));

      expect(screen.getByText(/carried out on every wake/)).toBeInTheDocument();
    });

    it('hides it on the narrow Form tab, where there is no body to explain', () => {
      setup();

      const pane = screen.getByText(/carried out on every wake/).parentElement;

      expect(pane).toHaveClass('hidden');
      expect(pane).toHaveClass('@min-[900px]:flex');
    });
  });

  describe('the two tabs are one buffer', () => {
    it('shows the same bytes in Source that the form is editing', async () => {
      setup();

      await userEvent.click(screen.getByRole('tab', { name: 'Source' }));

      expect(surfaceText('Agent source')).toBe(SOURCE);
    });

    it('edits the buffer from the Source tab too', async () => {
      const { onChange } = setup();

      await userEvent.click(screen.getByRole('tab', { name: 'Source' }));
      await userEvent.type(
        screen.getByRole('textbox', { name: 'Agent source' }),
        'x',
      );

      expect(onChange).toHaveBeenCalled();
    });

    it('does not lose an edit made in the form when switching to Source', async () => {
      const edited = SOURCE.replace('autonomy: ask', 'autonomy: act');

      const { rerender } = render(<AgentEditor {...props} source={edited} />);

      rerender(<AgentEditor {...props} source={edited} />);
      await userEvent.click(screen.getByRole('tab', { name: 'Source' }));

      expect(surfaceText('Agent source')).toBe(edited);
    });
  });

  describe('problems', () => {
    it('renders a problem beside the field it names', () => {
      setup({
        problems: [
          { field: 'skills', reason: 'release-notes is not in ~/.hive/skills.' },
        ],
      });

      expect(
        screen.getByText('release-notes is not in ~/.hive/skills.'),
      ).toBeInTheDocument();
    });

    it('shows an unknown key, which has no field of its own', () => {
      setup({
        problems: [
          { field: 'nope', reason: 'Unknown key. Remove it or fix the spelling.' },
        ],
      });

      /*
        Once, in the form's unmatched block — the footer only counts it. The
        path and the sentence are separate nodes now, so the sentence is what
        is matched: a reader scanning for the complaint should not have to read
        past a key path to find it.
      */
      expect(
        screen.getAllByText('Unknown key. Remove it or fix the spelling.'),
      ).toHaveLength(1);
      expect(screen.getByText('nope:')).toBeInTheDocument();
    });

    it('shows a whole-file problem in the footer, which owns it alone', () => {
      setup({
        problems: [
          { field: '', reason: 'AGENT.md must open and close with a --- line.' },
        ],
      });

      // Exactly once: it has no field to sit beside, so only the footer says it.
      expect(
        screen.getAllByText(/must open and close with a --- line/),
      ).toHaveLength(1);
    });

    it('counts field problems rather than repeating them in the footer', () => {
      setup({
        problems: [
          { field: 'skills', reason: 'release-notes is not in ~/.hive/skills.' },
          { field: 'wake.every', reason: 'Cannot be faster than 1m.' },
        ],
      });

      // Each sentence appears once, beside its own field.
      expect(
        screen.getAllByText('Cannot be faster than 1m.'),
      ).toHaveLength(1);
      expect(screen.getByText('2 problems — see the form.')).toBeInTheDocument();
    });

    it('states the naming rule when there is nothing wrong', () => {
      setup();

      expect(
        screen.getByText('The name in the frontmatter names the folder.'),
      ).toBeInTheDocument();
    });
  });

  describe('the footer', () => {
    /*
      Run now left the footer for the agent page's header (HIVE-204), which
      shows it in both views; the footer keeps the verbs about this buffer.
    */
    it('has no Run now', () => {
      setup();

      expect(screen.queryByRole('button', { name: 'Run now' })).toBeNull();
    });

    it('enables Revert only while dirty, and reverts on click', async () => {
      const onRevert = vi.fn();
      const { unmount } = render(<AgentEditor {...props} onRevert={onRevert} />);

      expect(screen.getByRole('button', { name: 'Revert' })).toBeDisabled();
      unmount();

      render(<AgentEditor {...props} dirty onRevert={onRevert} />);
      await userEvent.click(screen.getByRole('button', { name: 'Revert' }));

      expect(onRevert).toHaveBeenCalledTimes(1);
    });

    it('saves and deletes', async () => {
      const onSave = vi.fn();
      const onDelete = vi.fn();

      setup({ onSave, onDelete });

      await userEvent.click(screen.getByRole('button', { name: 'Save' }));
      await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

      expect(onSave).toHaveBeenCalled();
      expect(onDelete).toHaveBeenCalled();
    });

    it('says whether the buffer is unsaved', () => {
      const { unmount } = render(<AgentEditor {...props} dirty />);

      expect(screen.getByText('unsaved')).toBeInTheDocument();
      unmount();

      render(<AgentEditor {...props} />);
      expect(screen.getByText('saved')).toBeInTheDocument();
    });
  });

  /*
    The Source tab is the explorer's own editor now, not a textarea, and the
    three things that buys are the reason: a gutter (the footer reports problems
    by line), the floating find panel, and ⌘S bound *inside* the view — the only
    place a save shortcut can be bound and still fire while CodeMirror holds
    focus.
  */
  describe('the Source tab is a real editor', () => {
    it('numbers the lines', async () => {
      const { container } = render(<AgentEditor {...props} />);
      await userEvent.click(screen.getByRole('tab', { name: 'Source' }));

      expect(container.querySelector('.cm-lineNumbers')).not.toBeNull();
    });

    it('saves on ⌘S while the editor holds focus', async () => {
      const onSave = vi.fn();
      render(<AgentEditor {...props} onSave={onSave} />);
      await userEvent.click(screen.getByRole('tab', { name: 'Source' }));

      fireEvent.keyDown(screen.getByRole('textbox', { name: 'Agent source' }), {
        key: 's',
        metaKey: true,
      });

      /*
        Once, not twice. CodeMirror prevents the default when it handles the
        key and the event still bubbles to the frame's own listener — and a
        second save is not harmless here, because a rename goes through a
        different bridge call than a write.
      */
      expect(onSave).toHaveBeenCalledTimes(1);
    });

    it('saves on ⌘S from the Form tab too, where there is no editor', () => {
      const onSave = vi.fn();
      render(<AgentEditor {...props} onSave={onSave} />);

      fireEvent.keyDown(screen.getByRole('textbox', { name: 'name' }), {
        key: 's',
        metaKey: true,
      });

      expect(onSave).toHaveBeenCalledTimes(1);
    });

    it('leaves every other key to whatever is focused', () => {
      const onSave = vi.fn();
      render(<AgentEditor {...props} onSave={onSave} />);

      fireEvent.keyDown(screen.getByRole('textbox', { name: 'name' }), {
        key: 's',
      });

      expect(onSave).not.toHaveBeenCalled();
    });
  });
});
