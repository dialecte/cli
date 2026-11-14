import { CLI_BIN } from '../skills/cli-invocations.constants.ts'

import type { GateListName, GateStep } from './gate-config.types.ts'

/**
 * The Definition of Done of a Dialecte package when its package.json declares no `dialecte.gate`.
 * `--fast` while iterating; `--full` once per lot. The docs build and the type bench are contributor checks:
 * `dialecte contrib` runs them (`DEFAULT_CONTRIB_STEPS`). The suite runs with the runner's defaults (every file in
 * parallel); a test step that fails is rerun once, serially, on its failing files to tell a flake from a real
 * failure. Both lists end with `dialecte rules`, scoped: it judges the changed files, and with the gate base an
 * error on a line the change did not add counts as a warning. The gate runs it as itself (`SELF_STEP_PATTERN`).
 */
export const DEFAULT_GATE_STEPS: Readonly<Record<'fast' | 'full', readonly GateStep[]>> = {
	fast: [
		{ name: 'check', run: 'npm run check' },
		{ name: 'skills', run: 'npm run skills:check' },
		{ name: 'tests', run: 'npx vitest run --changed', counts: 'tests', changedOnly: true },
		{ name: 'rules', run: 'dialecte rules', scoped: true },
	],
	full: [
		{ name: 'check', run: 'npm run check' },
		{ name: 'skills', run: 'npm run skills:check' },
		{ name: 'build', run: 'npm run build' },
		{ name: 'tests', run: 'npx vitest run', counts: 'tests' },
		{ name: 'rules', run: 'dialecte rules', scoped: true },
	],
}

/**
 * A step whose command starts with the word `dialecte`: the gate runs it as the cli that runs the gate (its own node
 * and entry file), never as the `dialecte` a package installed, or lacks.
 */
export const SELF_STEP_PATTERN = new RegExp(`^${CLI_BIN}(?=\\s|$)`)

/** The note on a self step's line and record: `{version}` the version of the cli that ran it. */
export const SELF_STEP_NOTE = `(${CLI_BIN} {version})`

/** A self step whose cli command could not be resolved: it fails with this reason, the resolver's message in its tail. */
export const SELF_COMMAND_UNRESOLVED_REASON = `no ${CLI_BIN} bin resolved for the cli running the gate`

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

/** Why a default step whose npm script the package lacks is not run (`{script}`): failed in a full run, skipped in a fast one. */
export const NOT_WIRED_REASON = 'not wired (no npm script "{script}")'

/**
 * The line under a failed unwired default step: how to fix it. `{label}` is the opt-out key of the run
 * (`dialecte.gate.skip`, `dialecte.contrib.skip`), `{optOut}` the package.json entry that opts the step out under
 * it (`UNWIRED_OPT_OUT_REASON` as its reason).
 */
export const UNWIRED_FIX_LINE = 'add the script, or opt out with {label}: {optOut}'

/** The reason the opt-out of `UNWIRED_FIX_LINE` shows: the package writes its own. */
export const UNWIRED_OPT_OUT_REASON = '<reason>'

/** Why a step the package declares, whose npm script it lacks, fails in every mode. */
export const DECLARED_NOT_WIRED_REASON = 'declared but not wired (no npm script "{script}")'

/** Why a default step the package opted out of is not run; `{reason}` is the package's own. */
export const OPTED_OUT_REASON = 'opted out: {reason}'

/** What the line of a step says when it was left unrun because a step of the list is unwired. */
export const UNWIRED_NOT_RUN_REASON = 'not run: a step of the list is not wired'

/** How the key of the opt-outs is named in a `GateConfigError`. */
export const GATE_SKIP_LABEL = 'dialecte.gate.skip'

/**
 * Why an opt-out naming a step the package can run (its `npm run` script there, or no `npm run` step, as the default
 * `tests`) is refused: an opt-out is only for a default step that is not wired.
 */
export const SKIP_FOR_UNRUNNABLE = 'skip is for a step the package cannot run; remove the skip'

/** The longest reason an opt-out may give. */
export const SKIP_REASON_MAX_LENGTH = 200

/** What is wrong with an opt-out, as `{problem}` of a `GateConfigError` says it; `{name}` the step it names. */
export const SKIP_PROBLEMS = {
	notAnObject: 'a map of default step names to reasons, such as { "skills": "no skills folder" }',
	notADefaultStep: '"{name}" is no default step of the lists it opts out of',
	runnable: `"{name}": ${SKIP_FOR_UNRUNNABLE}`,
	emptyReason: '"{name}": a reason is required (a non-empty string)',
	notAString: '"{name}": the reason is a string',
	tooLong: `"{name}": a reason of at most ${SKIP_REASON_MAX_LENGTH} characters`,
	multiLine: '"{name}": a reason of one line',
} as const

/** An invalid opt-out: `{key}` the key's label (`dialecte.gate.skip`, `dialecte.contrib.skip`), `{problem}` one of `SKIP_PROBLEMS`. */
export const INVALID_SKIP = '{key}: {problem}'

/** A line break in an opt-out's reason: a reason is one line. */
export const LINE_BREAK_PATTERN = /[\r\n]/

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
