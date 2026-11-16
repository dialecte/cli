import { fileURLToPath } from 'node:url'

/** The cli entry, as the package names it: every command loads from it, so a change of it reaches every test. */
export const CLI_ENTRY = 'src/cli.ts'

/** A changed path a test can import, so the import graph can reach it: a script or a JSON module. */
export const IMPORTABLE_FILE_PATTERN = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs|json)$/

/** The id the scoped tests step selects for related tests: its reasons are the test files vitest ran. */
export const SCOPED_TESTS_SELECTION_ID = 'related-tests'

/** The id it skips for what it leaves to the full suite on CI: its reason names those changed paths. */
export const LEFT_TO_CI_SELECTION_ID = 'left-to-ci'

/** The changed paths, from the package root, no test imports and every test depends on: left to CI's full suite. */
export const LEFT_TO_CI_FILES: readonly string[] = [
	'package.json',
	CLI_ENTRY,
	'package-lock.json',
	'npm-shrinkwrap.json',
	'pnpm-lock.yaml',
	'yarn.lock',
	'bun.lock',
	'bun.lockb',
]

/** The vite and vitest configs of the package root, and a setup file wherever it is (`*.setup.ts`). */
export const LEFT_TO_CI_FILE_PATTERN =
	/^vite(st)?\.(config|workspace)\.[cm]?[jt]s$|(^|\/)[^/]+\.setup\.[cm]?[jt]s$/

/** Where a file a test may read at run time sits: the package root itself, `src/` or `test/`. */
export const TEST_READ_FOLDER_PATTERN = /^(src\/|test\/|[^/]+$)/

/** What the left-to-CI line starts with; then the changed paths no test can import, which the full suite on CI checks. */
export const LEFT_TO_CI_LINE_START = 'scoped tests: left to the full suite on CI: '

/** A path that is no test passing with no test, both reporters. */
export const VITEST_REPORT_ARGUMENTS = [
	'--passWithNoTests',
	'--reporter=default',
	'--reporter=json',
] as const

/** A shared path as the left-to-CI line names it: how many of the package's test files reach it. */
export const SHARED_PATH_TEXT = '{path} ({related} of {total} test files)'

/** A shared path whose own tests (the test files importing it themselves) ran here: `{direct}` how many. */
export const SHARED_PATH_DIRECT_RAN_TEXT =
	'{path} ({related} of {total} test files; the {direct} importing it directly ran here)'

/** The script that reads the package's test import graph with its own vitest, run with node in the package root. */
export const TEST_GRAPH_SCRIPT = fileURLToPath(new URL('./test-graph.ts', import.meta.url))

/** How vite names a file outside its root in a module's imports: `/@fs/<absolute path>`. */
export const FS_PREFIX = '/@fs/'

/** A query or fragment after a module's path in vite's imports (`?raw`, `?url`, `#part`). */
export const IMPORT_QUERY_PATTERN = /[?#].*$/

/** The file it writes, in the run's temporary folder. */
export const GRAPH_FILE_NAME = 'graph.json'

/** The output of a run whose graph could not be read; the child's output follows. */
export const GRAPH_FAILED_LINE =
	"scoped tests: the package's vitest could not read its test import graph"

/** The output of a run whose importable changed paths no test file reaches: `{paths}` those paths, counted. */
export const NO_TEST_REACHED_LINE =
	'scoped tests: no test file reaches the {paths} changed: vitest not started'

/** The option naming the JSON reporter's file: `{file}`. */
export const VITEST_JSON_OUTPUT_OPTION = '--outputFile.json={file}'

/** The temporary folder of one run's JSON report. */
export const REPORT_FOLDER_PREFIX = 'dialecte-scoped-tests-'
export const REPORT_FILE_NAME = 'report.json'

/** The output of a run that started no vitest: `{paths}` the changed paths, counted. */
export const NOTHING_TO_RELATE_LINE =
	'scoped tests: no changed path a test can import ({paths} changed): vitest not started'

/** The entry run without a gate: it never starts the whole suite on its own. */
export const NO_GATE_SCOPE_LINE =
	'scoped tests: run by the gate only (DIALECTE_GATE_BASE, _TREE, _CHANGED and _SELECTION unset): nothing run'

/** The largest output kept from vitest, in bytes. */
export const OUTPUT_MAX_BYTES = 1e8

/**
 * The variable counting how deep scoped runs nest: the step hands its vitest its own depth plus one (unset: 0), and
 * refuses to start at `SCOPED_TESTS_MAXIMUM_DEPTH` or deeper.
 */
export const SCOPED_TESTS_DEPTH_VARIABLE = 'DIALECTE_SCOPED_TESTS_DEPTH'
export const SCOPED_TESTS_MAXIMUM_DEPTH = 2

/** The entry started that deep: it starts nothing. `{depth}` the depth it read. */
export const NESTED_TWICE_LINE =
	'scoped tests: cannot start inside a scoped run nested twice (DIALECTE_SCOPED_TESTS_DEPTH {depth}): nothing run'

/**
 * A changed file is shared, its far reach left to the full suite on CI (its own direct tests still run), when vitest's
 * import graph has more than this share of the package's test files reach it: running a quarter of the suite or more
 * costs the machine what a CI shard costs. The same share of direct importers sends a hub helper to CI whole.
 */
export const SHARED_FILE_SHARE = 0.25

/** ... and more than this many test files: a small package's tests always run on the machine. */
export const SHARED_FILE_FLOOR = 50
