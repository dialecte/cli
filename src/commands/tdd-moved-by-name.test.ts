/**
 * Cases a helper registers, moved from a deleted test file to legs that call a shared helper: the call that
 * registers them differs, so they are matched by name - and only when the base registered them through a runner too.
 */
import { existsSync, realpathSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import {
	CHECK_HELPER_FILE,
	CHECK_HELPER_TEXT,
	LEG_HELPER_FILE,
	LEG_HELPER_TEXT,
	ROWS_FILE,
	ROWS_TEXT,
	SPLIT_SOURCE_FILE,
	TABLE_BASE_FILE,
	TABLE_BASE_TEXT,
	VITEST_IMPORT,
} from '../../test/moved-cases-fixture.constants.ts'
import {
	legText,
	localRunnerText,
	splitPackage,
	suiteText,
} from '../../test/moved-cases-fixture.ts'
import { noRepositoryCli } from '../../test/repository-cli-probe.ts'
import { git, temporaryFolder } from '../../test/scratch-repository.ts'
import { HANDOVER_CASE_TIMEOUT, HELPER_SCENARIO_TIMEOUT } from '../../test/test-timing.constants.ts'
import { readPackageJson } from '../lib/package-json.ts'
import { checkTddReceipts } from '../lib/tdd/check-tdd-receipts.ts'
import { runTestCases } from '../lib/tdd/run-test-cases.ts'
import { runGate } from './gate.ts'
import { runHandover } from './handover.ts'
import { runTdd } from './tdd.ts'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { LotsFile } from '../lib/handover/handover.types.ts'

/** Every call goes through to the real run, kept so a case can count the collect-only runs. */
vi.mock('../lib/tdd/run-test-cases.ts', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../lib/tdd/run-test-cases.ts')>()
	return { ...actual, runTestCases: vi.fn(actual.runTestCases) }
})

const NOW = new Date('2026-11-09T12:00:00.000Z')

function tdd(params: { cwd: string; argv: string[] }) {
	return runTdd({ cwd: params.cwd, argv: params.argv, now: () => NOW })
}

function caseLines(output: string): string[] {
	return output
		.split('\n')
		.filter((line) => /^(red|refused|green|unchanged|kept|accepted|revised) /.test(line))
}

/** The grouped `moved by name` lines of an output. */
function movedByNameLines(output: string): string[] {
	return output.split('\n').filter((line) => /^moved by name {2}/.test(line))
}

async function statusesOf(root: string): Promise<Array<{ file: string; status: string }>> {
	const status = await tdd({ cwd: root, argv: ['status', '--json'] })
	const { cases } = JSON.parse(status.output) as { cases: Array<{ file: string; status: string }> }
	return cases.map(({ file, status: caseStatus }) => ({ file, status: caseStatus }))
}

/** How many collect-only runs the `tdd` commands made since the mock was last cleared. */
function collectRuns(): number {
	return vi.mocked(runTestCases).mock.calls.filter(([params]) => params.filter === 'collect').length
}

/** The collect-only runs of the base: those whose root is not the package's own (the current files are collected there). */
function baseCollects(root: string): Array<Parameters<typeof runTestCases>[0]> {
	const packageRoot = realpathSync(root)
	return vi
		.mocked(runTestCases)
		.mock.calls.map(([params]) => params)
		.filter(
			(params) =>
				params.filter === 'collect' &&
				(!existsSync(params.root) || realpathSync(params.root) !== packageRoot),
		)
}

const LEG_FILES = ['src/dd-leg-a.test.ts', 'src/dd-leg-b.test.ts', 'src/dd-leg-c.test.ts']

/** The table base (rows, runner helper, the looping test file), then the legs: `legs` are the three subsets. */
function legSplit(params: {
	subsets: number[][]
	rename?: Record<string, string>
	dialecte?: Record<string, unknown>
}): string {
	return splitPackage({
		dialecte: params.dialecte,
		base: {
			[ROWS_FILE]: ROWS_TEXT,
			[CHECK_HELPER_FILE]: CHECK_HELPER_TEXT,
			[TABLE_BASE_FILE]: TABLE_BASE_TEXT,
		},
		now: {
			[TABLE_BASE_FILE]: null,
			[LEG_HELPER_FILE]: LEG_HELPER_TEXT,
			...Object.fromEntries(
				params.subsets.map((subset, index) => [
					LEG_FILES[index],
					legText({
						subset,
						rename: index === params.subsets.length - 1 ? params.rename : undefined,
					}),
				]),
			),
		},
	})
}

