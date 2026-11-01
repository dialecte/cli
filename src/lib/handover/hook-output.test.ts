import { runHookLiveView } from '../../../test/hook-live-view-run.ts'
import {
	CORE_FAILING_CHECK_STEP_LINES,
	CORE_FAILING_HOOK_LINES,
	CORE_PASSING_HOOK_LINES,
	CORE_PASSING_HOOK_LINES_WITH_REPEATED_BUILD_WARNING,
	FAIL_LINE,
	FAILED_TEST_LINE,
	FAILING_HOOK_LINES,
	FAILING_PARALLEL_TEST_HOOK_LINES,
	FAILING_PARALLEL_TEST_STEP_LINES,
	FAILING_TEST_RUN_LINES,
	FAILING_TEST_RUN_STEP_LINES,
	LINT_WARNING,
	OXFMT_WARNING,
	PASSING_HOOK_LINES,
	PASSING_HOOK_LINES_WITH_OXFMT_IN_TESTS,
	RUN_P_ERROR,
	TEST_BROWSER_FAILURE,
	TYPE_ERROR,
	VITE_CONFIG_LOADER_WARNING,
} from '../../../test/hook-output-lines.constants.ts'
import { HOOK_OUTPUT_PREFIX } from './handover.constants.ts'
import { classifyHookLine, hookOutcomeLines, readHookSteps } from './hook-output.ts'

import { describe, expect, it } from 'vitest'

import type { FlaggedLineRow } from '../../../test/hook-output-lines.types.ts'

const LOG = '/tmp/dialecte-hook-x/lot-1.log'

/** Lines as a hook prints them: each ended by a line feed. */
function outputOf(lines: readonly string[]): string {
	return `${lines.join('\n')}\n`
}

describe('classifyHookLine: the warning and error lines of the tools a hook runs', () => {
	const shown: FlaggedLineRow[] = [
		{ tool: 'oxlint piped', line: LINT_WARNING, kind: 'lint warning' },
		{
			tool: 'oxlint piped',
			line: 'src/a.ts:2:1: error eslint(no-debugger): `debugger` statement is not allowed help: Remove the debugger statement',
			kind: 'lint error',
		},
		{
			tool: 'oxlint on a terminal',
			line: "  ⚠ eslint(no-unused-vars): Variable 'unused' is declared but never used.",
			kind: 'lint warning',
		},
		{
			tool: 'oxlint on a terminal',
			line: '  × eslint(no-debugger): `debugger` statement is not allowed',
			kind: 'lint error',
		},
		{ tool: 'oxfmt --check', line: 'src/a.ts (0ms)', kind: 'format' },
		{
			tool: 'oxfmt --check',
			line: 'Format issues found in above 1 files. Run without `--check` to fix.',
			kind: 'format',
		},
		{ tool: 'prettier --check', line: '[warn] src/a.ts', kind: 'format' },
		{
			tool: 'prettier --check',
			line: '[warn] Code style issues found in the above file. Run Prettier with --write to fix.',
			kind: 'format',
		},
		{ tool: 'tsc piped', line: TYPE_ERROR, kind: 'type error' },
		{
			tool: 'tsc --pretty',
			line: "src/a.ts:3:14 - error TS2322: Type 'string' is not assignable to type 'number'.",
			kind: 'type error',
		},
		{
			tool: 'tsup (esbuild)',
			line: '▲ [WARNING] "import.meta" is not available in the configured target environment ("es2015") and will be empty [empty-import-meta]',
			kind: 'build warning',
		},
		{
			tool: 'tsup (esbuild)',
			line: '✘ [ERROR] Could not resolve "./missing.ts"',
			kind: 'build error',
		},
		{
			tool: 'vite (rollup)',
			line: '(!) Some chunks are larger than 500 kB after minification.',
			kind: 'build warning',
		},
		{ tool: 'vite', line: 'error during build:', kind: 'build error' },
		{ tool: 'vitest', line: FAILED_TEST_LINE, kind: 'test failure' },
		{ tool: 'vitest', line: ' × src/read.test.ts > read > answers one 3ms', kind: 'test failure' },
		{ tool: 'vitest', line: FAIL_LINE, kind: 'test failure' },
		{ tool: 'node --test', line: '✖ answers one (1.234ms)', kind: 'test failure' },
		{ tool: 'run-p', line: RUN_P_ERROR, kind: 'script failure' },
	]
	for (const row of shown)
		it(`${row.tool}: ${row.line} → ${row.kind}`, () => {
			expect(classifyHookLine(row.line)).toBe(row.kind)
		})

	const ordinary = [
		' ✓ src/error.test.ts > reports an error when the file is missing 2ms',
		' ✓ handover run > a hook warning stays visible 12ms',
		' ❯ src/read.test.ts (3 tests | 1 failed) 5ms',
		' ✓ src/lib/gate/step-counts.test.ts (12 tests) 4ms',
		'✔ answers one (1.234ms)',
		'  ✔ reports an error on a bad file (0.512ms)',
		'Found 0 warnings and 0 errors.',
		'Found 1 warning and 0 errors.',
		'Found 2 errors in the same file, starting at: src/a.ts:3',
		'0 errors',
		' Test Files  1 failed | 40 passed (41)',
		'      Tests  1214 passed (1214)',
		'Checking formatting...',
		'All matched files use the correct format.',
		'Finished in 31ms on 214 files using 12 threads.',
		'> @dialecte/cli@0.1.0 lint:check',
		'> oxlint',
		'CLI Building entry: src/cli.ts',
		'ESM dist/cli.js     412.30 KB',
		'ESM ⚡️ Build success in 120ms',
		'vite v7.1.5 building for production...',
		'✓ 123 modules transformed.',
		'dist/index.js  412.30 kB │ gzip: 80.12 kB',
		'✓ built in 1.20s',
		'npm warn config production Use `--omit=dev` instead.',
		'npm error Lifecycle script `test:run` failed with error:',
		'npm error code 1',
		'npm error command sh -c vitest run',
		'AssertionError: expected 2 to be 1 // Object.is equality',
		'',
	]
	for (const line of ordinary)
		it(`an ordinary line: ${JSON.stringify(line)} → none`, () => {
			expect(classifyHookLine(line)).toBeUndefined()
		})
})

