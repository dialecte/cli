import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
	DOCUMENT_STANDARDS,
	FIRST_ASK,
	SECOND_ASK,
	SEMANTIC_QUESTION,
	STATE_ASKS_SEGMENTS,
} from '../../test/ask-command-workspace.constants.ts'
import {
	askedJson,
	askedWith,
	askRecordPath,
	createAskCommandWorkspace,
	createDocumentsWorkspace,
	createLotAskWorkspace,
	namesIn,
	readJsonFile,
} from '../../test/ask-command-workspace.ts'
import {
	recordLackingAttributeFact,
	recordUncheckedFact,
	workspaceFactsFolder,
} from '../../test/ask-fix-1-fixtures.ts'
import {
	LACKING_ATTRIBUTE_QUESTION,
	OTHER_FACT_QUESTION,
	OWN_FACT_ID,
	OWN_FACT_QUESTION,
	FACT_ANSWER_TEXT,
	FOREIGN_PACKAGE,
	OTHER_FACT_ID,
} from '../../test/ask-fix-1.constants.ts'
import { readHistoryFile } from '../../test/fact-fixtures.ts'
import { WIDGET_PACKAGE } from '../../test/installed-test-dialecte.constants.ts'
import { LOT_NAME } from '../../test/lot-stores.constants.ts'
import { DECLARED_NAME } from '../../test/standard-selection.constants.ts'
import { filesUnder } from '../../test/standard-workspace.ts'
import { STANDARD_DISK_CASE_TIMEOUT, STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'

import { describe, expect, it } from 'vitest'

describe('ask: the re-ask of an unchecked fact', () => {
	it(
		'documents of the standard and an unchecked fact of the dialecte package -> a re-ask folder A-0002 whose ask.json holds reask: the fact id and the question, never the fact text',
		async () => {
			const workspace = createDocumentsWorkspace({ standards: DOCUMENT_STANDARDS })
			recordUncheckedFact({
				workspace,
				packageName: WIDGET_PACKAGE,
				question: OWN_FACT_QUESTION,
			})
			const asks = join(workspace.state, ...STATE_ASKS_SEGMENTS)

			await askedJson({ workspace, argv: [SEMANTIC_QUESTION], exitCode: 3 })

			expect(readJsonFile(askRecordPath({ asksFolder: asks, ask: SECOND_ASK }))).toMatchObject({
				ask: SECOND_ASK,
				question: OWN_FACT_QUESTION,
				reask: OWN_FACT_ID,
				state: 'needs-readers',
			})
			expect(
				readFileSync(askRecordPath({ asksFolder: asks, ask: SECOND_ASK }), 'utf8'),
			).not.toContain(FACT_ANSWER_TEXT)
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'an unchecked fact of another package beside it -> not re-asked: one re-ask folder only, naming the first fact',
		async () => {
			const workspace = createDocumentsWorkspace({ standards: DOCUMENT_STANDARDS })
			recordUncheckedFact({
				workspace,
				packageName: WIDGET_PACKAGE,
				question: OWN_FACT_QUESTION,
			})
			recordUncheckedFact({
				workspace,
				packageName: FOREIGN_PACKAGE,
				question: OTHER_FACT_QUESTION,
			})
			const asks = join(workspace.state, ...STATE_ASKS_SEGMENTS)

			await askedJson({ workspace, argv: [SEMANTIC_QUESTION], exitCode: 3 })

			expect({
				folders: namesIn(asks).filter((name) => name.startsWith('A-')),
				reasked: (
					readJsonFile(askRecordPath({ asksFolder: asks, ask: SECOND_ASK })) as { reask?: unknown }
				).reask,
				otherHistory: readHistoryFile({
					folder: workspaceFactsFolder({ workspace }),
					id: OTHER_FACT_ID,
				}).map((line) => line.event),
			}).toEqual({
				folders: [FIRST_ASK, SECOND_ASK],
				reasked: OWN_FACT_ID,
				otherHistory: ['created'],
			})
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)
})

describe('ask: refusals made before the index is built and the ask is claimed', () => {
	it(
		'--no-standard with documents -> exit 2 before the index is loaded: the cache folder stays empty on a first run',
		async () => {
			const workspace = createDocumentsWorkspace({ standards: DOCUMENT_STANDARDS })

			await askedWith({ workspace, argv: [SEMANTIC_QUESTION, '--no-standard'], exitCode: 2 })

			expect({
				cache: filesUnder(workspace.cache),
				asks: namesIn(join(workspace.state, ...STATE_ASKS_SEGMENTS)),
			}).toEqual({ cache: [], asks: [] })
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'a structural question naming an attribute the element lacks, a fact keyed to it -> exit 2, no ask folder claimed, no history line on the fact',
		async () => {
			const workspace = createAskCommandWorkspace()
			const fact = recordLackingAttributeFact({ workspace, packageName: WIDGET_PACKAGE })
			const asks = join(workspace.state, ...STATE_ASKS_SEGMENTS)

			await askedWith({ workspace, argv: [LACKING_ATTRIBUTE_QUESTION], exitCode: 2 })

			expect({
				asks: namesIn(asks).filter((name) => name.startsWith('A-')),
				history: readHistoryFile({
					folder: workspaceFactsFolder({ workspace }),
					id: fact,
				}).map((line) => line.event),
			}).toEqual({ asks: [], history: ['created'] })
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)
})

describe('ask: the re-ask history line names the lot', () => {
	it(
		'a re-ask made by an ask run in a store lot -> the fact rechecked line holds lot: the lot name',
		async () => {
			const { workspace, lotFolder } = createLotAskWorkspace({
				place: 'project',
				standards: DOCUMENT_STANDARDS,
				standardName: DECLARED_NAME,
			})
			recordUncheckedFact({
				workspace,
				packageName: WIDGET_PACKAGE,
				question: OWN_FACT_QUESTION,
			})

			await askedWith({
				workspace,
				argv: [SEMANTIC_QUESTION, '--lot', lotFolder, '--json'],
				exitCode: 3,
			})

			expect(
				readHistoryFile({ folder: workspaceFactsFolder({ workspace }), id: OWN_FACT_ID }).filter(
					(line) => line.event === 'rechecked',
				),
			).toMatchObject([{ lot: LOT_NAME, reason: 'documents' }])
		},
		STORE_CASE_TIMEOUT,
	)
})