const THREE_LEGS = [
	[1, 2],
	[3, 4],
	[5, 6],
]

describe('cases a helper registers, moved by name', { timeout: HELPER_SCENARIO_TIMEOUT }, () => {
	beforeEach(() => {
		vi.mocked(runTestCases).mockClear()
	})

	it('a table suite registered through a runner, split into three leg files calling a shared helper → every case moved by name, unchanged; the line names the runner calls; a red run records them unchanged', async () => {
		const root = legSplit({ subsets: THREE_LEGS })

		const status = await tdd({ cwd: root, argv: ['status'] })
		const statuses = await statusesOf(root)
		const red = await tdd({ cwd: root, argv: ['red'] })

		expect({
			statuses: statuses.map((each) => each.status),
			moved: movedByNameLines(status.output),
			redExitCode: red.exitCode,
			red: caseLines(red.output).map((line) => line.split('  ')[0]),
		}).toEqual({
			statuses: Array(6).fill('unchanged'),
			moved: [
				expect.stringMatching(
					/^moved by name {2}6 case\(s\) {2}src\/dd-table\.test\.ts → 3 file\(s\) · runner changed: .*checkRow.* → .*defineLeg/,
				),
			],
			redExitCode: 0,
			red: Array(6).fill('unchanged'),
		})
	})

	it('one row renamed in a leg (a name the base never registered) → that case is not moved (a new passing case, refused at red); the other five are moved by name', async () => {
		const root = legSplit({
			subsets: THREE_LEGS,
			rename: { 'DD_5 keeps attribute a': 'DD_5 keeps attribute a, renamed' },
		})

		const status = await tdd({ cwd: root, argv: ['status'] })
		const statuses = await statusesOf(root)
		const red = await tdd({ cwd: root, argv: ['red'] })

		expect({
			moved: movedByNameLines(status.output),
			statuses: statuses.map((each) => each.status).sort(),
			refused: caseLines(red.output).filter((line) => line.startsWith('refused')).length,
		}).toEqual({
			moved: [expect.stringMatching(/^moved by name {2}5 case\(s\) {2}src\/dd-table\.test\.ts/)],
			statuses: ['missing receipt', ...Array(5).fill('unchanged')],
			refused: 1,
		})
		expect(caseLines(red.output).find((line) => line.startsWith('refused'))).toContain('renamed')
	})

	it('the same row registered by two legs → neither is moved, the status names both leg files as ambiguous; the other rows are moved by name', async () => {
		const root = legSplit({
			subsets: [
				[1, 2],
				[2, 3, 4],
				[5, 6],
			],
		})

		const status = await tdd({ cwd: root, argv: ['status'] })
		const statuses = await statusesOf(root)

		expect({
			moved: movedByNameLines(status.output),
			ambiguous: status.output.split('\n').filter((line) => /ambiguous/.test(line)),
			duplicated: statuses
				.filter((each) => each.status === 'missing receipt')
				.map((each) => each.file),
		}).toEqual({
			moved: [expect.stringMatching(/^moved by name {2}5 case\(s\) {2}src\/dd-table\.test\.ts/)],
			ambiguous: [
				expect.stringMatching(/ambiguous.*src\/dd-leg-a\.test\.ts.*src\/dd-leg-b\.test\.ts/),
			],
			duplicated: [LEG_FILES[0], LEG_FILES[1]],
		})
	})

	it('a base case written as a direct test call, the same name now registered by a helper → not moved by name (missing receipt), while a row the base registered through the runner is', async () => {
		const root = splitPackage({
			base: {
				[ROWS_FILE]: ROWS_TEXT,
				[CHECK_HELPER_FILE]: CHECK_HELPER_TEXT,
				'src/dd-mixed.test.ts': [
					VITEST_IMPORT,
					"import { checkRow } from '../test/check-row.ts'",
					"import { ROWS } from '../test/rows.cases.ts'",
					"describe('D', () => {",
					"\tit('DD_1 keeps attribute a', () => { expect(1).toBeGreaterThan(0) })",
					'\tcheckRow(ROWS[1])',
					'})',
					'',
				].join('\n'),
			},
			now: {
				'src/dd-mixed.test.ts': null,
				[LEG_HELPER_FILE]: LEG_HELPER_TEXT,
				[LEG_FILES[0]]: legText({ subset: [1, 2] }),
			},
		})

		const status = await tdd({ cwd: root, argv: ['status'] })
		const statuses = await statusesOf(root)

		expect({
			moved: movedByNameLines(status.output),
			statuses: statuses.map((each) => each.status),
		}).toEqual({
			moved: [expect.stringMatching(/^moved by name {2}1 case\(s\) {2}src\/dd-mixed\.test\.ts/)],
			statuses: ['missing receipt', 'unchanged'],
		})
	})
})

