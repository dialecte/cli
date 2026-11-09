/** Cases moved from a test file into others: the proofs of the base follow them, with no declaration. */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import {
	OTHER_HOOK_LINE,
	ROWS_FILE,
	ROWS_TEXT,
	SPLIT_SOURCE_FILE,
	TWO_PROJECTS_CONFIG,
} from '../../test/moved-cases-fixture.constants.ts'
import {
	baseRunnerText,
	hookedText,
	runnerText,
	splitPackage,
	suiteCaseName,
	suiteText,
} from '../../test/moved-cases-fixture.ts'
import { noRepositoryCli } from '../../test/repository-cli-probe.ts'
import { git, temporaryFolder } from '../../test/scratch-repository.ts'
import { HANDOVER_CASE_TIMEOUT, HELPER_SCENARIO_TIMEOUT } from '../../test/test-timing.constants.ts'
import { readPackageJson } from '../lib/package-json.ts'
import { checkTddReceipts } from '../lib/tdd/check-tdd-receipts.ts'
import { runGate } from './gate.ts'
import { runHandover } from './handover.ts'
import { runTdd } from './tdd.ts'

import { describe, expect, it } from 'vitest'

import type { LotsFile } from '../lib/handover/handover.types.ts'

const NOW = new Date('2026-11-09T12:00:00.000Z')

/** `tdd` in the package, its receipts dated NOW. */
function tdd(params: { cwd: string; argv: string[] }) {
	return runTdd({ cwd: params.cwd, argv: params.argv, now: () => NOW })
}

/** The lines of an output that report a case. */
function caseLines(output: string): string[] {
	return output
		.split('\n')
		.filter((line) => /^(red|refused|green|unchanged|kept|accepted|revised) /.test(line))
}

/** The grouped `moved` lines of an output (`moved by name` ones apart). */
function movedLines(output: string): string[] {
	return output.split('\n').filter((line) => /^moved {2}/.test(line))
}

/** Each case's status and project, in the order `tdd status --json` lists them. */
async function statusesOf(
	root: string,
): Promise<Array<{ file: string; project: string; status: string }>> {
	const status = await tdd({ cwd: root, argv: ['status', '--json'] })
	const { cases } = JSON.parse(status.output) as {
		cases: Array<{ file: string; project: string; status: string }>
	}
	return cases.map(({ file, project, status: caseStatus }) => ({
		file,
		project,
		status: caseStatus,
	}))
}

/** The ledger of the package's worktree as written; empty before any run wrote it. */
function ledgerText(root: string): string {
	const path = join(root, '.git', 'dialecte-tdd.json')
	return existsSync(path) ? readFileSync(path, 'utf8') : ''
}

const GROUPS = ['DD_1', 'DD_2', 'DD_3']
const TARGETS = ['src/dd-1.test.ts', 'src/dd-2.test.ts', 'src/dd-3.test.ts']

/** The source of three describes deleted, one new file per describe. */
function threeWaySplit(params: {
	edit?: Record<string, (text: string) => string>
	dialecte?: Record<string, unknown>
	base?: Record<string, string>
	now?: Record<string, string | null>
}): string {
	return splitPackage({
		base: { [SPLIT_SOURCE_FILE]: suiteText({ groups: GROUPS }), ...params.base },
		now: {
			[SPLIT_SOURCE_FILE]: null,
			...Object.fromEntries(
				GROUPS.map((group, index) => [
					TARGETS[index],
					suiteText({ groups: [group], edit: params.edit }),
				]),
			),
			...params.now,
		},
		dialecte: params.dialecte,
	})
}