describe('readHookSteps: the steps a hook ran, read from its npm headers', () => {
	it('npm run check then build → a step per header in order, check running scripts one after the other, its scripts naming it as parent, each step holding its lines from its command line on', () => {
		expect(
			readHookSteps(outputOf(PASSING_HOOK_LINES)).map((step) => [
				step.name,
				step.runsScripts,
				step.parent ?? null,
			]),
		).toEqual([
			['check', true, null],
			['type-check', false, 'check'],
			['lint:check', false, 'check'],
			['format:check', false, 'check'],
			['test:run', false, 'check'],
			['build', false, null],
		])
		expect(readHookSteps(outputOf(PASSING_HOOK_LINES))[2].lines).toEqual([
			'> oxlint',
			'',
			LINT_WARNING,
			'Finished in 12ms on 140 files with 98 rules using 12 threads.',
			'',
		])
	})

	it('run-p in check and build → one step each, holding the headers and the mixed lines of the scripts it runs; a header after them that it does not run starts a step of the hook', () => {
		const output = outputOf(CORE_PASSING_HOOK_LINES)

		expect(
			readHookSteps(output).map((step) => [step.name, step.runsScripts, step.parent ?? null]),
		).toEqual([
			['check', true, null],
			['test:node', false, null],
			['build', true, null],
		])
		expect(readHookSteps(output)[0].lines).toEqual(
			CORE_PASSING_HOOK_LINES.slice(
				2,
				CORE_PASSING_HOOK_LINES.indexOf('> @dialecte/core@0.7.0 test:node'),
			),
		)
	})

	it('a scoped package with a prerelease version, and an older npm naming the folder after the script → the step is the script alone', () => {
		const output = outputOf([
			'> @scope/pkg@1.2.3-beta.1 test:node',
			'> node --test',
			'',
			'> demo@1.0.0 build /Users/dev/demo',
			'> tsup',
		])

		expect(readHookSteps(output).map((step) => step.name)).toEqual(['test:node', 'build'])
	})

	it('a header-like line with no blank line before it, or no > command line after it → a line of the step it is printed in', () => {
		const output = outputOf([
			'',
			'> demo@1.0.0 test:run',
			'> vitest run',
			' ✓ src/a.test.ts (1 test) 2ms',
			'> demo@1.0.0 build',
			'> tsup',
			'',
			'> demo@1.0.0 lint:check',
			'not a command line',
		])

		expect(readHookSteps(output)).toEqual([
			{
				name: 'test:run',
				lines: [
					'> vitest run',
					' ✓ src/a.test.ts (1 test) 2ms',
					'> demo@1.0.0 build',
					'> tsup',
					'',
					'> demo@1.0.0 lint:check',
					'not a command line',
				],
				runsScripts: false,
			},
		])
	})

	it('a hook printing no npm header → one step hook holding every line, the last line feed adding none', () => {
		expect(readHookSteps('checking the staged files\nall good\n')).toEqual([
			{ name: 'hook', lines: ['checking the staged files', 'all good'], runsScripts: false },
		])
	})

	it('a last line without a line feed → kept as a line', () => {
		expect(readHookSteps('checking the staged files\nall good')).toEqual([
			{ name: 'hook', lines: ['checking the staged files', 'all good'], runsScripts: false },
		])
	})

	it('CRLF line ends → the same steps and lines as with line feeds, no carriage return kept', () => {
		expect(readHookSteps('\r\n> demo@1.0.0 build\r\n> tsup\r\nok\r\n')).toEqual([
			{ name: 'build', lines: ['> tsup', 'ok'], runsScripts: false },
		])
	})

	it('a lone carriage return (a progress line redrawn) → the line keeps the text after the last one, as a terminal shows it', () => {
		expect(readHookSteps('> demo@1.0.0 build\n> tsup\nbuilding 10%\rbuilding 100%\n')).toEqual([
			{ name: 'build', lines: ['> tsup', 'building 100%'], runsScripts: false },
		])
	})

	it('lines before the first header → a step hook first; blank lines alone before it → none', () => {
		const leading = outputOf(['lint-staged: 2 files checked', '', '> demo@1.0.0 build', '> tsup'])
		const blank = outputOf(['', '', '> demo@1.0.0 build', '> tsup'])

		expect(readHookSteps(leading).map((step) => step.name)).toEqual(['hook', 'build'])
		expect(readHookSteps(blank).map((step) => step.name)).toEqual(['build'])
	})
})

