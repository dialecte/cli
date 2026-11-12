/** Case ids that more than one case holds: tdd refuses them, the gate fails on them and the card blocks. */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { splitPackage } from '../../test/moved-cases-fixture.ts'
import { noRepositoryCli } from '../../test/repository-cli-probe.ts'
import {
	ADD_FILE,
	ADD_IMPLEMENTED,
	CLEAN_FILE,
	CLEAN_TEXT,
	EACH_ARRAYS_FILE,
	EACH_ARRAYS_TEXT,
	EACH_CUT_FILE,
	EACH_CUT_TEXT,
	GATE_DUPLICATE_LINES,
	GATE_DUPLICATE_REASON,
	GATE_FILE,
	GATE_TEXT,
	GREEN_UNTARGETED_FILE,
	GREEN_UNTARGETED_LINES,
	GREEN_UNTARGETED_TEXT,
	MOVED_CASE_NAME,
	MOVED_SOURCE_FILE,
	MOVED_SOURCE_TEXT,
	MOVED_TARGET_FILE,
	MOVED_TARGET_TEXT,
	OTHER_FILE_PAIR_FILE,
	PAIR_AND_TWO_FILE,
	PAIR_AND_TWO_TEXT,
	PLAIN_DUPLICATE_FILE,
	PLAIN_DUPLICATE_LINES,
	PLAIN_DUPLICATE_TEXT,
	REASON_START,
	RENAME_HINT,
	SKIPPED_MEMBER_FILE,
	SKIPPED_MEMBER_TEXT,
	SPELLED_OUT_FILE,
	SPELLED_OUT_TEXT,
	TABLE_HINT_FRAGMENT,
	TRUE_GATE_PACKAGE_KEY,
	UNTARGETED_PAIR_FILE,
	UNTARGETED_PAIR_TEXT,
} from '../../test/rule-gaps-duplicate-ids.constants.ts'
import {
	addPairText,
	caseLinesOf,
	escapedForRegExp,
	duplicatePackage,
	frozenFilesOf,
	labelAndIdOf,
	movedLinesOf,
	receiptLinesOf,
} from '../../test/rule-gaps-duplicate-ids.ts'
import { git, temporaryFolder, writeFiles } from '../../test/scratch-repository.ts'
import { HANDOVER_CASE_TIMEOUT, HELPER_SCENARIO_TIMEOUT } from '../../test/test-timing.constants.ts'
import { readGateRecords } from '../lib/gate-records/gate-records.ts'
import { readPackageJson } from '../lib/package-json.ts'
import { checkTddReceipts } from '../lib/tdd/check-tdd-receipts.ts'
import { runGate } from './gate.ts'
import { runHandover } from './handover.ts'
import { runTdd } from './tdd.ts'

import { describe, expect, it } from 'vitest'

import type { LotsFile } from '../lib/handover/handover.types.ts'

const NOW = new Date('2026-11-11T12:00:00.000Z')

/** `tdd` in the package, its receipts dated NOW. */
function tdd(params: { cwd: string; argv: string[] }) {
	return runTdd({ cwd: params.cwd, argv: params.argv, now: () => NOW })
}

/** The cut title vitest gives a `$name` of forty `a` and one more character: quoted, cut, an ellipsis. */
const CUT_TITLE = /'a+…'/

