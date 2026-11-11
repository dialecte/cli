/** The cli entry, as the package names it: a test that spawns it imports nothing of what it runs. */
export const CLI_ENTRY = 'src/cli.ts'

/** A changed path a test can import, so `vitest related` can relate it: a script or a JSON module. */
export const IMPORTABLE_FILE_PATTERN = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs|json)$/

/** The id the scoped tests step selects for related tests: its reasons are the test files vitest ran. */
export const SCOPED_TESTS_SELECTION_ID = 'related-tests'

/** The id it selects for the whole suite: its reasons are the changed paths that ask for it. */
export const WHOLE_SUITE_SELECTION_ID = 'whole-suite'

/** The changed paths, from the package root, no test imports and every test depends on. */
export const WHOLE_SUITE_FILES: readonly string[] = [
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
export const WHOLE_SUITE_FILE_PATTERN =
	/^vite(st)?\.(config|workspace)\.[cm]?[jt]s$|(^|\/)[^/]+\.setup\.[cm]?[jt]s$/

/** Where a file a test may read at run time sits: the package root itself, `src/` or `test/`. */
export const TEST_READ_FOLDER_PATTERN = /^(src\/|test\/|[^/]+$)/

/** The id it selects for the tests that spawn the cli entry: its reasons are those test files. */
export const SPAWNING_TESTS_SELECTION_ID = 'spawns-cli-entry'

/** A test or test helper text naming the cli entry: `src/cli.ts`, or `'src', 'cli.ts'` as path parts. */
export const CLI_ENTRY_REFERENCE_PATTERN = /src(\/|['"],\s*['"])cli\.ts/

/** A relative module a test file imports: its specifier. */
export const RELATIVE_IMPORT_PATTERN = /from\s+['"](\.{1,2}\/[^'"]+)['"]/g

/** The folders whose test files the scoped step reads. */
export const TEST_FOLDERS: readonly string[] = ['src', 'test']
/** The folder of installed packages, never read for tests. */
export const NODE_MODULES_FOLDER = 'node_modules'

/** A test file's name. */
export const TEST_FILE_PATTERN = /\.test\.[cm]?[jt]sx?$/

/** What the run prints first when the whole suite runs: `{paths}` the changed paths that ask for it. */
export const WHOLE_SUITE_LINE = 'scoped tests: the whole suite runs, no test can import: {paths}'

/** A path that is no test passing with no test, both reporters. */
export const VITEST_REPORT_ARGUMENTS = [
	'--passWithNoTests',
	'--reporter=default',
	'--reporter=json',
] as const

/** `vitest related`, run once, with the report arguments. */
export const VITEST_RELATED_ARGUMENTS = ['related', '--run', ...VITEST_REPORT_ARGUMENTS] as const

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