describe('hookOutcomeLines: what stays once the hook ended', () => {
	it('the cli hook passing → the scripts the hook runs and test:run (it has counts), the warnings counted at the end; the warning line; the log path', () => {
		expect(
			hookOutcomeLines({ output: outputOf(PASSING_HOOK_LINES), passed: true, logPath: LOG }),
		).toEqual([
			'check ✓ · test:run ✓ 1214 · build ✓ · 1 lint warning in lint:check',
			`[lint:check] ${LINT_WARNING}`,
			`full log: ${LOG}`,
		])
	})

	it('core hook passing (run-p in check and build) → check ✓ · test:node ✓ 3741 · build ✓, the warning counted and listed, the log path', () => {
		expect(
			hookOutcomeLines({ output: outputOf(CORE_PASSING_HOOK_LINES), passed: true, logPath: LOG }),
		).toEqual([
			'check ✓ · test:node ✓ 3741 · build ✓ · 1 lint warning in check',
			`[check] ${LINT_WARNING}`,
			`full log: ${LOG}`,
		])
	})

	it('skipped tests → the passed count, then the skipped count in brackets', () => {
		const output = outputOf([
			'> demo@1.0.0 test:run',
			'> vitest run',
			' Test Files  41 passed (41)',
			'      Tests  1210 passed | 4 skipped (1214)',
		])

		expect(hookOutcomeLines({ output, passed: true, logPath: LOG })).toEqual([
			'test:run ✓ 1210 (4 skipped)',
			`full log: ${LOG}`,
		])
	})

	it('the node test runner → its pass count', () => {
		const output = outputOf([
			'> demo@1.0.0 test:node',
			'> node --test',
			'✔ answers one (1.234ms)',
			'ℹ tests 3741',
			'ℹ pass 3741',
			'ℹ fail 0',
		])

		expect(hookOutcomeLines({ output, passed: true, logPath: LOG })).toEqual([
			'test:node ✓ 3741',
			`full log: ${LOG}`,
		])
	})

	it('warnings of two kinds → counted per kind (plural past one), every warning line listed in the order printed', () => {
		const second = 'src/write.ts:4:1: warning eslint(no-console): Unexpected console statement.'
		const build =
			'▲ [WARNING] "import.meta" is not available in the configured target environment ("es2015") and will be empty [empty-import-meta]'
		const output = outputOf([
			'> demo@1.0.0 lint:check',
			'> oxlint',
			LINT_WARNING,
			second,
			'',
			'> demo@1.0.0 build',
			'> tsup',
			build,
		])

		expect(hookOutcomeLines({ output, passed: true, logPath: LOG })).toEqual([
			'lint:check ✓ · build ✓ · 2 lint warnings in lint:check · 1 build warning in build',
			`[lint:check] ${LINT_WARNING}`,
			`[lint:check] ${second}`,
			`[build] ${build}`,
			`full log: ${LOG}`,
		])
	})

	it('one kind of warning printed by two steps, then another kind by the first again → a count per step and kind, in the order first printed', () => {
		const lintInBuild = "  ⚠ eslint(no-unused-vars): Variable 'unused' is declared but never used."
		const build = '(!) Some chunks are larger than 500 kB after minification.'
		const output = outputOf([
			'> demo@1.0.0 lint:check',
			'> oxlint',
			LINT_WARNING,
			'',
			'> demo@1.0.0 build',
			'> vite build',
			build,
			lintInBuild,
			build,
		])

		expect(hookOutcomeLines({ output, passed: true, logPath: LOG })).toEqual([
			'lint:check ✓ · build ✓ · 1 lint warning in lint:check · 1 build warning in build · 1 lint warning in build',
			`[lint:check] ${LINT_WARNING}`,
			`[build] ${build} (×2)`,
			`[build] ${lintInBuild}`,
			`full log: ${LOG}`,
		])
	})

	it('the cli hook failing in test:run → check ✗ · test:run ✗ with its failed count of the total; the failing test line printed before its last 30 lines; those lines (npm error block included); the log path; no warning', () => {
		expect(
			hookOutcomeLines({ output: outputOf(FAILING_HOOK_LINES), passed: false, logPath: LOG }),
		).toEqual([
			'check ✗ · test:run ✗ 1 failed of 1214',
			`[test:run] ${FAILED_TEST_LINE}`,
			...FAILING_TEST_RUN_STEP_LINES.slice(-30),
			`full log: ${LOG}`,
		])
	})

	it('the cli hook failing in test:run, a type error printed early in test:run → only the failing test line listed before the tail: a test step shows its test failures only', () => {
		const testRunStart = FAILING_HOOK_LINES.length - FAILING_TEST_RUN_LINES.length
		const output = outputOf([
			...FAILING_HOOK_LINES.slice(0, testRunStart),
			TYPE_ERROR,
			...FAILING_HOOK_LINES.slice(testRunStart),
		])

		expect(hookOutcomeLines({ output, passed: false, logPath: LOG })).toEqual([
			'check ✗ · test:run ✗ 1 failed of 1214',
			`[test:run] ${FAILED_TEST_LINE}`,
			...FAILING_TEST_RUN_STEP_LINES.slice(-30),
			`full log: ${LOG}`,
		])
	})

	it('a hook failing in type-check run by check → check ✗ · type-check ✗ 1 error (npm error lines not counted); its error line only in its lines (fewer than 30), npm error blocks kept there; the log path', () => {
		const stepLines = [
			'> tsc --noEmit',
			'',
			TYPE_ERROR,
			'npm error Lifecycle script `type-check` failed with error:',
			'npm error code 2',
			'npm error path /Users/dev/cli',
			'npm error command failed',
			'npm error command sh -c tsc --noEmit',
			'npm error Lifecycle script `check` failed with error:',
			'npm error code 2',
			'npm error path /Users/dev/cli',
			'npm error command failed',
			'npm error command sh -c npm run type-check && npm run test:run',
		]
		const output = outputOf([
			'',
			'> demo@1.0.0 check',
			'> npm run type-check && npm run test:run',
			'',
			'',
			'> demo@1.0.0 type-check',
			...stepLines,
		])

		expect(hookOutcomeLines({ output, passed: false, logPath: LOG })).toEqual([
			'check ✗ · type-check ✗ 1 error',
			...stepLines,
			`full log: ${LOG}`,
		])
	})

	it('core hook failing in a run-p check → check ✗ · type-check ✗ (the task run-p names); the last 30 lines of check; the log path', () => {
		expect(
			hookOutcomeLines({ output: outputOf(CORE_FAILING_HOOK_LINES), passed: false, logPath: LOG }),
		).toEqual([
			'check ✗ · type-check ✗',
			...CORE_FAILING_CHECK_STEP_LINES.slice(-30),
			`full log: ${LOG}`,
		])
	})

	it('a hook printing no npm header → hook ✓ and the log path when it passes; hook ✗, its lines and the log path when it fails', () => {
		expect(
			hookOutcomeLines({
				output: 'checking the staged files\nall good\n',
				passed: true,
				logPath: LOG,
			}),
		).toEqual(['hook ✓', `full log: ${LOG}`])
		expect(
			hookOutcomeLines({ output: 'changelog refused\n', passed: false, logPath: LOG }),
		).toEqual(['hook ✗', 'changelog refused', `full log: ${LOG}`])
	})

	it("the cli hook passing, a generator's oxfmt warning printed inside test:run → neither counted nor listed: only the lint warning of lint:check", () => {
		expect(
			hookOutcomeLines({
				output: outputOf(PASSING_HOOK_LINES_WITH_OXFMT_IN_TESTS),
				passed: true,
				logPath: LOG,
			}),
		).toEqual([
			'check ✓ · test:run ✓ 1214 · build ✓ · 1 lint warning in lint:check',
			`[lint:check] ${LINT_WARNING}`,
			`full log: ${LOG}`,
		])
	})

	it("core hook passing, its build printing Vite's configLoader warning three times → the line listed once with (×3) where it was first printed; the summary counts it once: 1 build warning in build", () => {
		expect(
			hookOutcomeLines({
				output: outputOf(CORE_PASSING_HOOK_LINES_WITH_REPEATED_BUILD_WARNING),
				passed: true,
				logPath: LOG,
			}),
		).toEqual([
			'check ✓ · test:node ✓ 3741 · build ✓ · 1 lint warning in check · 1 build warning in build',
			`[check] ${LINT_WARNING}`,
			`[build] ${VITE_CONFIG_LOADER_WARNING} (×3)`,
			`full log: ${LOG}`,
		])
	})

	it('the same warning printed by two steps, twice by the second → never merged across steps: one line per step, the count on the second only', () => {
		const output = outputOf([
			'> demo@1.0.0 build:lib',
			'> vite build',
			VITE_CONFIG_LOADER_WARNING,
			'',
			'> demo@1.0.0 build:engine',
			'> vite build -c vite.engine.config.ts',
			VITE_CONFIG_LOADER_WARNING,
			'✓ built in 0.40s',
			VITE_CONFIG_LOADER_WARNING,
		])

		expect(hookOutcomeLines({ output, passed: true, logPath: LOG })).toEqual([
			'build:lib ✓ · build:engine ✓ · 1 build warning in build:lib · 1 build warning in build:engine',
			`[build:lib] ${VITE_CONFIG_LOADER_WARNING}`,
			`[build:engine] ${VITE_CONFIG_LOADER_WARNING} (×2)`,
			`full log: ${LOG}`,
		])
	})

	it('a hook failing in test:run after type-check printed the same type error twice → the error listed once with (×2) before the failing test line and the tail', () => {
		const output = outputOf([
			'> demo@1.0.0 type-check',
			'> tsc --noEmit',
			TYPE_ERROR,
			TYPE_ERROR,
			'',
			'> demo@1.0.0 test:run',
			'> vitest run',
			'',
			...FAILING_TEST_RUN_LINES,
		])

		expect(hookOutcomeLines({ output, passed: false, logPath: LOG })).toEqual([
			'type-check ✓ 1 error · test:run ✗ 1 failed of 1214',
			`[type-check] ${TYPE_ERROR} (×2)`,
			`[test:run] ${FAILED_TEST_LINE}`,
			...['> vitest run', '', ...FAILING_TEST_RUN_LINES].slice(-30),
			`full log: ${LOG}`,
		])
	})

	const testSteps: { name: string; command: string; testStep: boolean }[] = [
		{ name: 'test', command: '> sh scripts/check.sh', testStep: true },
		{ name: 'test:run', command: '> sh scripts/check.sh', testStep: true },
		{ name: 'test:node', command: '> sh scripts/check.sh', testStep: true },
		{ name: 'unit:test', command: '> sh scripts/check.sh', testStep: true },
		{ name: 'verify', command: '> vitest run', testStep: true },
		{ name: 'verify', command: '> jest', testStep: true },
		{ name: 'verify', command: '> node --test src/', testStep: true },
		{ name: 'contest', command: '> sh scripts/check.sh', testStep: false },
		{ name: 'testing:build', command: '> sh scripts/check.sh', testStep: false },
		{ name: 'build', command: '> tsup', testStep: false },
	]
	for (const row of testSteps)
		it(`a step ${row.name} running ${row.command.slice(2)} printing a warning ⚠ line → ${row.testStep ? 'a test step: not counted, not listed' : 'counted in it and listed labelled'}`, () => {
			const output = outputOf([`> demo@1.0.0 ${row.name}`, row.command, OXFMT_WARNING])

			expect(hookOutcomeLines({ output, passed: true, logPath: LOG })).toEqual(
				row.testStep
					? [`${row.name} ✓`, `full log: ${LOG}`]
					: [
							`${row.name} ✓ · 1 lint warning in ${row.name}`,
							`[${row.name}] ${OXFMT_WARNING}`,
							`full log: ${LOG}`,
						],
			)
		})

	it('a test step running run-p failing: its script failure line printed before the last 30 lines → still listed, labelled [test]; the oxfmt warning beside it not listed', () => {
		expect(
			hookOutcomeLines({
				output: outputOf(FAILING_PARALLEL_TEST_HOOK_LINES),
				passed: false,
				logPath: LOG,
			}),
		).toEqual([
			'test ✗ · test:browser ✗',
			`[test] ${TEST_BROWSER_FAILURE}`,
			...FAILING_PARALLEL_TEST_STEP_LINES.slice(-30),
			`full log: ${LOG}`,
		])
	})

	it('a hook printing nothing → hook ✓ and the log path when it passes; hook ✗ and the log path when it fails', () => {
		expect(hookOutcomeLines({ output: '', passed: true, logPath: LOG })).toEqual([
			'hook ✓',
			`full log: ${LOG}`,
		])
		expect(hookOutcomeLines({ output: '', passed: false, logPath: LOG })).toEqual([
			'hook ✗',
			`full log: ${LOG}`,
		])
	})
})

