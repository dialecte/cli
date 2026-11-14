import { existsSync } from 'node:fs'
import { join } from 'node:path'

import {
	ASK_JSON_KEYS,
	DOCUMENT_STANDARDS,
	FIRST_ASK,
	NEXT_ANSWER,
	NEXT_PACK,
	NEXT_PACK_OUTSIDE,
	RUNG_ONE_QUESTION,
	SEMANTIC_QUESTION,
	STATE_ASKS_SEGMENTS,
} from '../../test/ask-command-workspace.constants.ts'
import {
	askedJson,
	askedWith,
	askRecordPath,
	createAskCommandWorkspace,
	createDocumentsWorkspace,
	readJsonFile,
	withoutStandard,
} from '../../test/ask-command-workspace.ts'
import {
	DECLARED_FOLDER,
	DECLARED_KEY,
	DECLARED_NAME,
} from '../../test/standard-selection.constants.ts'
import { STANDARD_DISK_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'

import { describe, expect, it } from 'vitest'

import type { AskJson } from '../../test/ask-command-workspace.types.ts'

/** The ask's own record (the `--json` object) of the first ask of a workspace's state folder. */
function firstRecordOf(params: { state: string }): AskJson {
	return readJsonFile(
		askRecordPath({ asksFolder: join(params.state, ...STATE_ASKS_SEGMENTS), ask: FIRST_ASK }),
	) as AskJson
}

describe('ask: answered -> exit 0, the answer line and its source (D20, case 5)', () => {
	it(
		'children of AA_1 -> exit 0, the first lines are the answer line and the source line',
		async () => {
			const workspace = createAskCommandWorkspace()

			const answer = await askedWith({ workspace, argv: [RUNG_ONE_QUESTION], exitCode: 0 })

			const record = firstRecordOf({ state: workspace.state })
			expect(answer.output.split('\n').slice(0, 2)).toEqual([
				`answer: ${record.answer?.text}`,
				'source: schema',
			])
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'--json -> the section 3 object: its members, the ask, the rung, the answer and the fact recorded',
		async () => {
			const workspace = createAskCommandWorkspace()

			const json = await askedJson({ workspace, argv: [RUNG_ONE_QUESTION], exitCode: 0 })

			expect({ keys: Object.keys(json).sort(), json }).toMatchObject({
				keys: [...ASK_JSON_KEYS],
				json: {
					ask: FIRST_ASK,
					question: RUNG_ONE_QUESTION,
					kind: 'children',
					decision: false,
					rung: 1,
					state: 'answered',
					answer: { verdict: 'value', value: expect.stringContaining('AAA_1') },
					fact: 'F-0001',
					source: null,
					next: null,
					effort: { level: 'medium' },
				},
			})
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'the answer is recorded as a fact in the data folder, and the same question asked again answers at rung 0 from it',
		async () => {
			const workspace = createAskCommandWorkspace()
			await askedJson({ workspace, argv: [RUNG_ONE_QUESTION], exitCode: 0 })

			const again = await askedJson({ workspace, argv: [RUNG_ONE_QUESTION], exitCode: 0 })

			expect({
				file: existsSync(join(workspace.data, 'dialecte', 'facts', 'F-0001.json')),
				rung: again.rung,
				fact: again.fact,
			}).toEqual({ file: true, rung: 0, fact: 'F-0001' })
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)
})

describe('ask: needs a person -> exit 1; needs readers -> exit 3, the slices or the outside line, and next (D14, D20)', () => {
	it(
		'--person-only after rung 2 -> exit 1, state needs-person, next names ask answer; the text says it',
		async () => {
			const workspace = createAskCommandWorkspace()

			const answer = await askedWith({
				workspace,
				argv: [SEMANTIC_QUESTION, '--person-only'],
				exitCode: 1,
			})

			const record = firstRecordOf({ state: workspace.state })
			expect({
				state: record.state,
				next: record.next,
				text:
					answer.output.includes('needs-person') && answer.output.includes(`next: ${record.next}`),
			}).toEqual({
				state: 'needs-person',
				next: expect.stringContaining(NEXT_ANSWER),
				text: true,
			})
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'a question the documents may answer -> exit 3, needs-readers with the slices, next names ask pack; the text lists the slices',
		async () => {
			const workspace = createDocumentsWorkspace({ standards: DOCUMENT_STANDARDS })

			const answer = await askedWith({ workspace, argv: [SEMANTIC_QUESTION], exitCode: 3 })

			const record = firstRecordOf({ state: workspace.state })
			expect({
				rung: record.rung,
				state: record.state,
				source: record.source,
				answer: record.answer,
				next: record.next,
				standard: record.standard,
				hasSlices: record.slices.length > 0,
				textHasSlices: record.slices.every((slice) =>
					answer.output.includes(`${slice.file}:${slice.from}-${slice.to}`),
				),
				textHasNext: answer.output.includes(`next: ${NEXT_PACK}`),
			}).toEqual({
				rung: 3,
				state: 'needs-readers',
				source: 'documents',
				answer: null,
				next: NEXT_PACK,
				standard: {
					configured: true,
					documents: true,
					name: DECLARED_NAME,
					key: DECLARED_KEY,
					folders: [DECLARED_FOLDER],
					files: expect.anything(),
				},
				hasSlices: true,
				textHasSlices: true,
				textHasNext: true,
			})
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'32g no documents configured -> exit 3 (never 2), needs-readers on the outside route, next names ask pack --outside; the text says outside',
		async () => {
			const workspace = withoutStandard({
				workspace: createAskCommandWorkspace({ standardName: DECLARED_NAME }),
			})

			const answer = await askedWith({ workspace, argv: [SEMANTIC_QUESTION], exitCode: 3 })

			const record = firstRecordOf({ state: workspace.state })
			expect({
				state: record.state,
				source: record.source,
				slices: record.slices,
				next: record.next,
				standard: record.standard,
				textSaysOutside: answer.output.includes('outside'),
				textHasNext: answer.output.includes(`next: ${NEXT_PACK_OUTSIDE}`),
			}).toEqual({
				state: 'needs-readers',
				source: 'outside',
				slices: [],
				next: NEXT_PACK_OUTSIDE,
				standard: expect.objectContaining({
					configured: false,
					documents: false,
					name: DECLARED_NAME,
					key: DECLARED_KEY,
				}),
				textSaysOutside: true,
				textHasNext: true,
			})
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'a structural question with --decision -> rung 1 never answers: the ask goes on to the documents, exit 3, decision true',
		async () => {
			const workspace = createDocumentsWorkspace({ standards: DOCUMENT_STANDARDS })

			const json = await askedJson({
				workspace,
				argv: [RUNG_ONE_QUESTION, '--decision'],
				exitCode: 3,
			})

			expect({ rung: json.rung, state: json.state, decision: json.decision }).toEqual({
				rung: 3,
				state: 'needs-readers',
				decision: true,
			})
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)
})
