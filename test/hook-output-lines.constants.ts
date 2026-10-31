/**
 * What husky hooks print, as npm, run-p, tsc, oxlint, oxfmt, vitest, tsup and vite print it into a pipe
 * (the cli's hook: `npm run check` then `npm run build`; core's: run-p inside `check` and `build`): the
 * lines the hook output tests feed and expect.
 */

export const LINT_WARNING =
	"src/read.ts:1:7: warning eslint(no-unused-vars): Variable 'unused' is declared but never used. Unused variables should start with a '_'."

/** `check` (it runs four scripts of its own), its first three scripts passing, one lint warning. */
const CHECK_BEFORE_TESTS = [
	'',
	'> @dialecte/cli@0.1.0 check',
	'> npm run type-check && npm run lint:check && npm run format:check && npm run test:run',
	'',
	'',
	'> @dialecte/cli@0.1.0 type-check',
	'> tsc --noEmit',
	'',
	'',
	'> @dialecte/cli@0.1.0 lint:check',
	'> oxlint',
	'',
	LINT_WARNING,
	'Finished in 12ms on 140 files with 98 rules using 12 threads.',
	'',
	'> @dialecte/cli@0.1.0 format:check',
	'> oxfmt --check',
	'',
	'Checking formatting...',
	'',
	'All matched files use the correct format.',
	'Finished in 31ms on 214 files using 12 threads.',
	'',
	'> @dialecte/cli@0.1.0 test:run',
	'> vitest run',
	'',
	'',
	' RUN  v4.0.8 /Users/dev/cli',
	'',
]

/** Every script passing: 1214 tests, then the build. */
export const PASSING_HOOK_LINES = [
	...CHECK_BEFORE_TESTS,
	' ✓ src/lib/gate/step-counts.test.ts (12 tests) 4ms',
	' ✓ src/error.test.ts > reports an error when the file is missing 2ms',
	'',
	' Test Files  41 passed (41)',
	'      Tests  1214 passed (1214)',
	'   Start at  10:12:01',
	'   Duration  12.31s',
	'',
	'',
	'> @dialecte/cli@0.1.0 build',
	'> tsup',
	'',
	'CLI Building entry: src/cli.ts',
	'CLI Using tsconfig: tsconfig.json',
	'CLI tsup v8.5.0',
	'CLI Target: node22',
	'ESM Build start',
	'ESM dist/cli.js     412.30 KB',
	'ESM ⚡️ Build success in 120ms',
]

export const FAILED_TEST_LINE = '   × read > answers one 3ms'

export const FAIL_LINE = ' FAIL  src/read.test.ts > read > answers one'

/** The error block npm 10 prints when a script fails: the failing script's, then its parent's. */
export const NPM_ERROR_BLOCK = [
	'npm error Lifecycle script `test:run` failed with error:',
	'npm error code 1',
	'npm error path /Users/dev/cli',
	'npm error command failed',
	'npm error command sh -c vitest run',
	'npm error Lifecycle script `check` failed with error:',
	'npm error code 1',
	'npm error path /Users/dev/cli',
	'npm error command failed',
	'npm error command sh -c npm run type-check && npm run lint:check && npm run format:check && npm run test:run',
]

function passingFiles(params: { from: number; count: number }): string[] {
	return Array.from(
		{ length: params.count },
		(_unused, index) => ` ✓ src/t${params.from + index}.test.ts (30 tests) 2ms`,
	)
}

/**
 * The lines `test:run` prints when one of its tests fails: the failing test in the file list, early (more
 * than 30 lines before the end), its detail late, npm's error block last.
 */
