import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

import {
	ASK_EVENT_KINDS,
	DOCUMENT_STANDARDS,
	FIRST_ASK,
	PRIVATE_WORD,
	RUNG_ONE_QUESTION,
	SEMANTIC_QUESTION,
	SLICE_SENTENCE,
	STATE_ASKS_SEGMENTS,
} from '../../test/ask-command-workspace.constants.ts'
import {
	askedJson,
	askRecordPath,
	askThroughCli,
	createAskCommandWorkspace,
	createDocumentsWorkspace,
	eventsPathIn,
	readEventsFile,
	withoutStandard,
} from '../../test/ask-command-workspace.ts'
import { STANDARD_DISK_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'

import { describe, expect, it } from 'vitest'

/** The events of the state folder's asks, in order. */
function stateEventsOf(params: { state: string }) {
	return readEventsFile(eventsPathIn(join(params.state, ...STATE_ASKS_SEGMENTS)))
}

describe('ask events: four kinds, an envelope each, nothing private (D17, case 3)', () => {
	it(
		'an ask answered at rung 1 -> parsed first, rung events ascending to rung 1 each with a duration, fact, state last',
		async () => {
			const workspace = createAskCommandWorkspace()

			await askedJson({ workspace, argv: [RUNG_ONE_QUESTION], exitCode: 0 })

			const events = stateEventsOf({ state: workspace.state })
			const rungs = events.filter((event) => event.kind === 'ask.rung')
			expect({
				kinds: events.map((event) => event.kind),
				rungNumbers: rungs.map((event) => event.rung),
				durationsAreNumbers: rungs.every(
					(event) => typeof event.durationMs === 'number' && event.durationMs >= 0,
				),
				asks: [...new Set(events.map((event) => event.ask))],
			}).toEqual({
				kinds: ['ask.parsed', ...rungs.map(() => 'ask.rung'), 'ask.fact', 'ask.state'],
				rungNumbers: [0, 1],
				durationsAreNumbers: true,
				asks: [FIRST_ASK],
			})
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'every event -> schema 1, written by the cli, not simulated, no host event, lot null outside a lot',
		async () => {
			const workspace = createAskCommandWorkspace()

			await askedJson({ workspace, argv: [RUNG_ONE_QUESTION], exitCode: 0 })

			expect(
				stateEventsOf({ state: workspace.state }).map((event) => ({
					schema: event.schema,
					by: event.by,
					simulated: event.simulated,
					hostEvent: event.hostEvent,
					lot: event.lot,
				})),
			).toEqual(
				stateEventsOf({ state: workspace.state }).map(() => ({
					schema: 1,
					by: 'cli',
					simulated: false,
					hostEvent: null,
					lot: null,
				})),
			)
			expect(stateEventsOf({ state: workspace.state }).length).toBeGreaterThanOrEqual(4)
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'an ask that reaches rung 3 -> its last rung event is rung 3 and its state event says needs-readers',
		async () => {
			const workspace = createDocumentsWorkspace({ standards: DOCUMENT_STANDARDS })

			await askedJson({ workspace, argv: [SEMANTIC_QUESTION], exitCode: 3 })

			const events = stateEventsOf({ state: workspace.state })
			expect({
				lastRung: events.filter((event) => event.kind === 'ask.rung').at(-1)?.rung,
				state: events.at(-1),
			}).toEqual({
				lastRung: 3,
				state: expect.objectContaining({ kind: 'ask.state', state: 'needs-readers', rung: 3 }),
			})
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'a question with slices -> no event holds the question, a word of it, the text of a slice or a URL',
		async () => {
			const workspace = createDocumentsWorkspace({ standards: DOCUMENT_STANDARDS })

			const json = await askedJson({ workspace, argv: [SEMANTIC_QUESTION], exitCode: 3 })

			const text = JSON.stringify(stateEventsOf({ state: workspace.state }))
			expect({
				hasSlices: json.slices.length > 0,
				holdsQuestion: text.includes(SEMANTIC_QUESTION),
				holdsWord: text.includes(PRIVATE_WORD),
				holdsSlice: text.includes(SLICE_SENTENCE) || text.includes('holds the parts'),
				holdsUrl: text.includes('http'),
				kinds: [...new Set(stateEventsOf({ state: workspace.state }).map((event) => event.kind))],
			}).toEqual({
				hasSlices: true,
				holdsQuestion: false,
				holdsWord: false,
				holdsSlice: false,
				holdsUrl: false,
				kinds: [...ASK_EVENT_KINDS],
			})
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'ask.parsed -> the key hash (64 hex) and the question length, never the text',
		async () => {
			const workspace = createAskCommandWorkspace()

			await askedJson({ workspace, argv: [RUNG_ONE_QUESTION], exitCode: 0 })

			const parsed = stateEventsOf({ state: workspace.state }).find(
				(event) => event.kind === 'ask.parsed',
			)
			expect({ key: parsed?.key, length: parsed?.length }).toEqual({
				key: expect.stringMatching(/^[0-9a-f]{64}$/u),
				length: RUNG_ONE_QUESTION.length,
			})
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'the outside route, a question holding a URL -> no event holds the question, a word of it, the URL or its host',
		async () => {
			const workspace = withoutStandard({ workspace: createAskCommandWorkspace() })

			await askedJson({
				workspace,
				argv: [`${SEMANTIC_QUESTION} see https://example.com/page`],
				exitCode: 3,
			})

			const events = stateEventsOf({ state: workspace.state })
			const text = JSON.stringify(events)
			expect({
				holdsWord: text.includes(PRIVATE_WORD),
				holdsUrl: text.includes('http') || text.includes('example.com'),
				lastState: events.at(-1),
			}).toEqual({
				holdsWord: false,
				holdsUrl: false,
				lastState: expect.objectContaining({ kind: 'ask.state', state: 'needs-readers' }),
			})
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'13d a write that fails on an ask that needs readers -> exit 3 unchanged, one line on stderr naming the events file',
		() => {
			const workspace = createDocumentsWorkspace({ standards: DOCUMENT_STANDARDS })
			mkdirSync(eventsPathIn(join(workspace.state, ...STATE_ASKS_SEGMENTS)), { recursive: true })

			const run = askThroughCli({ workspace, argv: [SEMANTIC_QUESTION, '--json'] })

			const errorLines = run.stderr.split('\n').filter((line) => line.trim() !== '')
			expect({
				status: run.status,
				errorLineCount: errorLines.length,
				namesFile: errorLines.some((line) => line.includes('events.jsonl')),
			}).toEqual({ status: 3, errorLineCount: 1, namesFile: true })
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'13d a write that fails (the events file is a folder) -> one line on stderr naming it, exit 0, the ask still recorded',
		() => {
			const workspace = createAskCommandWorkspace()
			const asks = join(workspace.state, ...STATE_ASKS_SEGMENTS)
			mkdirSync(eventsPathIn(asks), { recursive: true })

			const run = askThroughCli({ workspace, argv: [RUNG_ONE_QUESTION, '--json'] })

			const errorLines = run.stderr.split('\n').filter((line) => line.trim() !== '')
			expect({
				status: run.status,
				errorLineCount: errorLines.length,
				namesFile: errorLines.some((line) => line.includes('events.jsonl')),
				recorded: existsSync(askRecordPath({ asksFolder: asks, ask: FIRST_ASK })),
				answered: run.stdout.includes('"answered"'),
			}).toEqual({
				status: 0,
				errorLineCount: 1,
				namesFile: true,
				recorded: true,
				answered: true,
			})
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)
})
