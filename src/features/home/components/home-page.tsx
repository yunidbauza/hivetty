import { CombHeadline, headline, summaryText } from '@features/home/components/comb-headline';
import { FirstRun } from '@features/home/components/first-run';
import { HomeStrip } from '@features/home/components/home-strip';
import { TheComb } from '@features/home/components/the-comb';
import { useOnStage } from '@hooks/use-on-stage';
import { useProjectConfig } from '@hooks/use-project-config';
import { useCombSummary, useProjects, useSummonsCount } from '@stores/hive-store';

/**
 * Home under the Round two layout: the headline over The Comb (HIVE-199), the
 * strip under it (HIVE-200), or the first-run page while no project is mapped.
 *
 * The visually hidden `<h1>` keeps the page named for assistive tech and for
 * the shell's own tests; what a sighted reader sees first is the headline.
 */
export function HomePage() {
  const summary = useCombSummary();
  const needs = useSummonsCount(useOnStage());
  const projects = useProjects();
  // `null` is the config not having landed yet; with no bridge (the browser
  // target) it never will, and that absence is the answer, so it is first run.
  const loading = useProjectConfig() === null && window.hive !== undefined;
  const firstRun = projects.length === 0;
  return (
    <section aria-label="Home" className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <h1 className="sr-only">Home</h1>
      {loading ? null : firstRun ? (
        <FirstRun />
      ) : (
        <>
          <div className="relative">
            <TheComb label={`${headline(needs, summary).text}. ${summaryText(summary)}`} />
            <CombHeadline needs={needs} summary={summary} />
          </div>
          <HomeStrip />
        </>
      )}
    </section>
  );
}
