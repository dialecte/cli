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
import { git, temporaryFolder, writeFiles } from '../../test/scratch-repository.ts'
import { createVitestPackage } from '../../test/scratch-vitest-package.ts'
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

describe('a test file git reports as renamed', { timeout: HELPER_SCENARIO_TIMEOUT }, () => {
	const ADD =
		'export function add(left: number, right: number): number {\n\treturn left + right\n}\n'
	const SUB_STUB =
		"export function sub(left: number, right: number): number {\n\tthrow new Error('not implemented: sub')\n}\n"
	const SUB =
		'export function sub(left: number, right: number): number {\n\treturn left - right\n}\n'
	const CASES = [
		"it('one plus two → three', () => { expect(add(1, 2)).toBe(3) })",
		"it('zero plus zero → zero', () => { expect(add(0, 0)).toBe(0) })",
		"it('two plus two → four', () => { expect(add(2, 2)).toBe(4) })",
		"it('one plus one → two', () => { expect(add(1, 1)).toBe(2) })",
		"it('three plus three → six', () => { expect(add(3, 3)).toBe(6) })",
	]
	const IMPORTS = ["import { add } from './add.ts'", "import { expect, it } from 'vitest'"]
	const BASE_TEST = [...IMPORTS, ...CASES, ''].join('\n')
	const NAMES = CASES.map((call) => call.split("'")[1])
	const RENAME = { from: 'src/add.test.ts', to: 'src/sum.test.ts', reason: 'a rename' }

	/** A package whose base holds `add` and BASE_TEST, its test file renamed with git mv to `src/sum.test.ts`. */
	function renamedPackage(): string {
		const root = createVitestPackage({
			dialecte: { gate: { fast: [{ name: 'check', run: 'true' }] } },
			files: { 'src/add.ts': ADD, 'src/add.test.ts': BASE_TEST },
		})
		git({ root, args: ['mv', 'src/add.test.ts', 'src/sum.test.ts'] })
		return root
	}

	/** Each case line of an output as `<label> <case>`. */
	function labelsOf(output: string): string[] {
		return caseLines(output).map((line) => line.split(/ {2,}/).slice(0, 2).join(' '))
	}

	/** The lines of the gate's tdd step (its evidence, or what fails it), trimmed. */
	async function gateLines(root: string): Promise<string[]> {
		const check = await checkTddReceipts({ root, packageJson: readPackageJson(root) })
		return [...(check.details ?? []), ...(check.lines ?? [])].map((line) => line.trim())
	}

	it('renamed and one case edited (git still pairs it) → red: the untouched cases unchanged, the edited one red; nothing refused', async () => {
		const root = renamedPackage()
		writeFileSync(
			join(root, 'src/sum.test.ts'),
			[
				...IMPORTS,
				"import { sub } from './sub.ts'",
				CASES[0],
				CASES[1].replace('.toBe(0) })', '.toBe(0); expect(sub(1, 1)).toBe(0) })'),
				...CASES.slice(2),
				'',
			].join('\n'),
		)
		writeFileSync(join(root, 'src/sub.ts'), SUB_STUB)

		const red = await tdd({ cwd: root, argv: ['red'] })

		expect({ exitCode: red.exitCode, labels: labelsOf(red.output) }).toEqual({
			exitCode: 0,
			labels: NAMES.map(
				(name, index) => `${index === 1 ? 'red' : 'unchanged'} src/sum.test.ts::${name}`,
			),
		})
	})

	it('renamed with an import-only edit → every case unchanged; status lists no deleted file and no move', async () => {
		const root = renamedPackage()
		writeFileSync(
			join(root, 'src/sum.test.ts'),
			[...IMPORTS, "import { join } from 'node:path'", ...CASES, ''].join('\n'),
		)

		const red = await tdd({ cwd: root, argv: ['red'] })
		const status = await tdd({ cwd: root, argv: ['status'] })

		expect({
			exitCode: red.exitCode,
			labels: labelsOf(red.output),
			other: status.output.split('\n').filter((line) => /^(deleted|moved) /.test(line)),
		}).toEqual({
			exitCode: 0,
			labels: NAMES.map((name) => `unchanged src/sum.test.ts::${name}`),
			other: [],
		})
	})

	it('renamed and one case moved out to a third file → that case paired as moved from the renamed file; nothing refused, nothing deleted', async () => {
		const root = renamedPackage()
		writeFiles({
			root,
			files: {
				'src/sum.test.ts': [...IMPORTS, ...CASES.slice(0, 4), ''].join('\n'),
				'src/six.test.ts': [...IMPORTS, CASES[4], ''].join('\n'),
			},
		})

		const red = await tdd({ cwd: root, argv: ['red'] })
		const status = await tdd({ cwd: root, argv: ['status'] })

		expect({
			exitCode: red.exitCode,
			labels: labelsOf(red.output).sort(),
			deleted: status.output.split('\n').filter((line) => line.startsWith('deleted ')),
			collectFailed: status.output.includes('nothing moved by name'),
			moved: status.output.split('\n').filter((line) => line.startsWith('moved ')),
		}).toEqual({
			exitCode: 0,
			labels: [
				`unchanged src/six.test.ts::${NAMES[4]}`,
				...NAMES.slice(0, 4).map((name) => `unchanged src/sum.test.ts::${name}`),
			].sort(),
			deleted: [],
			collectFailed: false,
			moved: [expect.stringMatching(/^moved {2}1 case\(s\) {2}src\/sum\.test\.ts → 1 file\(s\)/)],
		})
	})

	it('renamed and one case removed → reported deleted once, at the new path', async () => {
		const root = renamedPackage()
		writeFileSync(join(root, 'src/sum.test.ts'), [...IMPORTS, ...CASES.slice(0, 4), ''].join('\n'))

		const status = await tdd({ cwd: root, argv: ['status'] })

		expect(status.output.split('\n').filter((line) => line.startsWith('deleted '))).toEqual([
			`deleted  src/sum.test.ts  the test "${NAMES[4]}" of the base is gone`,
		])
	})

	it.each([
		{
			pair: 'a rename with an edit',
			edit: (root: string) =>
				writeFileSync(
					join(root, 'src/sum.test.ts'),
					[...IMPORTS, "import { join } from 'node:path'", ...CASES, ''].join('\n'),
				),
		},
		{ pair: 'a move with the bytes', edit: () => undefined },
	])(
		'a moved entry on $pair → tdd red does not refuse it; the gate says it is not needed, never unused',
		async ({ edit }) => {
			const root = renamedPackage()
			edit(root)
			writeFiles({ root, files: { '.dialecte/lot.json': JSON.stringify({ moved: [RENAME] }) } })

			const red = await tdd({ cwd: root, argv: ['red'] })
			const lines = await gateLines(root)

			expect({
				refused: red.output.includes('moved entry'),
				moved: lines.filter((line) => /^(unused )?moved entry /.test(line)),
			}).toEqual({
				refused: false,
				moved: [
					'moved entry src/add.test.ts → src/sum.test.ts: not needed, tdd pairs this move; drop it: dialecte lot moved --remove src/add.test.ts src/sum.test.ts',
				],
			})
		},
	)

	it('a moved entry on a rename a case carries its red through (red at the old path, then renamed, a case of the base edited) → used: no not-needed line', async () => {
		const root = createVitestPackage({
			dialecte: { gate: { fast: [{ name: 'check', run: 'true' }] } },
			files: { 'src/add.ts': ADD, 'src/add.test.ts': BASE_TEST },
		})
		const subCase = "it('three minus one → two', () => { expect(sub(3, 1)).toBe(2) })"
		writeFiles({
			root,
			files: {
				'src/add.test.ts': [
					...IMPORTS,
					"import { sub } from './sub.ts'",
					...CASES,
					subCase,
					'',
				].join('\n'),
				'src/sub.ts': SUB_STUB,
			},
		})
		await tdd({ cwd: root, argv: ['red'] })
		writeFileSync(join(root, 'src/sub.ts'), SUB)
		git({ root, args: ['add', '-A'] })
		git({ root, args: ['mv', 'src/add.test.ts', 'src/sum.test.ts'] })
		writeFiles({
			root,
			files: {
				'src/sum.test.ts': [
					...IMPORTS,
					"import { sub } from './sub.ts'",
					CASES[0].replace('.toBe(3) })', '.toBe(1 + 2) })'),
					...CASES.slice(1),
					subCase,
					'',
				].join('\n'),
				'.dialecte/lot.json': JSON.stringify({
					moved: [RENAME],
					revised: [{ case: `src/sum.test.ts::${NAMES[0]}`, reason: 'the sum written out' }],
				}),
			},
		})
		await tdd({ cwd: root, argv: ['red'] })
		await tdd({ cwd: root, argv: ['green'] })

		const lines = await gateLines(root)

		expect(lines.filter((line) => /^(unused )?moved entry /.test(line))).toEqual([])
	})
})