describe('cases moved out of a deleted test file', { timeout: HELPER_SCENARIO_TIMEOUT }, () => {
	it('a file of three describes deleted, its cases split unchanged into three new files → status: every case unchanged and one moved line; a red run records them unchanged, not refused; the gate passes and lists the same line, not a deleted file', async () => {
		const root = threeWaySplit({})
		const ledgerBefore = ledgerText(root)

		const status = await tdd({ cwd: root, argv: ['status'] })
		const statuses = await statusesOf(root)
		const ledgerAfterStatus = ledgerText(root)
		const red = await tdd({ cwd: root, argv: ['red'] })
		const check = await checkTddReceipts({ root, packageJson: readPackageJson(root) })

		expect({
			readRuleWritesNothing: ledgerAfterStatus === ledgerBefore,
			statuses: statuses.map((each) => each.status),
			moved: movedLines(status.output),
			redExitCode: red.exitCode,
			red: caseLines(red.output),
			gate: check.status,
		}).toEqual({
			readRuleWritesNothing: true,
			statuses: ['unchanged', 'unchanged', 'unchanged'],
			moved: [expect.stringMatching(/^moved {2}3 case\(s\) {2}src\/dd\.test\.ts → 3 file\(s\)$/)],
			redExitCode: 0,
			red: GROUPS.map((group, index) => `unchanged  ${TARGETS[index]}::${suiteCaseName(group)}`),
			gate: 'passed',
		})
		expect(movedLines((check.details ?? []).join('\n'))).toEqual([
			expect.stringMatching(/^moved {2}3 case\(s\) {2}src\/dd\.test\.ts → 3 file\(s\)/),
		])
		expect((check.details ?? []).join('\n')).not.toContain('the test file of the base is deleted')
	})

	it("the same split with one case's body edited → that case is not moved (a new passing case, refused at red as today); the other two are moved", async () => {
		const root = threeWaySplit({
			edit: { DD_2: (text) => text.replace("toBe('DD_2')", "toBe('DD_2'.toString())") },
		})

		const status = await tdd({ cwd: root, argv: ['status'] })
		const statuses = await statusesOf(root)
		const red = await tdd({ cwd: root, argv: ['red'] })

		expect({
			moved: movedLines(status.output),
			statuses: statuses.map((each) => each.status),
			red: caseLines(red.output),
		}).toEqual({
			moved: [expect.stringMatching(/^moved {2}2 case\(s\) {2}src\/dd\.test\.ts → 2 file\(s\)$/)],
			statuses: ['unchanged', 'missing receipt', 'unchanged'],
			red: [
				`unchanged  ${TARGETS[0]}::${suiteCaseName('DD_1')}`,
				expect.stringMatching(/^refused {2}src\/dd-2\.test\.ts::.*proves nothing yet/),
				`unchanged  ${TARGETS[2]}::${suiteCaseName('DD_3')}`,
			],
		})
	})

	it('the same case and call in two new files → neither is moved, the status names both files as ambiguous; the case of a third file is moved', async () => {
		const root = splitPackage({
			base: { [SPLIT_SOURCE_FILE]: suiteText({ groups: ['DD_1', 'DD_2'] }) },
			now: {
				[SPLIT_SOURCE_FILE]: null,
				'src/dd-a.test.ts': suiteText({ groups: ['DD_1'] }),
				'src/dd-b.test.ts': suiteText({ groups: ['DD_1'] }),
				'src/dd-c.test.ts': suiteText({ groups: ['DD_2'] }),
			},
		})

		const status = await tdd({ cwd: root, argv: ['status'] })
		const statuses = await statusesOf(root)

		expect({
			statuses: statuses.map((each) => [each.file, each.status]),
			ambiguous: status.output.split('\n').filter((line) => /ambiguous/.test(line)),
			moved: movedLines(status.output),
		}).toEqual({
			statuses: [
				['src/dd-a.test.ts', 'missing receipt'],
				['src/dd-b.test.ts', 'missing receipt'],
				['src/dd-c.test.ts', 'unchanged'],
			],
			ambiguous: [expect.stringMatching(/ambiguous.*src\/dd-a\.test\.ts.*src\/dd-b\.test\.ts/)],
			moved: [expect.stringMatching(/^moved {2}1 case\(s\) {2}src\/dd\.test\.ts → 1 file\(s\)$/)],
		})
	})

	it("a source kept but changed, one case cut out of it into a new file unchanged → that case is moved (one case on the line); the source's own case is not counted", async () => {
		const root = splitPackage({
			base: { [SPLIT_SOURCE_FILE]: suiteText({ groups: ['DD_1', 'DD_2'] }) },
			now: {
				[SPLIT_SOURCE_FILE]: suiteText({ groups: ['DD_1'] }),
				'src/dd-2.test.ts': suiteText({ groups: ['DD_2'] }),
			},
		})

		const status = await tdd({ cwd: root, argv: ['status'] })
		const statuses = await statusesOf(root)

		expect({
			moved: movedLines(status.output),
			cut: statuses.filter((each) => each.file === 'src/dd-2.test.ts').map((each) => each.status),
		}).toEqual({
			moved: [expect.stringMatching(/^moved {2}1 case\(s\) {2}src\/dd\.test\.ts → 1 file\(s\)$/)],
			cut: ['unchanged'],
		})
	})

	it('a file of three test calls deleted, only one of them moved unchanged into a new file → the moved line for that case and the deleted line for the old file: a partial move keeps the deleted finding', async () => {
		const root = splitPackage({
			base: { [SPLIT_SOURCE_FILE]: suiteText({ groups: GROUPS }) },
			now: { [SPLIT_SOURCE_FILE]: null, 'src/dd-1.test.ts': suiteText({ groups: ['DD_1'] }) },
		})

		const status = await tdd({ cwd: root, argv: ['status'] })

		expect({
			moved: movedLines(status.output),
			deleted: status.output.split('\n').filter((line) => /^deleted {2}/.test(line)),
		}).toEqual({
			moved: [expect.stringMatching(/^moved {2}1 case\(s\) {2}src\/dd\.test\.ts → 1 file\(s\)$/)],
			deleted: ['deleted  src/dd.test.ts  the test file of the base is deleted'],
		})
	})

	it('two vitest projects running the split files → each project case is moved on its own: six cases unchanged, labelled with their project', async () => {
		const root = threeWaySplit({ base: { 'vitest.config.ts': TWO_PROJECTS_CONFIG } })

		const status = await tdd({ cwd: root, argv: ['status'] })
		const statuses = await statusesOf(root)

		expect({
			statuses: statuses.map((each) => `${each.project}:${each.status}`).sort(),
			moved: movedLines(status.output),
			labelled: status.output.split('\n').filter((line) => /\[(one|two)\]$/.test(line)).length,
		}).toEqual({
			statuses: [
				'one:unchanged',
				'one:unchanged',
				'one:unchanged',
				'two:unchanged',
				'two:unchanged',
				'two:unchanged',
			],
			moved: [expect.stringMatching(/^moved {2}6 case\(s\) {2}src\/dd\.test\.ts → 3 file\(s\)$/)],
			labelled: 6,
		})
	})

	it('a table runner file over an untouched data file, split into two runner files → every row of them is moved', async () => {
		const root = splitPackage({
			base: { [ROWS_FILE]: ROWS_TEXT, 'src/dd-runner.test.ts': baseRunnerText() },
			now: {
				'src/dd-runner.test.ts': null,
				'src/dd-runner-a.test.ts': runnerText({ leg: 'a' }),
				'src/dd-runner-b.test.ts': runnerText({ leg: 'b' }),
			},
		})

		const status = await tdd({ cwd: root, argv: ['status'] })
		const statuses = await statusesOf(root)

		expect({
			statuses: statuses.map((each) => each.status),
			moved: movedLines(status.output),
		}).toEqual({
			statuses: ['unchanged', 'unchanged', 'unchanged', 'unchanged'],
			moved: [
				expect.stringMatching(/^moved {2}4 case\(s\) {2}src\/dd-runner\.test\.ts → 2 file\(s\)$/),
			],
		})
	})

	it('the same call moved under a renamed describe (DD_1 → DD_9) → not moved (missing receipt) while the unchanged DD_2 of the same source is', async () => {
		const root = splitPackage({
			base: { [SPLIT_SOURCE_FILE]: suiteText({ groups: ['DD_1', 'DD_2'] }) },
			now: {
				[SPLIT_SOURCE_FILE]: null,
				'src/dd-9.test.ts': suiteText({ groups: ['DD_1'] }).replace(
					"describe('DD_1'",
					"describe('DD_9'",
				),
				'src/dd-2.test.ts': suiteText({ groups: ['DD_2'] }),
			},
		})

		const status = await tdd({ cwd: root, argv: ['status'] })
		const statuses = await statusesOf(root)

		expect({
			moved: movedLines(status.output),
			statuses: statuses.map((each) => [each.file, each.status]),
		}).toEqual({
			moved: [expect.stringMatching(/^moved {2}1 case\(s\) {2}src\/dd\.test\.ts → 1 file\(s\)$/)],
			statuses: [
				['src/dd-2.test.ts', 'unchanged'],
				['src/dd-9.test.ts', 'missing receipt'],
			],
		})
	})

	it('a call copied into a new file while the changed source still holds it under the same path → the copy is not moved, the case cut out is', async () => {
		const root = splitPackage({
			base: { [SPLIT_SOURCE_FILE]: suiteText({ groups: ['DD_1', 'DD_2'] }) },
			now: {
				[SPLIT_SOURCE_FILE]: suiteText({ groups: ['DD_1'] }),
				'src/dd-copy.test.ts': suiteText({ groups: ['DD_1'] }),
				'src/dd-2.test.ts': suiteText({ groups: ['DD_2'] }),
			},
		})

		const status = await tdd({ cwd: root, argv: ['status'] })
		const statuses = await statusesOf(root)

		expect({
			moved: movedLines(status.output),
			files: statuses
				.filter((each) => each.file !== SPLIT_SOURCE_FILE)
				.map((each) => [each.file, each.status]),
		}).toEqual({
			moved: [expect.stringMatching(/^moved {2}1 case\(s\) {2}src\/dd\.test\.ts → 1 file\(s\)$/)],
			files: [
				['src/dd-2.test.ts', 'unchanged'],
				['src/dd-copy.test.ts', 'missing receipt'],
			],
		})
	})

	const HOOKED_NAMES = ['DD_1 keeps attribute a', 'DD_2 keeps attribute b']

	/** A source of top-level cases around a hook, split into two files; `second` is the second hook line. */
	function hookedSplit(params: { second?: string }): string {
		return splitPackage({
			base: { [SPLIT_SOURCE_FILE]: hookedText({ names: HOOKED_NAMES }) },
			now: {
				[SPLIT_SOURCE_FILE]: null,
				'src/dd-1.test.ts': hookedText({ names: [HOOKED_NAMES[0]] }),
				'src/dd-2.test.ts': hookedText({ names: [HOOKED_NAMES[1]], hook: params.second }),
			},
		})
	}

	it('top-level cases, their imports and a beforeEach kept in each of the two files → moved, the line carries no flag', async () => {
		const root = hookedSplit({})

		const status = await tdd({ cwd: root, argv: ['status'] })

		expect(movedLines(status.output)).toEqual([
			expect.stringMatching(/^moved {2}2 case\(s\) {2}src\/dd\.test\.ts → 2 file\(s\)$/),
		])
	})

	it('the same split, one target beforeEach with other tokens → the line ends with `· test code changed around them`, the cases still read unchanged', async () => {
		const root = hookedSplit({ second: OTHER_HOOK_LINE })

		const status = await tdd({ cwd: root, argv: ['status'] })
		const statuses = await statusesOf(root)

		expect({
			moved: movedLines(status.output),
			statuses: statuses.map((each) => each.status),
		}).toEqual({
			moved: [
				expect.stringMatching(
					/^moved {2}2 case\(s\) {2}src\/dd\.test\.ts → 2 file\(s\) · test code changed around them$/,
				),
			],
			statuses: ['unchanged', 'unchanged'],
		})
	})
})

