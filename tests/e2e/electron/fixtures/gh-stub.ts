import { chmodSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const STUB_REPO = 'hive-e2e/fixture';
export const STUB_PR = 7;

const FIXTURES = join(import.meta.dirname, 'gh-stub');

/**
 * A `gh` that answers the PR page's five calls from canned JSON (HIVE-226).
 *
 * The config puts `dir` first on PATH with `importLoginEnv: false`, so a real
 * Homebrew `gh` never answers instead. An unknown call is logged and fails
 * loudly rather than returning something the parser half-accepts.
 */
export function writeGhStub(dir: string): string {
  const script = `#!/bin/sh
F='${FIXTURES}'
case "$1 $2" in
  'repo view') echo '{"nameWithOwner":"${STUB_REPO}"}'; exit 0 ;;
  'run list') cat "$F/runs.json"; exit 0 ;;
  'run view') cat "$F/jobs.json"; exit 0 ;;
  'api graphql')
    case "$*" in
      *'viewer { login }'*) cat "$F/sweep.json"; exit 0 ;;
      *timelineItems*) cat "$F/timeline.json"; exit 0 ;;
      *'statusCheckRollup { contexts'*) cat "$F/detail.json"; exit 0 ;;
    esac ;;
esac
echo "$*" >> '${dir}/calls.log'
echo 'unknown gh call' >&2
exit 1
`;
  const gh = join(dir, 'gh');
  writeFileSync(gh, script);
  chmodSync(gh, 0o755);
  return dir;
}
