/** How a hook's output is read: npm's script headers, the scripts a command runs, the lines worth showing. */
import type { HookLineKind, HookLinePattern } from './hook-output.types.ts'

/** npm's header of a script it runs: `> <package>@<version> <script>` (an older npm adds the folder). */
export const NPM_SCRIPT_HEADER = /^> (?:@[^@\s/]+\/)?[^@\s]+@\S+ (\S+)(?: .*)?$/

/** The line npm prints under a script's header: `> <command>`. */
export const NPM_COMMAND_LINE = /^> \S/

/** A command running an npm script after another: `npm run <script>`. */
export const NPM_RUN_SCRIPT = /\bnpm run(?:-script)? ([^\s&|;]+)/g

/** A command running npm scripts through npm-run-all: `run-p a b`, `run-s a b`, `npm-run-all -p a b`. */
export const SCRIPT_RUNNER = /\b(run-p|run-s|npm-run-all2?)\b(.*)$/

/** One argument of a script runner: quoted, or a word. */
export const RUNNER_ARGUMENT = /"([^"]*)"|'([^']*)'|(\S+)/g

/** A script runner's flags that make it run its scripts in parallel. */
export const PARALLEL_FLAGS = ['-p', '--parallel']

/** What ends a script runner's arguments in a shell command line. */
export const COMMAND_SEPARATORS = ['&&', '||', '|', ';', '--']

/** The script runners running their scripts in parallel. */
export const PARALLEL_RUNNER = 'run-p'

/** The script runners whose scripts run in parallel when given a parallel flag. */
export const RUN_ALL_RUNNERS = ['npm-run-all', 'npm-run-all2']

/** run-p naming a task that failed: `ERROR: "type-check" exited with 2.` */
export const SCRIPT_FAILURE = /^ERROR: "(.+)" exited with \d+\.$/

/** The step of a hook printing no npm header. */
export const PLAIN_HOOK_STEP = 'hook'

/** The failing step's last lines printed once the hook failed. */
export const FAILING_TAIL_LINES = 30

/** The segment of a script name (split on `:`) that makes its step a test step: `test`, `test:run`, `unit:test`. */
export const TEST_STEP_SEGMENT = 'test'

/** The script name's segment separator. */
export const SCRIPT_NAME_SEPARATOR = ':'

/** A step's command line running a test runner: `> vitest run`, `> jest`, `> node --test src/`. */
export const TEST_RUNNER_COMMAND =
	/^> (?:\S+=\S*\s+)*(?:npx\s+)?(?:vitest|jest|mocha|node(?:\s+\S+)*\s+--test)(?:\s|$)/

/**
 * The kinds flagged in a test step: its failures. A test suite runs commands whose warnings are part of the
 * tests (a generator printing its formatter's warning in a scratch folder), not of the repository.
 */
export const TEST_STEP_KINDS: readonly HookLineKind[] = ['test failure', 'script failure']

/** Before a flagged line, naming the step that printed it: `[lint:check] <line>`. */
export const STEP_LABEL = '[{step}] '

/**
 * After a flagged line printed more than once by its step (the same text): how many times, `(×3)`. Shown
 * once the line was printed twice.
 */
export const REPEAT_COUNT_SUFFIX = ' (×{count})'

/** After a warning count in the summary, naming the step: `1 lint warning in lint:check`. */
export const STEP_COUNT_SUFFIX = ' in {step}'

/** The kinds counted after a passing hook; the others are errors. */
export const HOOK_WARNING_KINDS: readonly HookLineKind[] = ['lint warning', 'build warning']

/**
 * The warning and error lines of the tools a hook runs, the first pattern matching naming the kind: tsc
 * before the lint patterns, oxlint's own `×` before vitest's.
 */
export const HOOK_LINE_PATTERNS: readonly HookLinePattern[] = [
	{ kind: 'type error', pattern: /\berror TS\d+:/ },
	{ kind: 'script failure', pattern: SCRIPT_FAILURE },
	{ kind: 'lint warning', pattern: /^\S.*:\d+:\d+: warning / },
	{ kind: 'lint warning', pattern: /^\s*⚠ / },
	{ kind: 'lint error', pattern: /^\S.*:\d+:\d+: error / },
	{ kind: 'lint error', pattern: /^\s*× [\w@/-]+\([\w@/-]+\):/ },
	{ kind: 'format', pattern: /^[^\s()]+ \(\d+(?:\.\d+)?m?s\)$/ },
	{ kind: 'format', pattern: /^Format issues found\b/ },
	{ kind: 'format', pattern: /^\[warn\] / },
	{ kind: 'build warning', pattern: /^▲ \[WARNING\]/ },
	{ kind: 'build warning', pattern: /^\(!\) / },
	{ kind: 'build error', pattern: /^✘ \[ERROR\]/ },
	{ kind: 'build error', pattern: /^error during build:/ },
	{ kind: 'test failure', pattern: /^\s*× / },
	{ kind: 'test failure', pattern: /^\s*FAIL\s/ },
	{ kind: 'test failure', pattern: /^\s*✖ / },
]