describe('the collect-only run of the base', { timeout: HELPER_SCENARIO_TIMEOUT }, () => {
	beforeEach(() => {
		vi.mocked(runTestCases).mockClear()
	})

	it('a split of direct test calls (every case moved exactly) → no base collect run: one collect-only run for the current files only', async () => {
		const root = splitPackage({
			base: { [SPLIT_SOURCE_FILE]: suiteText({ groups: ['DD_1', 'DD_2'] }) },
			now: {
				[SPLIT_SOURCE_FILE]: null,
				'src/dd-1.test.ts': suiteText({ groups: ['DD_1'] }),
				'src/dd-2.test.ts': suiteText({ groups: ['DD_2'] }),
			},
		})

		const status = await tdd({ cwd: root, argv: ['status'] })

		expect({
			collects: collectRuns(),
			baseCollects: baseCollects(root).length,
			byName: movedByNameLines(status.output),
			exact: status.output.split('\n').filter((line) => /^moved {2}/.test(line)),
		}).toEqual({
			collects: 1,
			baseCollects: 0,
			byName: [],
			exact: [expect.stringMatching(/^moved {2}2 case\(s\) {2}src\/dd\.test\.ts → 2 file\(s\)$/)],
		})
	})

	it('a split through a helper → one base collect run of the base sources, with an explicit bound, its duration shown, nothing it needed left on disk or in the worktree', async () => {
		const root = legSplit({ subsets: THREE_LEGS })
		const before = git({ root, args: ['status', '--porcelain', '--ignored'] })

		const status = await tdd({ cwd: root, argv: ['status'] })
		const calls = baseCollects(root)

		expect({
			baseCollects: calls.length,
			explicitBound: calls.every((call) =>
				Object.entries(call).some(
					([key, value]) => /timeout|bound/i.test(key) && typeof value === 'number' && value > 0,
				),
			),
			leftOnDisk: calls.flatMap((call) =>
				call.files.filter((file) => existsSync(join(call.root, file))),
			),
			durationShown: /(base|collect)[^\n]*\d+(\.\d+)? ?(ms|s)\b/i.test(status.output),
			worktreeUnchanged: git({ root, args: ['status', '--porcelain', '--ignored'] }) === before,
		}).toEqual({
			baseCollects: 1,
			explicitBound: true,
			leftOnDisk: [],
			durationShown: true,
			worktreeUnchanged: true,
		})
	})

	it('a table-driven file registered through a runner helper gets one row added, nothing split or deleted → no base collect run: no collect lists a base source', async () => {
		function tableText(rows: string[]): string {
			return [
				VITEST_IMPORT,
				"import { checkRow } from '../test/check-row.ts'",
				`const ROWS = [${rows.map((row, index) => `{ name: '${row}', value: ${index + 1} }`).join(', ')}]`,
				"describe('D', () => { for (const row of ROWS) checkRow(row) })",
				'',
			].join('\n')
		}
		const root = splitPackage({
			base: {
				[ROWS_FILE]: ROWS_TEXT,
				[CHECK_HELPER_FILE]: CHECK_HELPER_TEXT,
				'src/dd-inline.test.ts': tableText(['DD_1 keeps attribute a', 'DD_2 keeps attribute a']),
			},
			now: {
				'src/dd-inline.test.ts': tableText([
					'DD_1 keeps attribute a',
					'DD_2 keeps attribute a',
					'DD_3 keeps attribute a',
				]),
			},
		})

		await tdd({ cwd: root, argv: ['status'] })

		expect({
			baseCollects: baseCollects(root).length,
			collects: collectRuns(),
		}).toEqual({ baseCollects: 0, collects: 1 })
	})

	it('a local `function check(row) { it(...) }` runner split unchanged into two files → moved by the exact match: a moved line, no moved by name line, no base collect run', async () => {
		const root = splitPackage({
			base: { [ROWS_FILE]: ROWS_TEXT, 'src/dd-local.test.ts': localRunnerText({}) },
			now: {
				'src/dd-local.test.ts': null,
				'src/dd-local-a.test.ts': localRunnerText({ leg: 'a' }),
				'src/dd-local-b.test.ts': localRunnerText({ leg: 'b' }),
			},
		})

		const status = await tdd({ cwd: root, argv: ['status'] })

		expect({
			exact: status.output.split('\n').filter((line) => /^moved {2}/.test(line)),
			byName: movedByNameLines(status.output),
			baseCollects: baseCollects(root).length,
			collects: collectRuns(),
		}).toEqual({
			exact: [
				expect.stringMatching(/^moved {2}4 case\(s\) {2}src\/dd-local\.test\.ts → 2 file\(s\)$/),
			],
			byName: [],
			baseCollects: 0,
			collects: 1,
		})
	})
})

