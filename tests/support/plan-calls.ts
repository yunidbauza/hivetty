import { planOpOf } from '../../electron/main/harness/claude-code/plan-ops';
import type { PlanOp, PlanUpdate } from '../../electron/shared/plan-contract';

/** A Claude-shaped plan tool call, the shape the plans tests were written in (HIVE-238). */
export interface ClaudePlanCall {
  entityId: string;
  toolName: string;
  toolInput: unknown;
  toolResponse: unknown;
  cwd?: string;
  truncated?: true;
}

/** Through the adapter, as `readHook` does: `Stop` re-reads, anything else by its tool name. */
export const toPlanUpdate = (call: ClaudePlanCall): PlanUpdate | undefined => {
  const op: PlanOp | undefined =
    call.toolName === 'Stop' ? { kind: 'plan-file-reread' } : planOpOf(call.toolName, call.toolInput, call.toolResponse);
  return op === undefined ? undefined : { entityId: call.entityId, op, ...(call.cwd === undefined ? {} : { cwd: call.cwd }) };
};