describe('the hand-over card of a split test file', { timeout: HANDOVER_CASE_TIMEOUT }, () => {
	it('the three-way split proven by a red run and the gate → the card tdd section shows the grouped moved line', async () => {
		const root = threeWaySplit({ dialecte: { gate: { fast: [{ name: 'check', run: 'true' }] } } })
		await tdd({ cwd: root, argv: ['red'] })
		await runGate({ cwd: root, argv: ['--declare', 'src/'] })
		const out = temporaryFolder('dialecte-handover-')
		const lotsPath = join(out, 'lots.json')
		const lotsFile: LotsFile = {
			repository: root,
			branch: 'main',
			head: git({ root, args: ['rev-parse', 'HEAD'] }).trim(),
			lots: [{ paths: ['src/'], message: 'refactor(dd): split the test file by describe' }],
		}
		writeFileSync(lotsPath, JSON.stringify(lotsFile))

		const card = runHandover({
			probe: noRepositoryCli,
			argv: [lotsPath],
			cliPath: '/opt/dialecte/dist/cli.js',
			now: new Date(2026, 10, 9, 12, 0, 0),
			columns: 200,
		})

		expect(card.output).toMatch(/moved {2}3 case\(s\) {2}src\/dd\.test\.ts → 3 file\(s\)/)
	})
})
