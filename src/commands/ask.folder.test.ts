import { existsSync } from 'node:fs'
import { join } from 'node:path'

import {
	FIRST_ASK,
	RUNG_ONE_QUESTION,
	SECOND_ASK,
	STATE_ASKS_SEGMENTS,
	WORK_TREE_SUBFOLDER,
} from '../../test/ask-command-workspace.constants.ts'
import {
	askedJson,
	askedWith,
	askRecordPath,
	createAskCommandWorkspace,
	createHandoverFolder,
	createLotAskWorkspace,
	eventsPathIn,
	namesIn,
	readEventsFile,
	readJsonFile,
} from '../../test/ask-command-workspace.ts'
import { LOT_NAME } from '../../test/lot-stores.constants.ts'
import { STORE_CASE_TIMEOUT, STANDARD_DISK_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { runAsk } from './ask.ts'

import { describe, expect, it } from 'vitest'

import type { AskJson } from '../../test/ask-command-workspace.types.ts'

describe('ask: the ask is a folder (D16, case 1)', () => {
	it(
		'outside every lot -> <state>/dialecte/asks/A-0001/ask.json holds the --json object, the events go to the state folder with lot null',
		async () => {
			const workspace = createAskCommandWorkspace()
			const asks = join(workspace.state, ...STATE_ASKS_SEGMENTS)

			const json = await askedJson({ workspace, argv: [RUNG_ONE_QUESTION], exitCode: 0 })

			expect({
				ask: json.ask,
				record: readJsonFile(askRecordPath({ asksFolder: asks, ask: FIRST_ASK })),
				lots: [...new Set(readEventsFile(eventsPathIn(asks)).map((event) => event.lot))],
			}).toEqual({ ask: FIRST_ASK, record: json, lots: [null] })
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'a second ask -> A-0002 beside A-0001, both folders kept',
		async () => {
			const workspace = createAskCommandWorkspace()
			const asks = join(workspace.state, ...STATE_ASKS_SEGMENTS)
			await askedJson({ workspace, argv: [RUNG_ONE_QUESTION], exitCode: 0 })

			const second = await askedJson({ workspace, argv: [RUNG_ONE_QUESTION], exitCode: 0 })

			expect({
				ask: second.ask,
				folders: namesIn(asks).filter((name) => name.startsWith('A-')),
			}).toEqual({
				ask: SECOND_ASK,
				folders: [FIRST_ASK, SECOND_ASK],
			})
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'two asks at once -> two ids, never the same one',
		async () => {
			const workspace = createAskCommandWorkspace()
			const { environment } = workspace

			await expect(
				Promise.all(
					[1, 2].map(() =>
						runAsk({ argv: [RUNG_ONE_QUESTION, '--json'], cwd: workspace.cwd, environment }),
					),
				).then((answers) =>
					answers.map((answer) => (JSON.parse(answer.output) as AskJson).ask).sort(),
				),
			).resolves.toEqual([FIRST_ASK, SECOND_ASK])
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)
})

describe('ask --lot: a store lot, a hand-over folder, a refused folder (D16, case 13c)', () => {
	const lotArguments: Record<string, (params: { lotFolder: string }) => string> = {
		'--lot the folder of a store lot': ({ lotFolder }) => lotFolder,
		'--lot the full name of a store lot': () => LOT_NAME,
		'--lot the index of a store lot': () => '1',
	}

	for (const [name, argumentOf] of Object.entries(lotArguments))
		it(
			`${name} -> <lot folder>/asks/A-0001/, the events in the lot's events.jsonl with the lot's name, nothing in the state folder`,
			async () => {
				const { workspace, lotFolder } = createLotAskWorkspace({ place: 'project' })

				const json = await askedJson({
					workspace,
					argv: [RUNG_ONE_QUESTION, '--lot', argumentOf({ lotFolder })],
					exitCode: 0,
				})

				expect({
					record: readJsonFile(
						askRecordPath({ asksFolder: join(lotFolder, 'asks'), ask: FIRST_ASK }),
					),
					lots: [...new Set(readEventsFile(eventsPathIn(lotFolder)).map((event) => event.lot))],
					stateAsks: existsSync(join(workspace.state, ...STATE_ASKS_SEGMENTS)),
				}).toEqual({ record: json, lots: [LOT_NAME], stateAsks: false })
			},
			STORE_CASE_TIMEOUT,
		)

	it(
		'--lot a hand-over folder outside every repository -> <folder>/asks/A-0001/, the events in the state folder with lot null',
		async () => {
			const workspace = createAskCommandWorkspace()
			const handover = createHandoverFolder({ workspace })

			const json = await askedJson({
				workspace,
				argv: [RUNG_ONE_QUESTION, '--lot', handover],
				exitCode: 0,
			})

			expect({
				record: readJsonFile(askRecordPath({ asksFolder: join(handover, 'asks'), ask: FIRST_ASK })),
				lots: [
					...new Set(
						readEventsFile(eventsPathIn(join(workspace.state, ...STATE_ASKS_SEGMENTS))).map(
							(event) => event.lot,
						),
					),
				],
				handoverEvents: existsSync(eventsPathIn(handover)),
			}).toEqual({ record: json, lots: [null], handoverEvents: false })
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'13c --lot ./src inside a work tree -> exit 2, the refusal line, no asks folder and no event anywhere',
		async () => {
			const { workspace, lots } = createLotAskWorkspace({ place: 'repository' })

			const answer = await askedWith({
				workspace,
				argv: [RUNG_ONE_QUESTION, '--lot', WORK_TREE_SUBFOLDER],
				exitCode: 2,
			})

			expect({
				says: answer.output.includes('inside the repository'),
				repositoryAsks: existsSync(join(lots.repository, 'src', 'asks')),
				repositoryRootAsks: existsSync(join(lots.repository, 'asks')),
				stateAsks: existsSync(join(workspace.state, ...STATE_ASKS_SEGMENTS)),
				lotAsks: existsSync(join(lots.store, LOT_NAME, 'asks')),
				lotEvents: existsSync(eventsPathIn(join(lots.store, LOT_NAME))),
				data: namesIn(workspace.data),
			}).toEqual({
				says: true,
				repositoryAsks: false,
				repositoryRootAsks: false,
				data: [],
				stateAsks: false,
				lotAsks: false,
				lotEvents: false,
			})
		},
		STORE_CASE_TIMEOUT,
	)

	it(
		'no --lot, run in the worktree of a store lot -> that lot: its asks folder and its events',
		async () => {
			const { workspace, lotFolder } = createLotAskWorkspace({ place: 'worktree' })

			const json = await askedJson({ workspace, argv: [RUNG_ONE_QUESTION], exitCode: 0 })

			expect({
				record: readJsonFile(
					askRecordPath({ asksFolder: join(lotFolder, 'asks'), ask: FIRST_ASK }),
				),
				lots: [...new Set(readEventsFile(eventsPathIn(lotFolder)).map((event) => event.lot))],
			}).toEqual({ record: json, lots: [LOT_NAME] })
		},
		STORE_CASE_TIMEOUT,
	)
})
