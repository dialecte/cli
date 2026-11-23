/**
 * `tdd red`, `tdd green`, `tdd status` and the hook's tdd step run each vitest file in the projects the package's CI
 * runs it in (read from its own test workflow and scripts), a file no CI project holds where its config holds it, every
 * project when CI cannot be read; a module mock in a project sharing modules between files is refused.
 * Every project here is a node one: the cli's CI starts no browser.
 */
import { existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { runHookIn } from '../../test/gate-hook.ts'
import {
	CHECK_HELPER_FILE,
	CHECK_HELPER_TEXT,
	LEG_HELPER_FILE,
	LEG_HELPER_TEXT,
	ROWS_FILE,
	ROWS_TEXT,
	TABLE_BASE_FILE,
	TABLE_BASE_TEXT,
} from '../../test/moved-cases-fixture.constants.ts'
import { legText, splitPackage } from '../../test/moved-cases-fixture.ts'
import {
	ORPHAN_DEPENDENT_TEST,
	ORPHAN_DEPENDENT_TEST_TEXT,
	ORPHAN_EDITED_HELPER_TEXT,
	ORPHAN_HELPER,
	ORPHAN_HELPER_TEXT,
	ORPHAN_PRODUCTION,
} from '../../test/rule-gaps-orphan-helper.constants.ts'
import { countingStep, createCounter } from '../../test/scratch-checks.ts'
import { git, temporaryFolder, writeFiles } from '../../test/scratch-repository.ts'
import { createVitestPackage } from '../../test/scratch-vitest-package.ts'
import {
	BASE_RED_SCENARIO_TIMEOUT,
	VITEST_REVISED_TEST_TEXT,
} from '../../test/tdd-runners-base-red-workspace.constants.ts'
import { createBaseRedPackage } from '../../test/tdd-runners-base-red-workspace.ts'
import { readLedger } from '../lib/tdd/tdd-files.ts'
import { RED_ON_BASE_FLAG } from '../lib/tdd/tdd.constants.ts'
import { runTdd } from './tdd.ts'

import { describe, expect, it } from 'vitest'

import type { GateStep } from '../lib/gate/gate-config.types.ts'
import type { TddReceipt } from '../lib/tdd/tdd.types.ts'

const NOW = new Date('2026-11-23T12:00:00.000Z')

const SCENARIO_TIMEOUT = 240_000

const WORKFLOW_PATH = '.github/workflows/_test.yml'

/** A test workflow whose one step runs `run`. */
function workflowRunning(run: string): string {
	return [
		'name: _test',
		'',
		'on:',
		'  workflow_call:',
		'',
		'jobs:',
		'  test:',
		'    runs-on: ubuntu-24.04',
		'    steps:',
		'      - uses: actions/checkout@v6',
		'      - name: Install dependencies',
		'        run: npm ci',
		'      - name: Run Tests',
		`        run: ${run}`,
		'',
	].join('\n')
}

/** CI runs the node project through the package's script. */
const NODE_WORKFLOW = workflowRunning('npm run test:node')

/** node and node-extra both hold src; node-extra holds extra too. Both isolate files (vitest's default). */
const TWO_PROJECTS_CONFIG = [
	"import { defineConfig } from 'vitest/config'",
	'export default defineConfig({ test: { projects: [',
	"\t{ test: { name: 'node', include: ['src/**/*.test.ts'] } },",
	"\t{ test: { name: 'node-extra', include: ['src/**/*.test.ts', 'extra/**/*.test.ts'] } },",
	'] } })',
	'',
].join('\n')

/** node shares modules between files (forks, isolate false); node-extra isolates them. Both hold src. */
const SHARING_CONFIG = [
	"import { defineConfig } from 'vitest/config'",
	'export default defineConfig({ test: { projects: [',
	"\t{ test: { name: 'node', include: ['src/**/*.test.ts'], isolate: false, pool: 'forks' } },",
	"\t{ test: { name: 'node-extra', include: ['src/**/*.test.ts'] } },",
	'] } })',
	'',
].join('\n')

/** node isolates files (isolate true, stated); node-extra too. Both hold src. */
const ISOLATING_CONFIG = [
	"import { defineConfig } from 'vitest/config'",
	'export default defineConfig({ test: { projects: [',
	"\t{ test: { name: 'node', include: ['src/**/*.test.ts'], isolate: true, pool: 'forks' } },",
	"\t{ test: { name: 'node-extra', include: ['src/**/*.test.ts'] } },",
	'] } })',
	'',
].join('\n')

/** node, extra and subnode hold src: CI names matching node only by vitest's rule leave the other two out. */
const NAMES_CONFIG = [
	"import { defineConfig } from 'vitest/config'",
	'export default defineConfig({ test: { projects: [',
	"\t{ test: { name: 'node', include: ['src/**/*.test.ts'] } },",
	"\t{ test: { name: 'extra', include: ['src/**/*.test.ts'] } },",
	"\t{ test: { name: 'subnode', include: ['src/**/*.test.ts'] } },",
	'] } })',
	'',
].join('\n')

/** node and node-extra both hold src; node-extra loads a setup file that logs each load of it. */
const LOGGED_TWO_PROJECTS_CONFIG = [
	"import { defineConfig } from 'vitest/config'",
	'export default defineConfig({ test: { projects: [',
	"\t{ test: { name: 'node', include: ['src/**/*.test.ts'] } },",
	"\t{ test: { name: 'node-extra', include: ['src/**/*.test.ts'], setupFiles: ['./test/node-extra-setup.ts'] } },",
	'] } })',
	'',
].join('\n')

const NODE_EXTRA_SETUP_FILE = 'test/node-extra-setup.ts'

/** The base config of a lot renaming the CI project: its one project is unit. */
const UNIT_CONFIG = [
	"import { defineConfig } from 'vitest/config'",
	"export default defineConfig({ test: { projects: [{ test: { name: 'unit', include: ['src/**/*.test.ts'] } }] } })",
	'',
].join('\n')

/** The head config of that lot: unit renamed node. */
const NODE_CONFIG = [
	"import { defineConfig } from 'vitest/config'",
	"export default defineConfig({ test: { projects: [{ test: { name: 'node', include: ['src/**/*.test.ts'] } }] } })",
	'',
].join('\n')

/** The setup file of node-extra: it appends a line to `log` each time a run of node-extra loads it, whatever the tree. */
function nodeExtraSetupText(log: string): string {
	return [
		"import { appendFileSync } from 'node:fs'",
		`appendFileSync(${JSON.stringify(log)}, \`node-extra ran in \${process.cwd()}\\n\`)`,
		'',
	].join('\n')
}

/** A log file no run has written yet. */
function emptyLog(): string {
	return join(temporaryFolder('dialecte-node-extra-log-'), 'node-extra.log')
}

const STUB =
	"export function add(left: number, right: number): number {\n\tthrow new Error('not implemented: add')\n}\n"
const IMPLEMENTED =
	'export function add(left: number, right: number): number {\n\treturn left + right\n}\n'
const REFACTORED =
	'export function add(left: number, right: number): number {\n\treturn right + left\n}\n'
const SUBTRACTING =
	'export function add(left: number, right: number): number {\n\treturn left - right\n}\n'
const LOG = 'export function log(message: string): string {\n\treturn message\n}\n'

const ADD_TEST = [
	"import { add } from './add.ts'",
	"import { expect, it } from 'vitest'",
	"it('one plus two → three', () => { expect(add(1, 2)).toBe(3) })",
	'',
].join('\n')

/** The add case, `./log.ts` mocked on line 3. */
const MOCKING_TEST = [
	"import { add } from './add.ts'",
	"import { expect, it, vi } from 'vitest'",
	"vi.mock('./log.ts', () => ({ log: () => '' }))",
	"it('one plus two → three', () => { expect(add(1, 2)).toBe(3) })",
	'',
].join('\n')

/** The add case, a spy on `log` only: no module mock. */
const SPYING_TEST = [
	"import { add } from './add.ts'",
	"import { expect, it, vi } from 'vitest'",
	'const logging = { log: (message: string) => message }',
	"it('one plus two → three', () => { vi.spyOn(logging, 'log'); expect(add(1, 2)).toBe(3) })",
	'',
].join('\n')

/** The add case, `./log.ts` mocked by vi.doMock on line 4, inside the case. */
const DO_MOCKING_TEST = [
	"import { add } from './add.ts'",
	"import { expect, it, vi } from 'vitest'",
	"it('one plus two → three', () => {",
	"\tvi.doMock('./log.ts', () => ({ log: () => '' }))",
	'\texpect(add(1, 2)).toBe(3)',
	'})',
	'',
].join('\n')

/** Two add cases, no mock. */
const ADD_TWO_TEST = [
	"import { add } from './add.ts'",
	"import { expect, it } from 'vitest'",
	"it('one plus two → three', () => { expect(add(1, 2)).toBe(3) })",
	"it('two plus two → four', () => { expect(add(2, 2)).toBe(4) })",
	'',
].join('\n')

/** The same two cases, `./log.ts` mocked on line 3. */
const MOCKING_TWO_TEST = [
	"import { add } from './add.ts'",
	"import { expect, it, vi } from 'vitest'",
	"vi.mock('./log.ts', () => ({ log: () => '' }))",
	"it('one plus two → three', () => { expect(add(1, 2)).toBe(3) })",
	"it('two plus two → four', () => { expect(add(2, 2)).toBe(4) })",
	'',
].join('\n')

/** A file under extra mocking `../src/log.ts` on line 3. */
const EXTRA_MOCKING_TEST = [
	"import { add } from '../src/add.ts'",
	"import { expect, it, vi } from 'vitest'",
	"vi.mock('../src/log.ts', () => ({ log: () => '' }))",
	"it('two plus two → four', () => { expect(add(2, 2)).toBe(4) })",
	'',
].join('\n')

/** CI's node isolates files and holds src; extra, outside CI, shares modules and holds extra. */
const OUTSIDE_SHARING_CONFIG = [
	"import { defineConfig } from 'vitest/config'",
	'export default defineConfig({ test: { projects: [',
	"\t{ test: { name: 'node', include: ['src/**/*.test.ts'] } },",
	"\t{ test: { name: 'extra', include: ['extra/**/*.test.ts'], isolate: false, pool: 'forks' } },",
	'] } })',
	'',
].join('\n')

/** The extra case moved into src, its import following it. */
const MOVED_EXTRA_TEST = [
	"import { add } from './add.ts'",
	"import { expect, it } from 'vitest'",
	"it('two plus two → four', () => { expect(add(2, 2)).toBe(4) })",
	'',
].join('\n')

/** A file only node-extra holds. */
const EXTRA_TEST = [
	"import { add } from '../src/add.ts'",
	"import { expect, it } from 'vitest'",
	"it('two plus two → four', () => { expect(add(2, 2)).toBe(4) })",
	'',
].join('\n')

const ADD_TEST_FILE = 'src/add.test.ts'
const ADD_CASE = 'src/add.test.ts::one plus two → three'
const EXTRA_TEST_FILE = 'extra/only.test.ts'
/** The refusal line of a file mocking a module: the call made, its line and the sharing project. */
function moduleMockLine(params: {
	file: string
	call: string
	line: number
	project: string
}): string {
	return `refused  ${params.file}  mocks a module (${params.call}, line ${params.line}) in the ${params.project} project, which shares modules between files: CI loads the module before the mock - test it without a module mock, or move the file to a project that isolates files`
}
const MODULE_MOCK_LINE = moduleMockLine({
	file: ADD_TEST_FILE,
	call: 'vi.mock',
	line: 3,
	project: 'node',
})
const NODE_NOTE = /^vitest projects: node \(as \.github\/workflows\/_test\.yml.* runs them\)$/

function tdd(params: { root: string; argv: string[] }) {
	return runTdd({ cwd: params.root, argv: params.argv, now: () => NOW })
}

/** The package.json of a fixture: the node script CI runs, and its gate when given. */
function packageJsonText(params: { dialecte?: Record<string, unknown> }): string {
	return `${JSON.stringify(
		{
			name: 'demo',
			type: 'module',
			scripts: { 'test:node': 'vitest run --project node' },
			devDependencies: { vitest: '^4.1.8' },
			...(params.dialecte && { dialecte: params.dialecte }),
		},
		null,
		'\t',
	)}\n`
}

/** A vitest package on main holding `config`, the test workflow when given, `log.ts` and `files`. */
function ciPackage(params: {
	config: string
	workflow?: string
	files?: Record<string, string>
	dialecte?: Record<string, unknown>
}): string {
	return createVitestPackage({
		files: {
			'package.json': packageJsonText({ dialecte: params.dialecte }),
			'vitest.config.ts': params.config,
			'src/log.ts': LOG,
			...(params.workflow !== undefined && { [WORKFLOW_PATH]: params.workflow }),
			...params.files,
		},
	})
}

/** The case labels of an output's case lines (`<status>  <label>  <detail>`), in order. */
function caseLabels(output: string): string[] {
	return output
		.split('\n')
		.filter((line) => /^(red|refused|green|unchanged|kept|accepted|revised) /.test(line))
		.map((line) => line.replace(/^\S+ +/, '').split('  ')[0])
}

/** The selection lines a command prints before its run. */
function noteLines(output: string): string[] {
	return output
		.split('\n')
		.filter(
			(line) => line.startsWith('vitest projects: ') || line.startsWith("not in CI's projects: "),
		)
}

/** The receipts of the package's ledger (its freezes left out), oldest first. */
function receiptsOf(root: string): TddReceipt[] {
	const ledger = readLedger(root)
	if ('failure' in ledger) throw new Error(ledger.failure)
	return ledger.entries.filter((entry): entry is TddReceipt => entry.kind !== 'freeze')
}

describe(
	'tdd runs a vitest file in the projects CI runs it in',
	{ timeout: SCENARIO_TIMEOUT },
	() => {
		const NAME_MATCH_CASES: { title: string; run: string; labels: string[] }[] = [
			{
				title:
					'CI names NODE (another case) → it matches node only (not subnode), as vitest matches it',
				run: 'npx vitest run --project NODE',
				labels: [`${ADD_CASE} [node]`],
			},
			{
				title:
					'CI names no* (a glob) → it matches node only (anchored: not subnode), as vitest matches it',
				run: "npx vitest run --project 'no*'",
				labels: [`${ADD_CASE} [node]`],
			},
			{
				title:
					'CI names * and !extra → every project, extra too (the * matches it; vitest negates only within a browser project)',
				run: "npx vitest run --project '*' --project '!extra'",
				labels: [`${ADD_CASE} [extra]`, `${ADD_CASE} [node]`, `${ADD_CASE} [subnode]`],
			},
			{
				title: 'CI names !extra alone (a negation) → node and subnode, extra left out',
				run: "npx vitest run --project '!extra'",
				labels: [`${ADD_CASE} [node]`, `${ADD_CASE} [subnode]`],
			},
		]

		for (const row of NAME_MATCH_CASES)
			it(`${row.title}: red runs the file there only`, async () => {
				const root = ciPackage({ config: NAMES_CONFIG, workflow: workflowRunning(row.run) })
				writeFiles({ root, files: { 'src/add.ts': STUB, [ADD_TEST_FILE]: ADD_TEST } })

				const red = await tdd({ root, argv: ['red'] })

				expect({ exitCode: red.exitCode, labels: caseLabels(red.output).sort() }).toEqual({
					exitCode: 0,
					labels: row.labels,
				})
			})

		it('CI selects node, node and node-extra both hold the file → red and green run it in node only, each announcing the selection', async () => {
			const root = ciPackage({ config: TWO_PROJECTS_CONFIG, workflow: NODE_WORKFLOW })
			writeFiles({ root, files: { 'src/add.ts': STUB, [ADD_TEST_FILE]: ADD_TEST } })
			const red = await tdd({ root, argv: ['red'] })
			writeFileSync(join(root, 'src/add.ts'), IMPLEMENTED)

			const green = await tdd({ root, argv: ['green'] })

			expect({
				red: {
					exitCode: red.exitCode,
					labels: caseLabels(red.output),
					notes: noteLines(red.output),
				},
				green: {
					exitCode: green.exitCode,
					labels: caseLabels(green.output),
					notes: noteLines(green.output),
				},
			}).toEqual({
				red: {
					exitCode: 0,
					labels: [`${ADD_CASE} [node]`],
					notes: [expect.stringMatching(NODE_NOTE)],
				},
				green: {
					exitCode: 0,
					labels: [`${ADD_CASE} [node]`],
					notes: [expect.stringMatching(NODE_NOTE)],
				},
			})
		})

		it("a file only node-extra holds, CI selecting node → it runs in node-extra, announced not in CI's projects", async () => {
			const root = ciPackage({ config: TWO_PROJECTS_CONFIG, workflow: NODE_WORKFLOW })
			writeFiles({ root, files: { 'src/add.ts': STUB, [EXTRA_TEST_FILE]: EXTRA_TEST } })

			const red = await tdd({ root, argv: ['red'] })

			expect({ labels: caseLabels(red.output), notes: noteLines(red.output) }).toEqual({
				labels: [`${EXTRA_TEST_FILE}::two plus two → four [node-extra]`],
				notes: [expect.stringMatching(NODE_NOTE), `not in CI's projects: ${EXTRA_TEST_FILE}`],
			})
		})

		it('no test workflow (CI not read), two projects → every holding project runs, announced as all with the reason', async () => {
			const root = ciPackage({ config: TWO_PROJECTS_CONFIG })
			writeFiles({ root, files: { 'src/add.ts': STUB, [ADD_TEST_FILE]: ADD_TEST } })

			const red = await tdd({ root, argv: ['red'] })

			expect({ labels: caseLabels(red.output), notes: noteLines(red.output) }).toEqual({
				labels: [`${ADD_CASE} [node]`, `${ADD_CASE} [node-extra]`],
				notes: [expect.stringMatching(/^vitest projects: all \(.+\)$/)],
			})
		})

		it('a red in both projects, then CI selecting node and a green → no deleted, no unproven line; the hook passes on the node case alone', async () => {
			const check: GateStep = countingStep({ counter: createCounter(), name: 'check' })
			const root = ciPackage({
				config: TWO_PROJECTS_CONFIG,
				dialecte: { gate: { full: [check], hook: [check] } },
			})
			writeFiles({ root, files: { 'src/add.ts': STUB, [ADD_TEST_FILE]: ADD_TEST } })
			await tdd({ root, argv: ['red'] })
			writeFiles({ root, files: { 'src/add.ts': IMPLEMENTED, [WORKFLOW_PATH]: NODE_WORKFLOW } })
			await tdd({ root, argv: ['green'] })
			git({ root, args: ['add', '-A'] })

			const status = await tdd({ root, argv: ['status'] })
			const hook = await runHookIn({ cwd: root })

			expect({
				statusLines: status.output.split('\n').filter((line) => /^(deleted|unproven)\b/.test(line)),
				hookExitCode: hook.exitCode,
				hookFirst: hook.output.split('\n')[0],
			}).toEqual({
				statusLines: [],
				hookExitCode: 0,
				hookFirst: 'ok    tdd  1 case(s) of the change: 1 red then green',
			})
		})

		it(
			"a revised case run on the base copy → the base run selects the head's projects: one red on base in node, node-extra never run",
			{ timeout: BASE_RED_SCENARIO_TIMEOUT },
			async () => {
				const log = emptyLog()
				const root = createBaseRedPackage({
					runner: 'vitest',
					committed: {
						'package.json': packageJsonText({}),
						'vitest.config.ts': LOGGED_TWO_PROJECTS_CONFIG,
						[NODE_EXTRA_SETUP_FILE]: nodeExtraSetupText(log),
						[WORKFLOW_PATH]: NODE_WORKFLOW,
						'src/add.ts': SUBTRACTING,
					},
					written: { 'src/add.ts': IMPLEMENTED, [ADD_TEST_FILE]: VITEST_REVISED_TEST_TEXT },
					revised: ['src/add.test.ts::add > one [node]'],
				})

				const red = await tdd({ root, argv: ['red'] })

				expect({
					exitCode: red.exitCode,
					lines: red.output.split('\n').filter((line) => /^(red|refused) /.test(line)),
					nodeExtraRan: existsSync(log),
				}).toEqual({
					exitCode: 0,
					lines: [
						expect.stringMatching(
							new RegExp(
								`^red {6}src/add\\.test\\.ts::add > one \\[node\\] {2}.+ {2}flags: ${RED_ON_BASE_FLAG}$`,
							),
						),
					],
					nodeExtraRan: false,
				})
			},
		)

		it(
			'a lot renaming the CI project (base unit, head node), a revised case run on the base copy → the base run fails naming the project the base config lacks',
			{ timeout: BASE_RED_SCENARIO_TIMEOUT },
			async () => {
				const root = createBaseRedPackage({
					runner: 'vitest',
					committed: {
						'package.json': packageJsonText({}),
						'vitest.config.ts': UNIT_CONFIG,
						'src/add.ts': SUBTRACTING,
					},
					written: {
						'vitest.config.ts': NODE_CONFIG,
						[WORKFLOW_PATH]: NODE_WORKFLOW,
						'src/add.ts': IMPLEMENTED,
						[ADD_TEST_FILE]: VITEST_REVISED_TEST_TEXT,
					},
					revised: ['src/add.test.ts::add > one [node]'],
				})

				const red = await tdd({ root, argv: ['red'] })

				expect({
					exitCode: red.exitCode,
					named: red.output.includes('the base config declares no vitest project node'),
					redOnBase: red.output.includes(RED_ON_BASE_FLAG),
				}).toEqual({ exitCode: 1, named: true, redOnBase: false })
			},
		)

		it('a red of a changed helper alone (its dependents run through a second selection), CI selecting node → the selection note printed', async () => {
			const root = ciPackage({
				config: TWO_PROJECTS_CONFIG,
				workflow: NODE_WORKFLOW,
				files: {
					'src/add.ts': ORPHAN_PRODUCTION,
					[ORPHAN_HELPER]: ORPHAN_HELPER_TEXT,
					[ORPHAN_DEPENDENT_TEST]: ORPHAN_DEPENDENT_TEST_TEXT,
				},
			})
			writeFileSync(join(root, ORPHAN_HELPER), ORPHAN_EDITED_HELPER_TEXT)

			const red = await tdd({ root, argv: ['red'] })

			expect(noteLines(red.output)).toEqual([expect.stringMatching(NODE_NOTE)])
		})

		it("a test file only node-extra held deleted and another moved from extra into src, CI selecting node → no not in CI's projects note for their base paths", async () => {
			const root = ciPackage({
				config: TWO_PROJECTS_CONFIG,
				workflow: NODE_WORKFLOW,
				files: {
					'src/add.ts': IMPLEMENTED,
					'extra/gone.test.ts': EXTRA_TEST,
					'extra/moved.test.ts': EXTRA_TEST,
				},
			})
			git({ root, args: ['rm', '-q', 'extra/gone.test.ts'] })
			git({ root, args: ['mv', 'extra/moved.test.ts', 'src/moved.test.ts'] })
			writeFiles({
				root,
				files: {
					'src/add.ts': STUB,
					'src/moved.test.ts': MOVED_EXTRA_TEST,
				},
			})

			const red = await tdd({ root, argv: ['red'] })

			expect(noteLines(red.output)).toEqual([expect.stringMatching(NODE_NOTE)])
		})

		it('a changed helper whose unchanged dependent node and node-extra both hold, CI selecting node → red runs the dependent in node only: the helper frozen, node-extra never run', async () => {
			const log = emptyLog()
			const root = ciPackage({
				config: LOGGED_TWO_PROJECTS_CONFIG,
				workflow: NODE_WORKFLOW,
				files: {
					[NODE_EXTRA_SETUP_FILE]: nodeExtraSetupText(log),
					'src/add.ts': ORPHAN_PRODUCTION,
					[ORPHAN_HELPER]: ORPHAN_HELPER_TEXT,
					[ORPHAN_DEPENDENT_TEST]: ORPHAN_DEPENDENT_TEST_TEXT,
				},
			})
			writeFileSync(join(root, ORPHAN_HELPER), ORPHAN_EDITED_HELPER_TEXT)

			const red = await tdd({ root, argv: ['red'] })

			expect({
				frozen: red.output
					.split('\n')
					.includes(
						`frozen   ${ORPHAN_HELPER}  through the unchanged test files importing it, which pass with it: ${ORPHAN_DEPENDENT_TEST}`,
					),
				nodeExtraRan: existsSync(log),
			}).toEqual({ frozen: true, nodeExtraRan: false })
		})

		it(
			'cases a helper registers, split from a deleted table file into leg files (moved by name), CI selecting node → the base collect and the status read node only, node-extra never run',
			{ timeout: BASE_RED_SCENARIO_TIMEOUT },
			async () => {
				const log = emptyLog()
				const root = splitPackage({
					base: {
						'package.json': packageJsonText({}),
						'vitest.config.ts': LOGGED_TWO_PROJECTS_CONFIG,
						[NODE_EXTRA_SETUP_FILE]: nodeExtraSetupText(log),
						[WORKFLOW_PATH]: NODE_WORKFLOW,
						[ROWS_FILE]: ROWS_TEXT,
						[CHECK_HELPER_FILE]: CHECK_HELPER_TEXT,
						[TABLE_BASE_FILE]: TABLE_BASE_TEXT,
					},
					now: {
						[TABLE_BASE_FILE]: null,
						[LEG_HELPER_FILE]: LEG_HELPER_TEXT,
						'src/dd-leg-a.test.ts': legText({ subset: [1, 2] }),
						'src/dd-leg-b.test.ts': legText({ subset: [3, 4] }),
						'src/dd-leg-c.test.ts': legText({ subset: [5, 6] }),
					},
				})

				const status = await tdd({ root, argv: ['status'] })
				const json = await tdd({ root, argv: ['status', '--json'] })
				const { cases } = JSON.parse(json.output) as {
					cases: { project: string; status: string }[]
				}

				expect({
					moved: status.output.split('\n').filter((line) => /^moved by name {2}/.test(line)),
					cases: cases.map((each) => `${each.status} [${each.project}]`),
					nodeExtraRan: existsSync(log),
				}).toEqual({
					moved: [
						expect.stringMatching(
							/^moved by name {2}6 case\(s\) {2}src\/dd-table\.test\.ts → 3 file\(s\)/,
						),
					],
					cases: Array(6).fill('unchanged [node]'),
					nodeExtraRan: false,
				})
			},
		)
	},
)

describe(
	'a module mock in a project sharing modules between files',
	{ timeout: SCENARIO_TIMEOUT },
	() => {
		it('vi.mock in a file the selected node project (forks, isolate false) holds → red refuses it before the run, one refusal entry, no red receipt', async () => {
			const root = ciPackage({ config: SHARING_CONFIG, workflow: NODE_WORKFLOW })
			writeFiles({ root, files: { 'src/add.ts': STUB, [ADD_TEST_FILE]: MOCKING_TEST } })

			const red = await tdd({ root, argv: ['red'] })

			expect({
				exitCode: red.exitCode,
				refused: red.output.split('\n').filter((line) => line.startsWith('refused ')),
				receipts: receiptsOf(root).map(({ kind, file, name, reason }) => ({
					kind,
					file,
					name,
					reason,
				})),
			}).toEqual({
				exitCode: 1,
				refused: [MODULE_MOCK_LINE],
				receipts: [{ kind: 'refused', file: ADD_TEST_FILE, name: '', reason: 'module mock' }],
			})
		})

		it('two cases red without the mock, then the mock added back → green runs them and refuses every case for the module mock (not as frozen after red), the line once for the file, exit 1', async () => {
			const root = ciPackage({ config: SHARING_CONFIG, workflow: NODE_WORKFLOW })
			writeFiles({ root, files: { 'src/add.ts': STUB, [ADD_TEST_FILE]: ADD_TWO_TEST } })
			await tdd({ root, argv: ['red'] })
			writeFiles({ root, files: { 'src/add.ts': IMPLEMENTED, [ADD_TEST_FILE]: MOCKING_TWO_TEST } })
			const before = receiptsOf(root).length

			const green = await tdd({ root, argv: ['green'] })

			expect({
				exitCode: green.exitCode,
				mockLines: green.output.split('\n').filter((line) => line.includes('mocks a module')),
				receipts: receiptsOf(root)
					.slice(before)
					.map(({ kind, name, project, reason }) => ({ kind, name, project, reason })),
			}).toEqual({
				exitCode: 1,
				mockLines: [MODULE_MOCK_LINE],
				receipts: [
					{ kind: 'refused', name: 'one plus two → three', project: 'node', reason: 'module mock' },
					{ kind: 'refused', name: 'two plus two → four', project: 'node', reason: 'module mock' },
				],
			})
		})

		it('vi.doMock inside a case of a file the selected sharing node project holds → red refuses it, the line naming vi.doMock and its line', async () => {
			const root = ciPackage({ config: SHARING_CONFIG, workflow: NODE_WORKFLOW })
			writeFiles({ root, files: { 'src/add.ts': STUB, [ADD_TEST_FILE]: DO_MOCKING_TEST } })

			const red = await tdd({ root, argv: ['red'] })

			expect({
				exitCode: red.exitCode,
				refused: red.output.split('\n').filter((line) => line.startsWith('refused ')),
			}).toEqual({
				exitCode: 1,
				refused: [
					moduleMockLine({ file: ADD_TEST_FILE, call: 'vi.doMock', line: 4, project: 'node' }),
				],
			})
		})

		it("a file refused at red for its module mock, outside CI's projects → no not in CI's projects note for it (it does not run)", async () => {
			const root = ciPackage({ config: OUTSIDE_SHARING_CONFIG, workflow: NODE_WORKFLOW })
			writeFiles({ root, files: { 'src/add.ts': STUB, [EXTRA_TEST_FILE]: EXTRA_MOCKING_TEST } })

			const red = await tdd({ root, argv: ['red'] })

			expect(noteLines(red.output)).toEqual([expect.stringMatching(NODE_NOTE)])
		})

		it("vi.mock in a file outside CI's projects, held by the sharing extra project → red refuses it naming extra, no red receipt", async () => {
			const root = ciPackage({ config: OUTSIDE_SHARING_CONFIG, workflow: NODE_WORKFLOW })
			writeFiles({ root, files: { 'src/add.ts': STUB, [EXTRA_TEST_FILE]: EXTRA_MOCKING_TEST } })

			const red = await tdd({ root, argv: ['red'] })

			expect({
				exitCode: red.exitCode,
				refused: red.output.split('\n').filter((line) => line.startsWith('refused ')),
				receipts: receiptsOf(root).map(({ kind, file, name, reason }) => ({
					kind,
					file,
					name,
					reason,
				})),
			}).toEqual({
				exitCode: 1,
				refused: [
					moduleMockLine({ file: EXTRA_TEST_FILE, call: 'vi.mock', line: 3, project: 'extra' }),
				],
				receipts: [{ kind: 'refused', file: EXTRA_TEST_FILE, name: '', reason: 'module mock' }],
			})
		})

		it('a file moved with its bytes, holding a module mock, production changed → green refuses its cases for the module mock alone', async () => {
			const root = ciPackage({
				config: SHARING_CONFIG,
				workflow: NODE_WORKFLOW,
				files: { 'src/add.ts': IMPLEMENTED, [ADD_TEST_FILE]: MOCKING_TEST },
			})
			git({ root, args: ['mv', ADD_TEST_FILE, 'src/sum.test.ts'] })
			writeFileSync(join(root, 'src/add.ts'), REFACTORED)

			const green = await tdd({ root, argv: ['green'] })

			expect({
				exitCode: green.exitCode,
				reasons: receiptsOf(root)
					.filter((receipt) => receipt.kind === 'refused')
					.map(({ file, project, reason }) => ({ file, project, reason })),
			}).toEqual({
				exitCode: 1,
				reasons: [{ file: 'src/sum.test.ts', project: 'node', reason: 'module mock' }],
			})
		})

		const NOT_REFUSED_CASES: {
			title: string
			config: string
			workflow: string
			test: string
			labels: string[]
		}[] = [
			{
				title:
					'vi.mock in a file the selected node project holds, node isolating files → red runs it in node, no refusal',
				config: ISOLATING_CONFIG,
				workflow: NODE_WORKFLOW,
				test: MOCKING_TEST,
				labels: [`${ADD_CASE} [node]`],
			},
			{
				title:
					'vi.spyOn only in a file the selected sharing node project holds → red runs it in node, no refusal',
				config: SHARING_CONFIG,
				workflow: NODE_WORKFLOW,
				test: SPYING_TEST,
				labels: [`${ADD_CASE} [node]`],
			},
			{
				title:
					'vi.mock in a file the sharing node project holds, CI selecting the isolating node-extra only → red runs it in node-extra, no refusal',
				config: SHARING_CONFIG,
				workflow: workflowRunning('npx vitest run --project node-extra'),
				test: MOCKING_TEST,
				labels: [`${ADD_CASE} [node-extra]`],
			},
		]

		for (const row of NOT_REFUSED_CASES)
			it(row.title, async () => {
				const root = ciPackage({ config: row.config, workflow: row.workflow })
				writeFiles({ root, files: { 'src/add.ts': STUB, [ADD_TEST_FILE]: row.test } })

				const red = await tdd({ root, argv: ['red'] })

				expect({ exitCode: red.exitCode, labels: caseLabels(red.output) }).toEqual({
					exitCode: 0,
					labels: row.labels,
				})
			})

		it('no test workflow (all), vi.mock in a file the sharing node project holds → red refuses it naming node', async () => {
			const root = ciPackage({ config: SHARING_CONFIG })
			writeFiles({ root, files: { 'src/add.ts': STUB, [ADD_TEST_FILE]: MOCKING_TEST } })

			const red = await tdd({ root, argv: ['red'] })

			expect({
				exitCode: red.exitCode,
				refused: red.output.split('\n').filter((line) => line.startsWith('refused ')),
			}).toEqual({ exitCode: 1, refused: [MODULE_MOCK_LINE] })
		})
	},
)