export const FAILING_TEST_RUN_LINES = [
	...passingFiles({ from: 1, count: 5 }),
	' ❯ src/read.test.ts (3 tests | 1 failed) 5ms',
	FAILED_TEST_LINE,
	'     → expected 2 to be 1 // Object.is equality',
	...passingFiles({ from: 6, count: 35 }),
	'',
	'⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯',
	'',
	FAIL_LINE,
	'AssertionError: expected 2 to be 1 // Object.is equality',
	'',
	' Test Files  1 failed | 40 passed (41)',
	'      Tests  1 failed | 1213 passed (1214)',
	'   Start at  10:12:01',
	'   Duration  12.31s',
	'',
	...NPM_ERROR_BLOCK,
]

/** `test:run` failing: the hook stops there, the build never starts. */
export const FAILING_HOOK_LINES = [...CHECK_BEFORE_TESTS, ...FAILING_TEST_RUN_LINES]

/** The lines of `test:run` in the failing hook: its command line, then what it printed. */
export const FAILING_TEST_RUN_STEP_LINES = [
	'> vitest run',
	'',
	'',
	' RUN  v4.0.8 /Users/dev/cli',
	'',
	...FAILING_TEST_RUN_LINES,
]

export const TYPE_ERROR =
	"src/read.ts(3,14): error TS2322: Type 'string' is not assignable to type 'number'."

/** What npm-run-all2's run-p prints when a task fails (its only word about it). */
export const RUN_P_ERROR = 'ERROR: "type-check" exited with 2.'

/**
 * Core's hook (`npm run check`, `npm run test:node`, `npm run build`), its `check` and `build` running
 * their scripts with run-p: every header first in the order the tasks started, then their lines mixed.
 */
const CORE_CHECK_LINES = [
	'> run-p type-check type-check:test lint:check format:check',
	'',
	'',
	'> @dialecte/core@0.7.0 format:check',
	'> oxfmt --check',
	'',
	'',
	'> @dialecte/core@0.7.0 type-check',
	'> tsc --noEmit -p tsconfig.app.json',
	'',
	'',
	'> @dialecte/core@0.7.0 lint:check',
	'> oxlint',
	'',
	'',
	'> @dialecte/core@0.7.0 type-check:test',
	'> tsc --noEmit -p tsconfig.test.json',
	'',
	LINT_WARNING,
	'Finished in 12ms on 140 files with 98 rules using 12 threads.',
	'Checking formatting...',
	'',
	'All matched files use the correct format.',
	'Finished in 31ms on 214 files using 12 threads.',
]

/** The lines of core's `check` step when its type-check fails. */
export const CORE_FAILING_CHECK_STEP_LINES = [...CORE_CHECK_LINES, TYPE_ERROR, RUN_P_ERROR]

export const CORE_FAILING_HOOK_LINES = [
	'',
	'> @dialecte/core@0.7.0 check',
	...CORE_FAILING_CHECK_STEP_LINES,
]

export const CORE_PASSING_HOOK_LINES = [
	'',
	'> @dialecte/core@0.7.0 check',
	...CORE_CHECK_LINES,
	'',
	'> @dialecte/core@0.7.0 test:node',
	'> vitest run --project node --project node-indexeddb',
	'',
	'',
	' RUN  v4.0.8 /Users/dev/core',
	'',
	' ✓ |node| src/project.test.ts (120 tests) 40ms',
	'',
	' Test Files  210 passed (210)',
	'      Tests  3741 passed (3741)',
	'   Start at  10:12:01',
	'   Duration  42.10s',
	'',
	'',
	'> @dialecte/core@0.7.0 build',
	'> run-p type-check "build-only {@}" --',
	'',
	'',
	'> @dialecte/core@0.7.0 type-check',
	'> tsc --noEmit -p tsconfig.app.json',
	'',
	'',
	'> @dialecte/core@0.7.0 build-only',
	'> tsc -p tsconfig.json && vite build && vite build -c vite.engine.config.ts',
	'',
	'vite v7.1.5 building for production...',
	'transforming...',
	'✓ 123 modules transformed.',
	'rendering chunks...',
	'dist/index.js  412.30 kB │ gzip: 80.12 kB',
	'✓ built in 1.20s',
]
