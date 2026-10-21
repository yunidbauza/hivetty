import type { Capabilities, HarnessId } from '@shared/harness-contract';

/**
 * The port every harness adapter implements (HIVE-233).
 *
 * Methods arrive with the stories that move code behind them: `launch`
 * (HIVE-234), `prepare` (HIVE-235), `readHook` (HIVE-236–238), `record` and
 * `meters` (HIVE-239), `deliverContext` (HIVE-240). See
 * `docs/harness-architecture.md`.
 */
export interface HarnessAdapter {
  readonly id: HarnessId;
  readonly capabilities: Capabilities;
}
