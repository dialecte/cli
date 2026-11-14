import { join } from 'node:path'

import {
	ASK_JSON_SCHEMA,
	CONFLICT_KIND,
	PROSE_OUTSIDE_VALUE,
	PROSE_TEXT,
	REJECTED_ITEM,
	BOUNDARY_CHILDREN_ANSWER,
} from '../../test/ask-boundary.constants.ts'
import {
	ASK_JSON_KEYS,
	DOCUMENT_STANDARDS,
	RUNG_ONE_QUESTION,
	STATE_ASKS_SEGMENTS,
} from '../../test/ask-command-workspace.constants.ts'
import {
	askedJson,
	askedWith,
	createDocumentsWorkspace,
	eventsPathIn,
	readEventsFile,
} from '../../test/ask-command-workspace.ts'
import { workspaceFactsFolder } from '../../test/ask-fix-1-fixtures.ts'
import { SETUP_NOW } from '../../test/ask-ladder-fixtures.constants.ts'
import { factDraft } from '../../test/fact-fixtures.ts'
import { WIDGET_PACKAGE } from '../../test/installed-test-dialecte.constants.ts'
import { STANDARD_DISK_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { recordFact } from '../lib/knowledge/facts/record-fact.ts'

import { describe, expect, it } from 'vitest'

import type { AskCommandWorkspace } from '../../test/ask-command-workspace.types.ts'

function recordOutsideProse(params: { workspace: AskCommandWorkspace }): void {
	recordFact({
		folder: workspaceFactsFolder({ workspace: params.workspace }),
		draft: factDraft({
			question: RUNG_ONE_QUESTION,
			subject: {
				package: WIDGET_PACKAGE,
				tags: [{ tag: 'AA_1', parent: null }],
				attributes: [],
				codes: [],
				methods: [],
			},
			kind: 'children',
			answer: { verdict: 'value', value: PROSE_OUTSIDE_VALUE, text: PROSE_TEXT },
			source: 'person',
			sources: [],
			effort: 'high',
		}),
		now: () => SETUP_NOW,
	})
}

describe('ask --json: a versioned schema (D30)', () => {
	it(
		'the object holds schema: 1 and, sorted, exactly the documented members including boundary and conflict',
		async () => {
			const workspace = createDocumentsWorkspace({ standards: DOCUMENT_STANDARDS })

			const json = await askedJson({ workspace, argv: [RUNG_ONE_QUESTION], exitCode: 0 })

			expect({ schema: json.schema, keys: Object.keys(json).sort() }).toEqual({
				schema: ASK_JSON_SCHEMA,
				keys: [...ASK_JSON_KEYS],
			})
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)
})

describe('ask --decision: the definition is the boundary (D29)', () => {
	it(
		'a schema fact stored by an earlier ask, then --decision -> no answer, exit 3, the fact a candidate, the boundary in the json and a boundary: line in the text',
		async () => {
			const workspace = createDocumentsWorkspace({ standards: DOCUMENT_STANDARDS })
			await askedJson({ workspace, argv: [RUNG_ONE_QUESTION], exitCode: 0 })

			const json = await askedJson({
				workspace,
				argv: [RUNG_ONE_QUESTION, '--decision'],
				exitCode: 3,
			})
			const text = await askedWith({
				workspace,
				argv: [RUNG_ONE_QUESTION, '--decision'],
				exitCode: 3,
			})

			expect({
				state: json.state,
				answer: json.answer,
				candidates: json.candidates.map((candidate) => candidate.fact),
				boundary: json.boundary,
				conflict: json.conflict,
				textLine: text.output.split('\n').some((line) => line.startsWith('boundary:')),
			}).toEqual({
				state: 'needs-readers',
				answer: null,
				candidates: ['F-0001'],
				boundary: {
					answer: expect.objectContaining(BOUNDARY_CHILDREN_ANSWER),
					source: expect.objectContaining({ kind: 'schema', package: WIDGET_PACKAGE }),
				},
				conflict: null,
				textLine: true,
			})
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'prose naming what the definition rejects -> exit 0, conflict in the json, a ! conflict: line in the text, ask.state conflict: true, no item name in any event',
		async () => {
			const workspace = createDocumentsWorkspace({ standards: DOCUMENT_STANDARDS })
			recordOutsideProse({ workspace })

			const json = await askedJson({
				workspace,
				argv: [RUNG_ONE_QUESTION, '--decision'],
				exitCode: 0,
			})
			const text = await askedWith({
				workspace,
				argv: [RUNG_ONE_QUESTION, '--decision'],
				exitCode: 0,
			})

			const events = readEventsFile(eventsPathIn(join(workspace.state, ...STATE_ASKS_SEGMENTS)))
			expect({
				conflict: json.conflict,
				textLine: text.output.split('\n').some((line) => line.startsWith('! conflict:')),
				stateFlags: events
					.filter((event) => event.kind === 'ask.state')
					.map((event) => event.conflict),
				namesAnItem: JSON.stringify(events).includes(REJECTED_ITEM),
			}).toEqual({
				conflict: { kind: CONFLICT_KIND, fact: 'F-0001', outside: [REJECTED_ITEM] },
				textLine: true,
				stateFlags: [true, true],
				namesAnItem: false,
			})
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'without --decision the same prose -> boundary null, conflict null in the json',
		async () => {
			const workspace = createDocumentsWorkspace({ standards: DOCUMENT_STANDARDS })
			recordOutsideProse({ workspace })

			const json = await askedJson({ workspace, argv: [RUNG_ONE_QUESTION], exitCode: 0 })

			expect({
				rung: json.rung,
				answer: json.answer,
				boundary: json.boundary,
				conflict: json.conflict,
			}).toEqual({
				rung: 0,
				answer: expect.objectContaining({ value: PROSE_OUTSIDE_VALUE }),
				boundary: null,
				conflict: null,
			})
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)
})
