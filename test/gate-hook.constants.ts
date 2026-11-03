/** What the tests of `gate --hook` share: the cli the scratch hooks call and the wordings it prints. */
import { join } from 'node:path'

/** This repository's own cli, as a scratch hook or a spawned process runs it. */
export const REPOSITORY_CLI_PATH = join(import.meta.dirname, '..', 'src', 'cli.ts')

/** The hook step a package's pre-commit hook runs (`npm run test:hook`). */
export const TEST_HOOK_STEP = 'test:hook'

/** The refusal of `--hook` next to `--fast` or `--full`. */
export const HOOK_MODE_REFUSAL = 'gate: --hook, --fast or --full, one of them'

/** The answer of a package whose full gate holds no test step. */
export const NO_TEST_STEP_LINE = 'gate --hook: no test step in gate --full'

/** The last line of a hook run whose test steps passed. */
export const HOOK_GREEN_LINE = 'gate --hook: green'

/** How many characters of a tree the printed wordings show. */
export const HOOK_TREE_LENGTH = 12

/** The line of a test step run by the hook: its line, then vitest's summary line under it. */
export const RUN_STEP_WITH_SUMMARY = /^ok +tests\b[^\n]*\n\s*Tests {2}4 passed \(4\)$/m

/** A gate step line of a step `--hook` never runs: hygiene, tdd, the full gate's non-test steps. */
export const NOT_A_HOOK_STEP_LINE = /^(ok|skip|FAIL|--) +(hygiene|tdd|check)\b/m

/** The hook script's lines running the repository's cli as `npm run test:hook` would. */
export const HOOK_GATE_COMMAND = [
	"printf '\\n> demo@1.0.0 test:hook\\n> node src/cli.ts gate --hook\\n'",
	`node '${REPOSITORY_CLI_PATH}' gate --hook`,
].join('\n')

/** The time and HEAD a reuse line of a hook output names, when the output is written by hand. */
export const WRITTEN_REUSE_AT = '2026-11-03T10:00:00.000Z'
export const WRITTEN_REUSE_HEAD = 'b'.repeat(12)
export const WRITTEN_REUSE_TREE = 'a'.repeat(12)
