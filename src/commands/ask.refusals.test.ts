import { join } from 'node:path'

import {
	DOCUMENT_STANDARDS,
	FIRST_ASK,
	MISTYPED_TAG,
	RUNG_ONE_QUESTION,
	SEMANTIC_QUESTION,
	STATE_ASKS_SEGMENTS,
	TAG_FILE,
} from '../../test/ask-command-workspace.constants.ts'
import {
	askedJson,
	askedWith,
	createAskCommandWorkspace,
	createDocumentsWorkspace,
	createHandoverFolder,
	createLotAskWorkspace,
	namesIn,
} from '../../test/ask-command-workspace.ts'
import { GADGET_PACKAGE, WIDGET_PACKAGE } from '../../test/installed-test-dialecte.constants.ts'
import { LOT_NAME } from '../../test/lot-stores.constants.ts'
import {
	DECLARED_FOLDER,
	DECLARED_NAME,
	SAME_KEY_FOLDER,
} from '../../test/standard-selection.constants.ts'
import { STANDARD_DISK_CASE_TIMEOUT, STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'

import { describe, expect, it } from 'vitest'

describe('ask refusals -> exit 2, a diagnostic that says what failed and the fix, nothing recorded (D20, case 14, 32l)', () => {
	it(
		'no question -> exit 2, the usage line',
		async () => {
			const workspace = createAskCommandWorkspace()

			const answer = await askedWith({ workspace, argv: [], exitCode: 2 })

			expect(answer.output).toContain('dialecte ask')
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'an option the command does not know -> exit 2 naming it',
		async () => {
			const workspace = createAskCommandWorkspace()

			const answer = await askedWith({
				workspace,
				argv: [RUNG_ONE_QUESTION, '--nonsense'],
				exitCode: 2,
			})

			expect(answer.output).toContain('--nonsense')
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'an unknown --about tag -> exit 2 with the closest names, no ask folder made',
		async () => {
			const workspace = createAskCommandWorkspace()

			const answer = await askedWith({
				workspace,
				argv: [RUNG_ONE_QUESTION, '--about', MISTYPED_TAG],
				exitCode: 2,
			})

			expect({
				namesTag: answer.output.includes(MISTYPED_TAG),
				closest: answer.output.includes('AA_1'),
				asks: namesIn(join(workspace.state, ...STATE_ASKS_SEGMENTS)),
			}).toEqual({ namesTag: true, closest: true, asks: [] })
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'14 two dialectes holding the tag, no --package -> exit 2 naming both packages',
		async () => {
			const workspace = createAskCommandWorkspace({ packages: [WIDGET_PACKAGE, GADGET_PACKAGE] })

			const answer = await askedWith({ workspace, argv: [RUNG_ONE_QUESTION], exitCode: 2 })

			expect({
				widget: answer.output.includes(WIDGET_PACKAGE),
				gadget: answer.output.includes(GADGET_PACKAGE),
				flag: answer.output.includes('--package'),
				asks: namesIn(join(workspace.state, ...STATE_ASKS_SEGMENTS)),
			}).toEqual({ widget: true, gadget: true, flag: true, asks: [] })
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'14 the same two dialectes with --package -> answered by that one',
		async () => {
			const workspace = createAskCommandWorkspace({ packages: [WIDGET_PACKAGE, GADGET_PACKAGE] })

			const json = await askedJson({
				workspace,
				argv: [RUNG_ONE_QUESTION, '--package', GADGET_PACKAGE],
				exitCode: 0,
			})

			expect(json).toMatchObject({ state: 'answered', rung: 1 })
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'32l two folders of one key for the declared standard -> exit 2 naming both folders',
		async () => {
			const workspace = createDocumentsWorkspace({
				standards: {
					[DECLARED_FOLDER]: { 'tag.md': TAG_FILE },
					[SAME_KEY_FOLDER]: { 'tag.md': TAG_FILE },
				},
			})

			const answer = await askedWith({
				workspace,
				argv: [SEMANTIC_QUESTION],
				exitCode: 2,
			})

			expect({
				first: answer.output.includes(DECLARED_FOLDER),
				second: answer.output.includes(SAME_KEY_FOLDER),
				name: answer.output.includes(DECLARED_NAME),
				asks: namesIn(join(workspace.state, ...STATE_ASKS_SEGMENTS)),
			}).toEqual({ first: true, second: true, name: true, asks: [] })
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'--no-standard while the dialecte has documents -> exit 2 naming the folder and saying outside readers run only without documents',
		async () => {
			const workspace = createDocumentsWorkspace({ standards: DOCUMENT_STANDARDS })

			const answer = await askedWith({
				workspace,
				argv: [SEMANTIC_QUESTION, '--no-standard'],
				exitCode: 2,
			})

			expect({
				folder: answer.output.includes(DECLARED_FOLDER),
				outside: answer.output.includes('outside'),
				asks: namesIn(join(workspace.state, ...STATE_ASKS_SEGMENTS)),
			}).toEqual({ folder: true, outside: true, asks: [] })
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)
})

describe('ask --effort: the lot decides (D19)', () => {
	it(
		'--effort high in a lot whose effort is medium -> exit 2 naming the lot and its effort, nothing recorded',
		async () => {
			const { workspace, lotFolder } = createLotAskWorkspace({ place: 'project' })

			const answer = await askedWith({
				workspace,
				argv: [RUNG_ONE_QUESTION, '--lot', lotFolder, '--effort', 'high'],
				exitCode: 2,
			})

			expect({
				namesLot: answer.output.includes(LOT_NAME) || answer.output.includes(lotFolder),
				namesLotEffort: answer.output.includes('medium'),
				namesAskedEffort: answer.output.includes('high'),
				asks: namesIn(join(lotFolder, 'asks')),
			}).toEqual({ namesLot: true, namesLotEffort: true, namesAskedEffort: true, asks: [] })
		},
		STORE_CASE_TIMEOUT,
	)

	it(
		'--effort medium in that lot -> accepted, the object says medium',
		async () => {
			const { workspace, lotFolder } = createLotAskWorkspace({ place: 'project' })

			const json = await askedJson({
				workspace,
				argv: [RUNG_ONE_QUESTION, '--lot', lotFolder, '--effort', 'medium'],
				exitCode: 0,
			})

			expect(json).toMatchObject({ ask: FIRST_ASK, effort: { level: 'medium' } })
		},
		STORE_CASE_TIMEOUT,
	)

	it(
		'no --effort in a lot -> the lot effort (medium)',
		async () => {
			const { workspace, lotFolder } = createLotAskWorkspace({ place: 'project' })

			const json = await askedJson({
				workspace,
				argv: [RUNG_ONE_QUESTION, '--lot', lotFolder],
				exitCode: 0,
			})

			expect(json.effort).toEqual({ level: 'medium' })
		},
		STORE_CASE_TIMEOUT,
	)

	const outsideLot: Record<string, { argv: string[]; level: string }> = {
		'no lot, no --effort': { argv: [], level: 'medium' },
		'no lot, --effort high': { argv: ['--effort', 'high'], level: 'high' },
		'no lot, --effort low': { argv: ['--effort', 'low'], level: 'low' },
	}

	for (const [name, row] of Object.entries(outsideLot))
		it(
			`${name} -> effort ${row.level}`,
			async () => {
				const workspace = createAskCommandWorkspace()

				const json = await askedJson({
					workspace,
					argv: [RUNG_ONE_QUESTION, ...row.argv],
					exitCode: 0,
				})

				expect(json.effort).toEqual({ level: row.level })
			},
			STANDARD_DISK_CASE_TIMEOUT,
		)

	it(
		'a hand-over folder with no effort of its own and --effort high -> accepted, high',
		async () => {
			const workspace = createAskCommandWorkspace()
			const handover = createHandoverFolder({ workspace })

			const json = await askedJson({
				workspace,
				argv: [RUNG_ONE_QUESTION, '--lot', handover, '--effort', 'high'],
				exitCode: 0,
			})

			expect(json.effort).toEqual({ level: 'high' })
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'--effort with a word that is no effort -> exit 2 naming the levels',
		async () => {
			const workspace = createAskCommandWorkspace()

			const answer = await askedWith({
				workspace,
				argv: [RUNG_ONE_QUESTION, '--effort', 'extreme'],
				exitCode: 2,
			})

			expect({
				low: answer.output.includes('low'),
				medium: answer.output.includes('medium'),
				high: answer.output.includes('high'),
			}).toEqual({ low: true, medium: true, high: true })
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)
})