describe('duplicate case ids through the real vitest', { timeout: HELPER_SCENARIO_TIMEOUT }, () => {
	it('D1: an it.each whose name-field titles are cut to one id → both refused with the shared id, one line each, the table hint, exit 1, no red receipt', async () => {
		const root = duplicatePackage({ tests: { [EACH_CUT_FILE]: EACH_CUT_TEXT } })

		const red = await tdd({ cwd: root, argv: ['red'] })

		const lines = caseLinesOf(red.output)
		expect({
			exitCode: red.exitCode,
			count: lines.length,
			everyLine: lines.every((line) =>
				new RegExp(
					`^refused {2}${escapedForRegExp(EACH_CUT_FILE)}::${CUT_TITLE.source} {2}${escapedForRegExp(REASON_START)}(\\d+), \\1\\): ${TABLE_HINT_FRAGMENT}`,
				).test(line),
			),
			sharedId: new Set(lines.map((line) => line.split('  ')[1])).size,
			receipts: receiptLinesOf(root).map((line) => line.split(' ')[0]),
			frozen: frozenFilesOf(root),
		}).toEqual({
			exitCode: 1,
			count: 2,
			everyLine: true,
			sharedId: 1,
			receipts: ['refused', 'refused'],
			frozen: [],
		})
	})

	it('D2: the same two titles spelled out through a plain loop → both proven red, exit 0', async () => {
		const root = duplicatePackage({ tests: { [SPELLED_OUT_FILE]: SPELLED_OUT_TEXT } })

		const red = await tdd({ cwd: root, argv: ['red', '--json'] })

		const { lines, duplicates } = JSON.parse(red.output) as { lines: string[]; duplicates: unknown }
		expect({
			exitCode: red.exitCode,
			kinds: lines.map((line) => labelAndIdOf(line)[0]),
			duplicates,
		}).toEqual({
			exitCode: 0,
			kinds: ['red', 'red'],
			duplicates: [],
		})
	})

	it('D3 end to end: two plain it calls of one title → both refused, their two lines, the rename hint', async () => {
		const root = duplicatePackage({ tests: { [PLAIN_DUPLICATE_FILE]: PLAIN_DUPLICATE_TEXT } })

		const red = await tdd({ cwd: root, argv: ['red'] })

		expect({ exitCode: red.exitCode, lines: caseLinesOf(red.output) }).toEqual({
			exitCode: 1,
			lines: [
				`refused  ${PLAIN_DUPLICATE_FILE}::same  2 cases share this id (lines ${PLAIN_DUPLICATE_LINES.join(', ')}): ${RENAME_HINT}`,
				`refused  ${PLAIN_DUPLICATE_FILE}::same  2 cases share this id (lines ${PLAIN_DUPLICATE_LINES.join(', ')}): ${RENAME_HINT}`,
			],
		})
	})

	it('D7 and D8: a case renamed to the title of another after both were proven red → both refused at green, neither receipt counts; renamed apart and implemented → each judged on its own receipt, both green', async () => {
		const root = duplicatePackage({
			tests: { 'src/pair.test.ts': addPairText({ secondTitle: 'b' }) },
		})
		const red = await tdd({ cwd: root, argv: ['red'] })

		writeFiles({ root, files: { 'src/pair.test.ts': addPairText({ secondTitle: 'a' }) } })
		writeFileSync(join(root, ADD_FILE), ADD_IMPLEMENTED)
		const renamed = await tdd({ cwd: root, argv: ['green'] })
		writeFiles({ root, files: { 'src/pair.test.ts': addPairText({ secondTitle: 'b' }) } })
		const apart = await tdd({ cwd: root, argv: ['green'] })

		expect({
			red: caseLinesOf(red.output).map(labelAndIdOf),
			renamedExit: renamed.exitCode,
			renamed: caseLinesOf(renamed.output).map(labelAndIdOf),
			renamedReasons: caseLinesOf(renamed.output).map((line) => line.includes(REASON_START)),
			apartExit: apart.exitCode,
			apart: caseLinesOf(apart.output).map(labelAndIdOf),
		}).toEqual({
			red: [
				['red', 'src/pair.test.ts::a'],
				['red', 'src/pair.test.ts::b'],
			],
			renamedExit: 1,
			renamed: [
				['refused', 'src/pair.test.ts::a'],
				['refused', 'src/pair.test.ts::a'],
			],
			renamedReasons: [true, true],
			apartExit: 0,
			apart: [
				['green', 'src/pair.test.ts::a'],
				['green', 'src/pair.test.ts::b'],
			],
		})
	})

	it('D9: one member of a pair is it.skip → the judged member refused, the skipped one a duplicate line, one receipt only, exit 1', async () => {
		const root = duplicatePackage({ tests: { [SKIPPED_MEMBER_FILE]: SKIPPED_MEMBER_TEXT } })

		const red = await tdd({ cwd: root, argv: ['red'] })

		expect({
			exitCode: red.exitCode,
			lines: caseLinesOf(red.output),
			receipts: receiptLinesOf(root),
		}).toEqual({
			exitCode: 1,
			lines: [
				expect.stringMatching(
					new RegExp(
						`^refused {2}${escapedForRegExp(SKIPPED_MEMBER_FILE)}::same {2}2 cases share this id`,
					),
				),
				expect.stringMatching(
					new RegExp(
						`^duplicate {2}${escapedForRegExp(SKIPPED_MEMBER_FILE)}::same {2}2 cases share this id`,
					),
				),
			],
			receipts: ['refused same'],
		})
	})

	it('D9b: tdd red names one case of a file holding an untargeted duplicate pair → that case red, the pair duplicate lines, exit 1, only its receipt', async () => {
		const root = duplicatePackage({ tests: { [UNTARGETED_PAIR_FILE]: UNTARGETED_PAIR_TEXT } })

		const red = await tdd({ cwd: root, argv: ['red', `${UNTARGETED_PAIR_FILE}::caseA`] })

		expect({
			exitCode: red.exitCode,
			lines: caseLinesOf(red.output).map(labelAndIdOf),
			receipts: receiptLinesOf(root),
		}).toEqual({
			exitCode: 1,
			lines: [
				['red', `${UNTARGETED_PAIR_FILE}::caseA`],
				['duplicate', `${UNTARGETED_PAIR_FILE}::dup`],
				['duplicate', `${UNTARGETED_PAIR_FILE}::dup`],
			],
			receipts: ['red caseA'],
		})
	})

	it('Q18 at green: tdd green names one case beside an untargeted duplicate pair → that case green, the pair duplicate lines, exit 1, no new receipt for the pair, the group in the --json duplicates', async () => {
		const root = duplicatePackage({ tests: { [GREEN_UNTARGETED_FILE]: GREEN_UNTARGETED_TEXT } })
		await tdd({ cwd: root, argv: ['red'] })
		const receiptsBefore = receiptLinesOf(root)
		writeFileSync(join(root, ADD_FILE), ADD_IMPLEMENTED)

		const green = await tdd({
			cwd: root,
			argv: ['green', `${GREEN_UNTARGETED_FILE}::three`, '--json'],
		})

		const { lines, duplicates } = JSON.parse(green.output) as {
			lines: string[]
			duplicates: unknown
		}
		expect({
			exitCode: green.exitCode,
			lines: lines.map(labelAndIdOf),
			newReceipts: receiptLinesOf(root).slice(receiptsBefore.length),
			duplicates,
		}).toEqual({
			exitCode: 1,
			lines: [
				['green', `${GREEN_UNTARGETED_FILE}::three`],
				['duplicate', `${GREEN_UNTARGETED_FILE}::dup`],
				['duplicate', `${GREEN_UNTARGETED_FILE}::dup`],
			],
			newReceipts: ['green three'],
			duplicates: [
				{ file: GREEN_UNTARGETED_FILE, project: '', name: 'dup', lines: GREEN_UNTARGETED_LINES },
			],
		})
	})

	it('D10: a duplicate pair in a file the run does not target → not reported, the targeted file proven red, exit 0', async () => {
		const root = duplicatePackage({
			tests: { [CLEAN_FILE]: CLEAN_TEXT, [OTHER_FILE_PAIR_FILE]: PLAIN_DUPLICATE_TEXT },
		})

		const red = await tdd({ cwd: root, argv: ['red', CLEAN_FILE, '--json'] })

		const { lines, duplicates } = JSON.parse(red.output) as { lines: string[]; duplicates: unknown }
		expect({
			exitCode: red.exitCode,
			lines: lines.map(labelAndIdOf),
			duplicates,
		}).toEqual({
			exitCode: 0,
			lines: [['red', `${CLEAN_FILE}::alone`]],
			duplicates: [],
		})
	})

	it('D11: a file holding a duplicate pair and two other red cases → the two proven red and the file frozen, the pair refused, exit 1', async () => {
		const root = duplicatePackage({ tests: { [PAIR_AND_TWO_FILE]: PAIR_AND_TWO_TEXT } })

		const red = await tdd({ cwd: root, argv: ['red'] })

		expect({
			exitCode: red.exitCode,
			kinds: caseLinesOf(red.output)
				.map((line) => line.split(' ')[0])
				.sort(),
			receipts: receiptLinesOf(root).sort(),
			frozen: frozenFilesOf(root),
		}).toEqual({
			exitCode: 1,
			kinds: ['red', 'red', 'refused', 'refused'],
			receipts: ['red red one', 'red red two', 'refused dup', 'refused dup'],
			frozen: [PAIR_AND_TWO_FILE],
		})
	})

	it('D13: --json lists each group with its file, project, name and lines; a clean run lists none', async () => {
		const duplicated = duplicatePackage({ tests: { [PLAIN_DUPLICATE_FILE]: PLAIN_DUPLICATE_TEXT } })
		const clean = duplicatePackage({ tests: { [CLEAN_FILE]: CLEAN_TEXT } })

		const withGroup = await tdd({ cwd: duplicated, argv: ['red', '--json'] })
		const withoutGroup = await tdd({ cwd: clean, argv: ['red', '--json'] })

		expect({
			groupExit: withGroup.exitCode,
			group: JSON.parse(withGroup.output).duplicates,
			cleanExit: withoutGroup.exitCode,
			clean: JSON.parse(withoutGroup.output).duplicates,
		}).toEqual({
			groupExit: 1,
			group: [
				{ file: PLAIN_DUPLICATE_FILE, project: '', name: 'same', lines: PLAIN_DUPLICATE_LINES },
			],
			cleanExit: 0,
			clean: [],
		})
	})

	it('D15: a describe.each whose array-field titles print alike → refused with the table hint, one line per case', async () => {
		const root = duplicatePackage({ tests: { [EACH_ARRAYS_FILE]: EACH_ARRAYS_TEXT } })

		const red = await tdd({ cwd: root, argv: ['red'] })

		const lines = caseLinesOf(red.output)
		expect({
			exitCode: red.exitCode,
			count: lines.length,
			everyLine: lines.every(
				(line) =>
					line.startsWith(`refused  ${EACH_ARRAYS_FILE}::rows `) &&
					line.includes(REASON_START) &&
					line.includes(TABLE_HINT_FRAGMENT),
			),
		}).toEqual({ exitCode: 1, count: 2, everyLine: true })
	})

	it('D16: a case moved out of a deleted file into a target holding its name twice → the group refused at red, and no moved line for the name at red or in tdd status (status is pinned too)', async () => {
		const root = splitPackage({
			base: { [MOVED_SOURCE_FILE]: MOVED_SOURCE_TEXT },
			now: { [MOVED_SOURCE_FILE]: null, [MOVED_TARGET_FILE]: MOVED_TARGET_TEXT },
		})

		const status = await tdd({ cwd: root, argv: ['status'] })
		const red = await tdd({ cwd: root, argv: ['red'] })

		expect({
			exitCode: red.exitCode,
			lines: caseLinesOf(red.output).map(labelAndIdOf),
			moved: [...movedLinesOf(status.output), ...movedLinesOf(red.output)],
		}).toEqual({
			exitCode: 1,
			lines: [
				['refused', `${MOVED_TARGET_FILE}::${MOVED_CASE_NAME}`],
				['refused', `${MOVED_TARGET_FILE}::${MOVED_CASE_NAME}`],
			],
			moved: [],
		})
	})
})

