import { GithubLogo } from '@phosphor-icons/react';

import { isAgent } from '@/types/entity';

import { Button } from '@components/ui/button';
import { CombGlyph } from '@components/ui/comb-glyph';
import { EmptyPlace } from '@components/ui/empty-place';
import {
  useActiveEntity,
  usePrSource,
  useProjects,
  useRefreshPrs,
  useSpawnTerminal,
  type GhSetupReason,
} from '@stores/hive-store';

/** Each reason's title; signed out has its own page below. */
const TITLE: Record<Exclude<GhSetupReason, 'unauthenticated' | null>, string> = {
  'not-installed': "The GitHub CLI isn't installed",
  'no-repos': 'No GitHub project yet',
};
const BROWSER_TITLE = "Pull requests aren't available here";

/**
 * The PRs place with nothing to list because gh gave nothing (HIVE-211): not
 * installed, signed out, no GitHub project, the browser preview, or a first
 * sweep that failed. Open a terminal lands in the project on stage, else the
 * first (D3), and is absent with no project or no gh to run.
 */
export function GhSetupPage() {
  const source = usePrSource();
  const refresh = useRefreshPrs();
  const projects = useProjects();
  const active = useActiveEntity();
  const spawnTerminal = useSpawnTerminal();

  if (source.kind !== 'unconfigured' && source.kind !== 'failed') return null;

  const project = active !== null && !isAgent(active) ? active.project : projects[0]?.id;
  const reason = source.kind === 'unconfigured' ? source.reason : undefined;
  const terminal =
    reason !== null && project !== undefined ? (
      <Button onClick={() => spawnTerminal(project)}>Open a terminal</Button>
    ) : null;
  const actions = (
    <>
      {terminal}
      <Button variant="primary" onClick={() => void refresh()}>
        {source.kind === 'failed' ? 'Retry' : 'Check again'}
      </Button>
    </>
  );
  const glyph = <CombGlyph icon={GithubLogo} />;

  if (reason === 'unauthenticated') {
    return (
      <EmptyPlace label="Pull requests" glyph={glyph} title="The GitHub CLI isn't signed in" actions={actions}>
        <p>
          PRs come from <code className="font-mono">gh</code>, run as you. Hive TTY stores no GitHub token.
        </p>
        <pre className="my-3 rounded-md bg-chip px-3 py-2 text-left font-mono text-control text-ink">
          <code>gh auth login</code>
        </pre>
        <p>
          Settings › Integrations › Command line shows which <code className="font-mono">gh</code> the app found
          and who it is signed in as.
        </p>
      </EmptyPlace>
    );
  }

  const title =
    reason === undefined ? "Couldn't read GitHub" : reason === null ? BROWSER_TITLE : TITLE[reason];
  return (
    <EmptyPlace label="Pull requests" glyph={glyph} title={title} actions={actions}>
      {source.message}
    </EmptyPlace>
  );
}
