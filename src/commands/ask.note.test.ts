import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
	DOCUMENT_STANDARDS,
	RUNG_ONE_QUESTION,
	SEMANTIC_QUESTION,
	STANDARD_RECORD_FILE,
} from '../../test/ask-command-workspace.constants.ts'
import { askedWith, createLotAskWorkspace, readJsonFile } from '../../test/ask-command-workspace.ts'
import { DECLARED_NAME } from '../../test/standard-selection.constants.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'

import { describe, expect, it } from 'vitest'

const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u

describe("ask: the lot's standard note, recomputed from every ask of asks/ (D18)", () => {
	it(
		'an ask of a lot that reaches rung 3 -> standard.json consulted, the note naming the ask and its state',
		async () => {
			const { workspace, lotFolder } = createLotAskWorkspace({
				place: 'project',
				standards: DOCUMENT_STANDARDS,
				standardName: DECLARED_NAME,
			})

			await askedWith({ workspace, argv: [SEMANTIC_QUESTION, '--lot', lotFolder], exitCode: 3 })

			expect(readJsonFile(join(lotFolder, STANDARD_RECORD_FILE))).toEqual({
				state: 'consulted',
				note: 'asks A-0001 needs-readers',
				at: expect.stringMatching(ISO_TIME),
			})
		},
		STORE_CASE_TIMEOUT,
	)

	it(
		'an ask of a lot on the outside route (no documents) -> the note is written too',
		async () => {
			const { workspace, lotFolder } = createLotAskWorkspace({ place: 'project' })

			await askedWith({ workspace, argv: [SEMANTIC_QUESTION, '--lot', lotFolder], exitCode: 3 })

			expect(readJsonFile(join(lotFolder, STANDARD_RECORD_FILE))).toEqual({
				state: 'consulted',
				note: 'asks A-0001 needs-readers',
				at: expect.stringMatching(ISO_TIME),
			})
		},
		STORE_CASE_TIMEOUT,
	)

	it(
		'an ask of a lot answered at rung 1 -> no standard.json at all',
		async () => {
			const { workspace, lotFolder } = createLotAskWorkspace({
				place: 'project',
				standards: DOCUMENT_STANDARDS,
				standardName: DECLARED_NAME,
			})

			await askedWith({ workspace, argv: [RUNG_ONE_QUESTION, '--lot', lotFolder], exitCode: 0 })

			expect(existsSync(join(lotFolder, STANDARD_RECORD_FILE))).toBe(false)
		},
		STORE_CASE_TIMEOUT,
	)

	it(
		'a rung-1 ask between two asks of rung 3 -> it leaves the note as it was, the next rung-3 ask recomputes it from all three',
		async () => {
			const { workspace, lotFolder } = createLotAskWorkspace({
				place: 'project',
				standards: DOCUMENT_STANDARDS,
				standardName: DECLARED_NAME,
			})
			const recordPath = join(lotFolder, STANDARD_RECORD_FILE)
			await askedWith({ workspace, argv: [SEMANTIC_QUESTION, '--lot', lotFolder], exitCode: 3 })
			const afterFirst = readFileSync(recordPath, 'utf8')

			await askedWith({ workspace, argv: [RUNG_ONE_QUESTION, '--lot', lotFolder], exitCode: 0 })
			const afterSecond = readFileSync(recordPath, 'utf8')
			await askedWith({ workspace, argv: [SEMANTIC_QUESTION, '--lot', lotFolder], exitCode: 3 })

			expect({
				unchangedByRungOne: afterSecond === afterFirst,
				note: (readJsonFile(recordPath) as { note: string }).note,
			}).toEqual({
				unchangedByRungOne: true,
				note: 'asks A-0001 needs-readers · A-0002 answered F-0001 · A-0003 needs-readers',
			})
		},
		STORE_CASE_TIMEOUT,
	)
})