describe('a kept base file that loses rows to a leg', { timeout: HELPER_SCENARIO_TIMEOUT }, () => {
	it('rows moved to a leg → moved by name; a row still registered in the shrunk file and in the leg → ambiguous naming both, never moved', async () => {
		const root = splitPackage({
			base: {
				[ROWS_FILE]: ROWS_TEXT,
				[CHECK_HELPER_FILE]: CHECK_HELPER_TEXT,
				[TABLE_BASE_FILE]: TABLE_BASE_TEXT,
			},
			now: {
				[TABLE_BASE_FILE]: TABLE_BASE_TEXT.replace(
					'for (const row of ROWS)',
					"for (const row of ROWS.filter((each) => each.leg === 'a'))",
				),
				[LEG_HELPER_FILE]: LEG_HELPER_TEXT,
				[LEG_FILES[0]]: legText({ subset: [2, 3, 4, 5, 6] }),
			},
		})

		const status = await tdd({ cwd: root, argv: ['status'] })
		const statuses = await statusesOf(root)

		expect({
			moved: movedByNameLines(status.output),
			ambiguous: status.output.split('\n').filter((line) => /ambiguous/.test(line)),
			leg: statuses.filter((each) => each.file === LEG_FILES[0]).map((each) => each.status),
		}).toEqual({
			moved: [
				expect.stringMatching(
					/^moved by name {2}4 case\(s\) {2}src\/dd-table\.test\.ts → 1 file\(s\)/,
				),
			],
			ambiguous: [
				expect.stringMatching(/ambiguous.*src\/dd-leg-a\.test\.ts.*src\/dd-table\.test\.ts/),
			],
			leg: ['missing receipt', 'unchanged', 'unchanged', 'unchanged', 'unchanged'],
		})
	})
})

describe(
	'the gate and the card of a split through a helper',
	{ timeout: HANDOVER_CASE_TIMEOUT },
	() => {
		it('the three legs proven by a red run → the gate details and the card tdd section carry the grouped moved by name line', async () => {
			const root = legSplit({
				subsets: THREE_LEGS,
				dialecte: { gate: { fast: [{ name: 'check', run: 'true' }] } },
			})
			await tdd({ cwd: root, argv: ['red'] })
			const check = await checkTddReceipts({ root, packageJson: readPackageJson(root) })
			await runGate({ cwd: root, argv: ['--declare', 'src/', '--declare', 'test/'] })
			const out = temporaryFolder('dialecte-handover-')
			const lotsPath = join(out, 'lots.json')
			const lotsFile: LotsFile = {
				repository: root,
				branch: 'main',
				head: git({ root, args: ['rev-parse', 'HEAD'] }).trim(),
				lots: [
					{ paths: ['src/', 'test/'], message: 'refactor(dd): split the table suite into legs' },
				],
			}
			writeFileSync(lotsPath, JSON.stringify(lotsFile))

			const card = runHandover({
				probe: noRepositoryCli,
				argv: [lotsPath],
				cliPath: '/opt/dialecte/dist/cli.js',
				now: new Date(2026, 10, 9, 12, 0, 0),
				columns: 200,
			})

			const grouped = /moved by name {2}6 case\(s\) {2}src\/dd-table\.test\.ts → 3 file\(s\)/
			expect({
				gate: check.status,
				details: (check.details ?? []).filter((line) => grouped.test(line)).length,
				card: grouped.test(card.output),
			}).toEqual({ gate: 'passed', details: 1, card: true })
		})
	},
)
