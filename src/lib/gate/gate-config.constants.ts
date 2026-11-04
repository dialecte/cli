import type { GateStep } from './gate-config.types.ts'

/**
 * The Definition of Done of a Dialecte package when its package.json declares no `dialecte.gate`.
 * `--fast` while iterating; `--full` once per lot. The docs build and the type bench are contributor checks:
 * `dialecte contrib` runs them (`DEFAULT_CONTRIB_STEPS`). The suite runs with the runner's defaults (every file in
 * parallel); a test step that fails is rerun once, serially, on its failing files to tell a flake from a real
 * failure.
 */
export const DEFAULT_GATE_STEPS: Readonly<Record<'fast' | 'full', readonly GateStep[]>> = {
	fast: [
		{ name: 'check', run: 'npm run check' },
		{ name: 'skills', run: 'npm run skills:check' },
		{ name: 'tests', run: 'npx vitest run --changed', counts: 'tests', changedOnly: true },
	],
	full: [
		{ name: 'check', run: 'npm run check' },
		{ name: 'skills', run: 'npm run skills:check' },
		{ name: 'build', run: 'npm run build' },
		{ name: 'tests', run: 'npx vitest run', counts: 'tests' },
	],
}

/** `npm run <script>` at the start of a step: a package without that script skips the step. */
export const NPM_RUN_PATTERN = /^npm run ([^\s;&|]+)/

/** How many last lines of a failed step's output the gate prints. */
export const FAILED_OUTPUT_TAIL_LINES = 30

/** What vitest prints when it finds no test file to run (with `--changed`: none the change affects). */
export const NO_AFFECTED_TEST_PATTERN = /^No test files found/m

export const NO_AFFECTED_TEST_NOTE = 'no test file is affected by the change'

/** The mark at the start of a step's line, by its status: as wide as each other, so the names line up. */
export const STEP_LINE_MARKS = {
	passed: 'ok  ',
	failed: 'FAIL',
	skipped: 'skip',
	'not-run': '--  ',
} as const

/** What the line of a step says when an earlier step failed. */
export const NOT_RUN_STEP_DETAIL = 'not run: an earlier step failed'

/** Before each line shown under a step's line (the tdd step's flags, deleted cases). */
export const STEP_DETAIL_INDENT = '        '

/** The verdict of a gate whose steps a green record answered. */
export const GATE_REUSED_VERDICT = 'gate --{mode}: green (reused)'

/** Before the verdict, when the tree, the install or a linked dependency changed while the steps ran. */
export const GATE_STATE_CHANGED_LINE =
	'not stored for reuse: the files, node_modules or a linked dependency changed while the steps ran'

/** What a step's command must run (itself, or through the npm script it runs) to be rerun serially on a failure. */
export const VITEST_COMMAND_PATTERN = /\bvitest\b/

/**
 * A failing file vitest names in its report: `FAIL  [|project| ]<file> > ...` or `FAIL  [|project| ]<file> [ ... ]`;
 * another line that starts with `FAIL` (a gate line printed in a diff) names none.
 */
export const FAILING_FILE_PATTERN = /^\s*FAIL\s+(?:\|[^|\n]*\|\s+)?(\S+) (?:>|\[) /gm

/** The flag of the rerun: one test file at a time. */
export const SERIAL_FLAG = '--no-file-parallelism'

/** A command that already runs one test file at a time: the rerun's flag, or vitest's option set to false. */
export const SERIAL_RUN_PATTERN = /(^|\s)(--no-file-parallelism|--fileParallelism[= ]false)(\s|$)/

/** The note of a step that failed in parallel and passed on its serial rerun. */
export const FLAKY_NOTE = 'flaky in parallel'

/** Before the reason of a step that failed in parallel and on its serial rerun. */
export const REAL_FAILURE_PREFIX = 'real failure: '

/** A command that already holds the `--` after which npm hands the words to the script. */
export const ARGUMENT_SEPARATOR_PATTERN = /(^|\s)--(\s|$)/

/** Why a test step failed that counted no test. */
export const NO_TEST_RAN_REASON = 'no test ran'

/** `gate --hook` next to `--fast` or `--full`. */
export const GATE_HOOK_MODE_REFUSAL = 'gate: --hook, --fast or --full, one of them'

/** `gate --hook` on a package whose `gate --full` holds no step counting tests. */
export const GATE_HOOK_NO_TEST_STEP_LINE = 'gate --hook: no test step in gate --full'

/** `gate --hook` answered by a green `gate --full` record of the committed tree: the one line it prints. */
export const GATE_HOOK_REUSED_LINE =
	'gate --hook: tests reused from gate --full green on tree {tree} at {at} (HEAD {head})'

/** `GATE_HOOK_REUSED_LINE` as a hook's output holds it: the tree, the time and the HEAD it names. */
export const GATE_HOOK_REUSED_PATTERN =
	/^gate --hook: tests reused from gate --full green on tree (\S+) at (\S+) \(HEAD ([0-9a-f]+)\)$/m

/** `gate --hook` with no green `gate --full` record of that key: the line before the test steps it runs. */
export const GATE_HOOK_RUNNING_LINE =
	'gate --hook: no green gate --full of tree {tree} with this install: running the tests'

/** The verdict of a `gate --hook` whose test steps passed. */
export const GATE_HOOK_GREEN_LINE = 'gate --hook: green'

/** The verdict of a `gate --hook` whose test step `{step}` failed. */
export const GATE_HOOK_FAILED_LINE = 'gate --hook: failed at {step}'

/**
 * vitest's summary line, written once after the test steps `gate --hook` ran (their counts summed), so a hook's
 * reader counts every test of the hook's one step.
 */
export const VITEST_TESTS_LINE = '      Tests  {counts} ({total})'

/** Between the counts of `VITEST_TESTS_LINE`, as vitest writes them. */
export const VITEST_COUNT_SEPARATOR = ' | '
