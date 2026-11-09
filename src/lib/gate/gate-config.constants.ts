import type { GateListName, GateStep } from './gate-config.types.ts'

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

/** The step lists of `dialecte.gate`, each validated whatever mode resolves. */
export const GATE_LIST_NAMES: readonly GateListName[] = ['fast', 'full', 'release']

/** How a gate list is named in a `GateConfigError`; `{list}` is `fast`, `full` or `release`. */
export const GATE_LIST_LABEL = 'dialecte.gate.{list}'

/** A step list that is no list; `{list}` is the list's label. */
export const INVALID_STEP_LIST =
	'{list}: a list of steps, such as [{ "name": "tests", "run": "npx vitest run" }]'

/** An invalid step of a list: `{list}` its label, `{step}` the step (its name, else its position and run). */
export const INVALID_STEP = '{list}, step {step}: {problem}'

/** What is wrong with a step, as `INVALID_STEP`'s `{problem}` says it. */
export const INVALID_STEP_PROBLEMS = {
	notAnObject: 'a step is an object with a "name" and a "run"',
	noName: 'no "name" (a non-empty string)',
	noRun: 'no "run" (a non-empty shell command)',
	notBoolean: '"{field}" is true or false',
	scopedWithChangedOnly:
		'"scoped" and "changedOnly" together: a step runs one selection, never two',
	scopedRefused: '"scoped" is refused here: this list has no base to select against',
} as const

/** The step flags that are true or false when present. */
export const BOOLEAN_STEP_FIELDS = ['scoped', 'heavy'] as const

/**
 * Steps `gate --full` and `contrib` derive from the package's scripts, after their own: a check a publish
 * workflow runs (core's runs `type-narrowing`). Added when the package has the script and no step runs it.
 */
export const DERIVED_STEPS: readonly GateStep[] = [
	{ name: 'type-narrowing', run: 'npm run type-narrowing' },
]

/** Why a step running an npm script the package lacks is skipped. */
export const NO_NPM_SCRIPT_REASON = 'no npm script "{script}"'

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

/**
 * vitest's markers of an error outside any test: its `Unhandled Errors` banner (`⎯⎯ Unhandled Errors ⎯⎯`) or its
 * summary's `Errors  <n> error(s)` line. A run that shows one failed on a test failure, as a failed test does.
 */
export const VITEST_ERROR_PATTERN = /^[\s⎯]*Unhandled Errors?\b|^\s*Errors\s+\d+\s+errors?\b/m

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

/** `gate --release` next to `--fast`, `--full` or `--hook`. */
export const GATE_RELEASE_MODE_REFUSAL =
	'gate: --release runs alone, not with --fast, --full or --hook'

/** A gate whose config the cli cannot run: `{message}` is the `GateConfigError`'s. */
export const GATE_CONFIG_REFUSAL = 'gate: {message}'

/** `--base <ref>` naming no commit, with a scoped step: `{refusal}` is `resolveGateBase`'s. */
export const GATE_BASE_REFUSAL_LINE = 'gate: {refusal}'

/** A scoped step ran with the base `--base` set: said once. */
export const GATE_BASE_FLAG_LINE =
	'base from --base: no hand-over reuses this record unless its base is the same'

/** `gate --release` on a declared list that does not cover `full`: `{steps}` the full steps it misses. */
export const RELEASE_NOT_COVERING_LINE =
	'release does not run: {steps}: its record answers no full gate'

/** `gate --hook` on a package whose `gate --full` holds no step counting tests. */
export const GATE_HOOK_NO_TEST_STEP_LINE = 'gate --hook: no test step in gate --full'

/** `gate --hook` answered by a green `gate --full` record of the committed tree: the line it prints. */
export const GATE_HOOK_REUSED_LINE =
	'gate --hook: tests reused from gate --full green on tree {tree} at {at} (HEAD {head})'

/** `gate --hook` answered by a green covering `gate --release` record of the committed tree: the line it prints. */
export const GATE_HOOK_RELEASE_REUSED_LINE =
	'gate --hook: tests reused from gate --release green on tree {tree} at {at} (HEAD {head})'

/**
 * `GATE_HOOK_REUSED_LINE` or `GATE_HOOK_RELEASE_REUSED_LINE` as a hook's output holds it: the tree, the time and the
 * HEAD it names (groups 1 to 3).
 */
export const GATE_HOOK_REUSED_PATTERN =
	/^gate --hook: tests reused from gate --(?:full|release) green on tree (\S+) at (\S+) \(HEAD ([0-9a-f]+)\)$/m

/**
 * `gate --hook` with no green `gate --full` or covering `gate --release` record of that key: the line before the
 * test steps it runs.
 */
export const GATE_HOOK_RUNNING_LINE =
	'gate --hook: no green gate --full or --release of tree {tree} with this install: running the tests'

/** Before a line `gate --hook` says about its base (a note, a hand-over base it ignored). */
export const GATE_HOOK_LINE_PREFIX = 'gate --hook: '

/**
 * `gate --hook` whose test steps hold a scoped step: the base it used (full sha) with its source, and what the
 * scoped steps selected (`GATE_HOOK_SELECTION_WORDS`); printed always, reused or run.
 */
export const GATE_HOOK_BASE_LINE = 'gate --hook: base {commit} ({source}), {selection}'

/** `GATE_HOOK_BASE_LINE` as a hook's output holds it, every one: the base (group 1) and its source (group 2). */
export const GATE_HOOK_BASE_PATTERN =
	/^gate --hook: base ([0-9a-f]{40}|[0-9a-f]{64}) \(([a-z-]+)\), .*$/gm

/** The selection part of `GATE_HOOK_BASE_LINE`: `{ids}` the selected ids joined by `GATE_HOOK_ID_SEPARATOR`. */
export const GATE_HOOK_SELECTION_WORDS = {
	selected: 'selected {ids}',
	nothing: 'nothing selected',
	reused: 'reused',
	invalid: 'no valid selection',
} as const

/** Between the selected ids of `GATE_HOOK_BASE_LINE`. */
export const GATE_HOOK_ID_SEPARATOR = ', '

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
