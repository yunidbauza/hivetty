import { ComingUp } from '@features/home/components/coming-up';
import { Limits } from '@features/home/components/limits';
import { NeedsYou } from '@features/home/components/needs-you';
import { PrCounts } from '@features/home/components/pr-counts';
import { WhileYouWereAway } from '@features/home/components/while-you-were-away';
import { useOnStage } from '@hooks/use-on-stage';
import { useSummonsCount } from '@stores/hive-store';

/** The strip under the comb (HIVE-200): the same three columns at every moment. */
export function HomeStrip() {
  const needs = useSummonsCount(useOnStage());
  return (
    <div className="grid grid-cols-[1.4fr_1fr_1fr] gap-9 border-t border-border px-7 py-4">
      {needs > 0 ? <NeedsYou /> : <WhileYouWereAway />}
      <div className="min-w-0">
        <ComingUp />
      </div>
      <div className="min-w-0">
        <Limits />
        <PrCounts />
      </div>
    </div>
  );
}