describe('createHookLiveView: a warning repeated in its step', () => {
	/** A line as the live view shows it, behind the hook prefix. */
	function shown(line: string): string {
		return `${HOOK_OUTPUT_PREFIX}${line}`
	}
	const repeated = `[build] ${VITE_CONFIG_LOADER_WARNING}`

	it("off a terminal, core hook whose build prints Vite's configLoader warning three times → the warning written as it is printed, its repeats counted, then once more with (×3) as the run of repeats ends at the hook's end; the order kept", () => {
		expect(
			runHookLiveView({ lines: CORE_PASSING_HOOK_LINES_WITH_REPEATED_BUILD_WARNING, tty: false })
				.written,
		).toEqual(
			[
				'▶ check',
				`[check] ${LINT_WARNING}`,
				'▶ test:node',
				'▶ build',
				repeated,
				`${repeated} (×3)`,
			].map(shown),
		)
	})

	it('off a terminal, a warning twice then another in the same step → the warning written at its own read, its repeat counted, then with (×2) as soon as the other is read; the other written at its read', () => {
		const second = 'src/write.ts:4:1: warning eslint(no-console): Unexpected console statement.'
		const lines = ['> demo@1.0.0 lint:check', '> oxlint', LINT_WARNING, LINT_WARNING, second]

		expect(runHookLiveView({ lines, tty: false }).writtenAfterEachRead.slice(2)).toEqual([
			['▶ lint:check', `[lint:check] ${LINT_WARNING}`].map(shown),
			['▶ lint:check', `[lint:check] ${LINT_WARNING}`].map(shown),
			[
				'▶ lint:check',
				`[lint:check] ${LINT_WARNING}`,
				`[lint:check] ${LINT_WARNING} (×2)`,
				`[lint:check] ${second}`,
			].map(shown),
		])
		expect(runHookLiveView({ lines, tty: false }).written).toEqual(
			[
				'▶ lint:check',
				`[lint:check] ${LINT_WARNING}`,
				`[lint:check] ${LINT_WARNING} (×2)`,
				`[lint:check] ${second}`,
			].map(shown),
		)
	})

	it('off a terminal, a warning twice, another, then the first again in the same step → the first, its run of two as (×2), the other, then the first again as a new run of one: nothing more at the end', () => {
		const second = 'src/write.ts:4:1: warning eslint(no-console): Unexpected console statement.'

		expect(
			runHookLiveView({
				lines: [
					'> demo@1.0.0 lint:check',
					'> oxlint',
					LINT_WARNING,
					LINT_WARNING,
					second,
					LINT_WARNING,
				],
				tty: false,
			}).written,
		).toEqual(
			[
				'▶ lint:check',
				`[lint:check] ${LINT_WARNING}`,
				`[lint:check] ${LINT_WARNING} (×2)`,
				`[lint:check] ${second}`,
				`[lint:check] ${LINT_WARNING}`,
			].map(shown),
		)
	})

	it('after the hook, a warning twice, another, then the first again in one step → one line with the step total (×3) where it was first printed, the other after it; counted as two distinct lines', () => {
		const second = 'src/write.ts:4:1: warning eslint(no-console): Unexpected console statement.'
		const output = outputOf([
			'> demo@1.0.0 lint:check',
			'> oxlint',
			LINT_WARNING,
			LINT_WARNING,
			second,
			LINT_WARNING,
		])

		expect(hookOutcomeLines({ output, passed: true, logPath: LOG })).toEqual([
			'lint:check ✓ · 2 lint warnings in lint:check',
			`[lint:check] ${LINT_WARNING} (×3)`,
			`[lint:check] ${second}`,
			`full log: ${LOG}`,
		])
	})

	it("on a terminal, core hook whose build prints Vite's configLoader warning three times → the live region holds that line once, its count updated in place to (×3); never two copies of it", () => {
		const lines = CORE_PASSING_HOOK_LINES_WITH_REPEATED_BUILD_WARNING

		expect(runHookLiveView({ lines, tty: true }).regions.at(-1)).toEqual(
			['▶ build 0.0 s', `[check] ${LINT_WARNING}`, `${repeated} (×3)`].map(shown),
		)
		expect(
			runHookLiveView({ lines, tty: true }).regions.filter(
				(region) => region.filter((line) => line.startsWith(shown(repeated))).length > 1,
			),
		).toEqual([])
		expect(
			runHookLiveView({ lines, tty: true }).regions.some((region) =>
				region.includes(shown(`${repeated} (×2)`)),
			),
		).toBe(true)
	})

	it('on a terminal, a warning, another, then the first again in the same step → the first line carries (×2) in its place, the other stays after it', () => {
		const second = 'src/write.ts:4:1: warning eslint(no-console): Unexpected console statement.'

		expect(
			runHookLiveView({
				lines: ['> demo@1.0.0 lint:check', '> oxlint', LINT_WARNING, second, LINT_WARNING],
				tty: true,
			}).regions.at(-1),
		).toEqual(
			['▶ lint:check 0.0 s', `[lint:check] ${LINT_WARNING} (×2)`, `[lint:check] ${second}`].map(
				shown,
			),
		)
	})
})
