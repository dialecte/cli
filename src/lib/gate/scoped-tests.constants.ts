/** The cli entry, as the package names it: every command loads from it, so a change of it reaches every test. */
export const CLI_ENTRY = 'src/cli.ts'

/** A changed path a test can import, so `vitest related` can relate it: a script or a JSON module. */
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