describe(
	'duplicate case ids in the gate and on the hand-over card',
	{ timeout: HANDOVER_CASE_TIMEOUT },
	() => {
		it('D14: a tree holding a duplicate pair → the gate tdd step fails with the duplicate reason, the record keeps the group, the card lists it and is BLOCKED', async () => {
			const root = duplicatePackage({
				tests: { [GATE_FILE]: GATE_TEXT },
				dialecte: TRUE_GATE_PACKAGE_KEY,
			})
			await tdd({ cwd: root, argv: ['red'] })
			writeFileSync(join(root, ADD_FILE), ADD_IMPLEMENTED)
			await tdd({ cwd: root, argv: ['green'] })

			const check = await checkTddReceipts({ root, packageJson: readPackageJson(root) })
			await runGate({ cwd: root, argv: ['--declare', 'src/'] })
			const tddStep = readGateRecords(root)
				.flatMap((record) => record.steps)
				.find((step) => step.name === 'tdd')
			const out = temporaryFolder('dialecte-handover-')
			const lotsPath = join(out, 'lots.json')
			const lotsFile: LotsFile = {
				repository: root,
				branch: 'main',
				head: git({ root, args: ['rev-parse', 'HEAD'] }).trim(),
				lots: [{ paths: ['src/'], message: 'feat(add): the add function and its cases' }],
			}
			writeFileSync(lotsPath, JSON.stringify(lotsFile))
			const card = runHandover({
				probe: noRepositoryCli,
				argv: [lotsPath],
				cliPath: '/opt/dialecte/dist/cli.js',
				now: new Date(2026, 10, 11, 12, 0, 0),
				columns: 200,
			})

			expect({
				status: check.status,
				reason: check.reason,
				recorded: tddStep?.duplicates,
				listed: card.output.includes(
					`✗ duplicate id  ${GATE_FILE}::same  lines ${GATE_DUPLICATE_LINES.join(', ')}`,
				),
				blocked: card.output.includes('BLOCKED'),
			}).toEqual({
				status: 'failed',
				reason: GATE_DUPLICATE_REASON,
				recorded: [{ file: GATE_FILE, project: '', name: 'same', lines: GATE_DUPLICATE_LINES }],
				listed: true,
				blocked: true,
			})
		})
	},
)
