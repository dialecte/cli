import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
	ASK_JSON_KEYS,
	DOCUMENT_STANDARDS,
	FIRST_ASK,
	RUNG_ONE_QUESTION,
	SECOND_ASK,
	SEMANTIC_QUESTION,
} from '../../test/ask-command-workspace.constants.ts'
import {
	askedJson,
	createAskCommandWorkspace,
	createDocumentsWorkspace,
	namesIn,
	readJsonFile,
} from '../../test/ask-command-workspace.ts'
import { recordUncheckedFact } from '../../test/ask-fix-1-fixtures.ts'
import { FACT_ANSWER_TEXT, OWN_FACT_QUESTION } from '../../test/ask-fix-1.constants.ts'
import {
	PACK_FILE_ID,
	PACK_LIKE_QUESTION,
	PACK_STANDARDS,
	PACK_TAG_FILE,
	REQUEST_FILE,
} from '../../test/ask-pack-fixtures.constants.ts'
import { askedOutside, asksFolderOf } from '../../test/ask-pack-fixtures.ts'
import { WIDGET_PACKAGE } from '../../test/installed-test-dialecte.constants.ts'
import {
	DECLARED_FOLDER,
	DECLARED_KEY,
	DECLARED_NAME,
} from '../../test/standard-selection.constants.ts'
import { lineCountOf } from '../../test/standard-workspace.ts'
import { STANDARD_DISK_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'

import { describe, expect, it } from 'vitest'

/** The path of the request record of an ask. */
function requestPathOf(params: { asksFolder: string; ask: string }): string {
	return join(params.asksFolder, params.ask, REQUEST_FILE)
}

describe('ask: the request record beside ask.json (D2)', () => {
	it(
		'an ask on documents -> request.json holds the whole request and the manifest files with sha256 and lines; ask.json keeps its keys',
		async () => {
			const workspace = createDocumentsWorkspace({ standards: PACK_STANDARDS })
			const asks = asksFolderOf({ workspace })

			const json = await askedJson({ workspace, argv: [SEMANTIC_QUESTION], exitCode: 3 })

			expect({
				askKeys: Object.keys(readJsonFile(join(asks, FIRST_ASK, 'ask.json')) as object).sort(),
				request: existsSync(requestPathOf({ asksFolder: asks, ask: FIRST_ASK }))
					? readJsonFile(requestPathOf({ asksFolder: asks, ask: FIRST_ASK }))
					: null,
			}).toEqual({
				askKeys: [...ASK_JSON_KEYS],
				request: {
					schema: 1,
					question: SEMANTIC_QUESTION,
					about: null,
					code: null,
					method: null,
					package: null,
					kind: json.kind,
					decision: false,
					limit: 10,
					effort: 'medium',
					documents: true,
					standard: {
						name: DECLARED_NAME,
						key: DECLARED_KEY,
						folders: [DECLARED_FOLDER],
						files: [
							{
								id: PACK_FILE_ID,
								sha256: createHash('sha256').update(PACK_TAG_FILE).digest('hex'),
								lines: lineCountOf(PACK_TAG_FILE),
							},
						],
					},
				},
			})
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'the flags given -> request.json holds them: --about, --package, --limit, --effort',
		async () => {
			const workspace = createDocumentsWorkspace({ standards: DOCUMENT_STANDARDS })
			const asks = asksFolderOf({ workspace })

			await askedJson({
				workspace,
				argv: [
					SEMANTIC_QUESTION,
					'--about',
					'AA_1',
					'--package',
					WIDGET_PACKAGE,
					'--limit',
					'5',
					'--effort',
					'high',
				],
				exitCode: 3,
			})

			expect(
				existsSync(requestPathOf({ asksFolder: asks, ask: FIRST_ASK }))
					? readJsonFile(requestPathOf({ asksFolder: asks, ask: FIRST_ASK }))
					: null,
			).toMatchObject({
				schema: 1,
				about: 'AA_1',
				package: WIDGET_PACKAGE,
				limit: 5,
				effort: 'high',
			})
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'an ask with no documents -> request.json says documents: false and keeps the declared name, its key and no file',
		async () => {
			const asked = await askedOutside()

			expect(
				existsSync(requestPathOf({ asksFolder: asked.asksFolder, ask: asked.ask }))
					? readJsonFile(requestPathOf({ asksFolder: asked.asksFolder, ask: asked.ask }))
					: null,
			).toMatchObject({
				schema: 1,
				question: SEMANTIC_QUESTION,
				documents: false,
				standard: { name: DECLARED_NAME, key: DECLARED_KEY, folders: [], files: [] },
			})
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'an ask answered at rung 1 still writes request.json: every ask that claims a folder does',
		async () => {
			const workspace = createAskCommandWorkspace()
			const asks = asksFolderOf({ workspace })

			await askedJson({ workspace, argv: [RUNG_ONE_QUESTION], exitCode: 0 })

			expect(
				existsSync(requestPathOf({ asksFolder: asks, ask: FIRST_ASK }))
					? readJsonFile(requestPathOf({ asksFolder: asks, ask: FIRST_ASK }))
					: null,
			).toMatchObject({ schema: 1, question: RUNG_ONE_QUESTION, kind: 'children' })
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'a quoted question starting with pack (one argument) is asked as a question, not dispatched: its folder holds the question',
		async () => {
			const workspace = createDocumentsWorkspace({ standards: PACK_STANDARDS })
			const asks = asksFolderOf({ workspace })

			await askedJson({ workspace, argv: [PACK_LIKE_QUESTION], exitCode: 3 })

			expect(
				existsSync(requestPathOf({ asksFolder: asks, ask: FIRST_ASK }))
					? readJsonFile(requestPathOf({ asksFolder: asks, ask: FIRST_ASK }))
					: null,
			).toMatchObject({ schema: 1, question: PACK_LIKE_QUESTION })
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'the re-ask of an unchecked fact -> its folder holds a request.json made from the fact: the question, the subject as about, the package, never the fact text',
		async () => {
			const workspace = createDocumentsWorkspace({ standards: DOCUMENT_STANDARDS })
			recordUncheckedFact({
				workspace,
				packageName: WIDGET_PACKAGE,
				question: OWN_FACT_QUESTION,
			})
			const asks = asksFolderOf({ workspace })

			await askedJson({ workspace, argv: [SEMANTIC_QUESTION], exitCode: 3 })

			const path = requestPathOf({ asksFolder: asks, ask: SECOND_ASK })
			expect({
				folder: namesIn(join(asks, SECOND_ASK)),
				request: existsSync(path) ? readJsonFile(path) : null,
				factText: existsSync(path) ? readFileSync(path, 'utf8').includes(FACT_ANSWER_TEXT) : null,
			}).toMatchObject({
				folder: expect.arrayContaining(['ask.json', REQUEST_FILE]),
				request: {
					schema: 1,
					question: OWN_FACT_QUESTION,
					about: 'A/D',
					package: WIDGET_PACKAGE,
					documents: true,
				},
				factText: false,
			})
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)
})
