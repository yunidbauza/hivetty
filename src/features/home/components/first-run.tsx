import { FolderSimple, GearSix, Hexagon } from '@phosphor-icons/react';
import type { ReactNode } from 'react';

import { Button } from '@components/ui/button';
import { DirectoryPicker } from '@features/shared/components/directory-picker';
import { useAddProject } from '@hooks/use-add-project';
import { useAttachedServer } from '@hooks/use-project-config';
import { usePickerActions, useSettingsActions } from '@stores/ui-store';

/** Seven pointy-top cells, four over three, radius 24 — the mock's `eFirst` geometry. */
const CENTRES = [
  [60, 50],
  [110, 50],
  [160, 50],
  [210, 50],
  [85, 93],
  [135, 93],
  [185, 93],
] as const;

const hex = (x: number, y: number) =>
  [30, 90, 150, 210, 270, 330]
    .map((a) => {
      const r = (a * Math.PI) / 180;
      return `${(x + 24 * Math.cos(r)).toFixed(1)},${(y + 24 * Math.sin(r)).toFixed(1)}`;
    })
    .join(' ');

/** Creep at 8%, from the token: the cells are the comb's, not yet filled. */
const CELL_FILL = 'color-mix(in srgb, var(--cc-creep) 8%, transparent)';

const STEP_BUTTON = 'inline-flex items-center gap-1.5';

function Step({ title, body, children }: { title: string; body: ReactNode; children: ReactNode }) {
  return (
    <div className="grid w-[220px] content-start gap-2 rounded-xl border border-border bg-panel p-3.5 text-left">
      <b className="text-ui text-ink">{title}</b>
      <span className="text-control text-muted">{body}</span>
      <div className="pt-1">{children}</div>
    </div>
  );
}

/** Home with no project mapped (HIVE-200): the comb's empty cells, breathing, and three steps. */
export function FirstRun() {
  const { addProject, choosing, picking, cancelPicking, onPicked } = useAddProject();
  const attachedServer = useAttachedServer();
  const { openSettings } = useSettingsActions();
  const { openPicker } = usePickerActions();
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 py-10 text-center">
      <svg viewBox="0 0 270 145" className="w-[270px]" aria-hidden="true">
        {CENTRES.map(([x, y], i) => (
          <polygon
            key={`${x}-${y}`}
            points={hex(x, y)}
            className="animate-ccbreathe stroke-subtle"
            strokeWidth={1.4}
            strokeDasharray="4 4"
            style={{ fill: CELL_FILL, animationDelay: `${(i * 0.4).toFixed(1)}s` }}
          />
        ))}
      </svg>
      <h2 className="text-[19px] font-semibold text-ink">An empty hive</h2>
      <p className="text-ui leading-[1.6] text-muted">
        Nothing is running yet. Three steps and the comb fills.
      </p>
      <div className="mt-2 flex flex-wrap justify-center gap-4">
        <Step title="1 · Add a project" body="Point Hive TTY at a repository on this machine.">
          <Button size="sm" variant="primary" className={STEP_BUTTON} onClick={addProject} pending={choosing}>
            <FolderSimple aria-hidden="true" />
            Add a project
          </Button>
        </Step>
        <Step
          title="2 · Connect Jira and GitHub"
          body={
            <>
              Work and PRs fill from them; GitHub uses your <code className="font-mono">gh</code> login.
            </>
          }
        >
          <Button size="sm" className={STEP_BUTTON} onClick={() => openSettings('integrations')}>
            <GearSix aria-hidden="true" />
            Integrations
          </Button>
        </Step>
        <Step title="3 · Start a session" body="In a project, on a ticket, or with a goal.">
          {/* D8: nothing to start in until a project exists; the page leaves once one does. */}
          <Button
            size="sm"
            className={STEP_BUTTON}
            disabled
            title="Add a project first"
            onClick={() => openPicker()}
          >
            <Hexagon aria-hidden="true" />
            New session
          </Button>
        </Step>
      </div>
      <DirectoryPicker
        open={picking}
        onOpenChange={(next) => {
          if (!next) cancelPicking();
        }}
        onChoose={onPicked}
        serverName={attachedServer ?? 'the server'}
        title="Choose a project folder"
        confirmLabel="Add project"
      />
    </div>
  );
}
