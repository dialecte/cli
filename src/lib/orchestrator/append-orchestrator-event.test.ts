import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { snapshotOf } from '../../../test/lot-start-workspace.ts'
import { temporaryFolder } from '../../../test/scratch-repository.ts'
import { EVENT_LINE_LIMIT } from '../events/events.constants.ts'
import { appendOrchestratorEvent } from './append-orchestrator-event.ts'
import { orchestratorPaths } from './orchestrator-paths.ts'
import { readOrchestratorLog } from './read-orchestrator-log.ts'

import { describe, expect, it } from 'vitest'

import type {
	OrchestratorEvent,
	OrchestratorPaths,
	OrchestratorState,
	OrchestratorWorkspace,
} from './orchestrator.types.ts'

type AppendCase = { paths: OrchestratorPaths; stateHome: string }
type RefusalView = {
	isError: boolean
	name: string
	code: unknown
	field: unknown
	message: string
}

const PRIOR: OrchestratorEvent = {
	schema: 1,
	id: 'event-prior',
	at: '2026-11-26T09:00:00.000Z',
	kind: 'station',
	subject: 'lot-prior',
	facts: { state: 'ready' },
}

const EVENT: OrchestratorEvent = {
	schema: 1,
	id: 'event-a',
	at: '2026-11-26T09:01:00.000Z',
	kind: 'station',
	subject: 'lot-a',
	facts: { state: 'working' },
}

/** An event missing its id and over the line limit: its check must refuse it before the limit does. */
const INVALID_EVENT = Object.fromEntries(
	Object.entries({ ...EVENT, facts: { note: 'x'.repeat(EVENT_LINE_LIMIT) } }).filter(
		([key]) => key !== 'id',
	),
) as unknown as OrchestratorEvent

function wholeState(workspace: OrchestratorWorkspace): OrchestratorState {
	return {
		schema: 1,
		workspace,
		updatedAt: '2026-11-26T09:00:00.000Z',
		lanes: [
			{
				name: 'cli',
				repos: ['cli'],
				holds: [],
				owns: [],
				mode: 'running',
				plan: './plan.md',
				queue: [],
			},
		],
		lots: [],
		runs: [],
		runners: [],
		held: [],
		waitingOnYou: [],
		prs: [],
		next: [],
		seen: [],
	}
}

/** The render of `wholeState` with `recent` as its Recent lines. */
function renderWith(recent: readonly string[]): string {
	return `Status: 0 runs, 0 waiting, 0 next

## Waiting on you
none

## Runners
none

## Lanes
- cli: repos=cli; holds=none; owns=none; mode=running; plan=./plan.md; queue=none

## Lots in flight
none

## Held
none

## Next
none

## Recent
${recent.length === 0 ? 'none' : recent.join('\n')}
`
}

const PRIOR_LINE = '- 2026-11-26T09:00:00.000Z station lot-prior event-prior {"state":"ready"}'
const EVENT_LINE = '- 2026-11-26T09:01:00.000Z station lot-a event-a {"state":"working"}'

/** Paths below a temporary state home, with an explicit temporary home; nothing written yet. */
function appendCase(): AppendCase {
	const root = temporaryFolder('dialecte-orchestrator-append-')
	const workspace = join(root, 'workspace')
	const stateHome = join(root, 'state-home')
	mkdirSync(workspace)
	const paths = orchestratorPaths({
		workspace,
		environment: { XDG_STATE_HOME: stateHome },
		home: join(root, 'home'),
	})
	return { paths, stateHome }
}

/** `appendCase` with `state` written as state.json, and the log and render given. */
function storedCase(params: {
	state?: (workspace: OrchestratorWorkspace) => unknown
	log?: string
	render?: string
}): AppendCase {
	const testCase = appendCase()
	const { paths } = testCase
	mkdirSync(paths.folder, { recursive: true })
	const state = (params.state ?? wholeState)(paths.workspace)
	writeFileSync(paths.state, `${JSON.stringify(state, null, 2)}\n`)
	if (params.log !== undefined) writeFileSync(paths.log, params.log)
	if (params.render !== undefined) writeFileSync(paths.render, params.render)
	return testCase
}

/** The text of `path`, or why it cannot be read (so a missing file fails on the assertion, not on a throw). */
function textAt(path: string): string {
	try {
		return readFileSync(path, 'utf8')
	} catch (error) {
		return `unreadable: ${error instanceof Error ? error.message : String(error)}`
	}
}

/** The refusal of an append: whether it is an Error, its name, code, field and message; undefined when it appended. */
function refusalOf(params: {
	paths: OrchestratorPaths
	event: OrchestratorEvent
}): RefusalView | undefined {
	try {
		appendOrchestratorEvent(params)
		return undefined
	} catch (error) {
		const fault = error as { code?: unknown; field?: unknown }
		return {
			isError: error instanceof Error,
			name: error instanceof Error ? error.name : typeof error,
			code: fault.code,
			field: fault.field,
			message: error instanceof Error ? error.message : String(error),
		}
	}
}

describe('appendOrchestratorEvent, refusals in order, each writing nothing', function appendorchestratoreventRefusalsInOrderEach() {
	const CASES: Record<string, () => void> = {
		'state.json missing (and an invalid event) -> state-missing, no field, no folder created':
			function stateJsonMissingAndAn() {
				const { paths, stateHome } = appendCase()

				const refusal = refusalOf({ paths, event: INVALID_EVENT })

				expect({
					code: refusal?.code,
					field: refusal?.field,
					after: snapshotOf(stateHome),
				}).toEqual({ code: 'state-missing', field: undefined, after: {} })
			},
		'state.json a directory (and an invalid event) -> state-unreadable, no field, nothing written':
			function stateJsonADirectoryAnd() {
				const { paths, stateHome } = appendCase()
				mkdirSync(paths.state, { recursive: true })
				writeFileSync(paths.log, `${JSON.stringify(PRIOR)}\n`)
				const before = snapshotOf(stateHome)

				const refusal = refusalOf({ paths, event: INVALID_EVENT })

				expect({
					code: refusal?.code,
					field: refusal?.field,
					after: snapshotOf(stateHome),
				}).toEqual({ code: 'state-unreadable', field: undefined, after: before })
			},
		'state.json without updatedAt (and an invalid event) -> state-invalid, the parser field and message after "state.json: "':
			function stateJsonWithoutUpdatedatAnd() {
				const { paths, stateHome } = storedCase({
					state: (workspace) =>
						Object.fromEntries(
							Object.entries(wholeState(workspace)).filter(([key]) => key !== 'updatedAt'),
						),
					log: `${JSON.stringify(PRIOR)}\n`,
					render: 'old render\n',
				})
				const before = snapshotOf(stateHome)

				expect({
					refusal: refusalOf({ paths, event: INVALID_EVENT }),
					after: snapshotOf(stateHome),
				}).toEqual({
					refusal: {
						isError: true,
						name: 'OrchestratorFault',
						code: 'state-invalid',
						field: 'updatedAt',
						message: 'state.json: updatedAt: expected string',
					},
					after: before,
				})
			},
		'state.json of another workspace root (and an invalid event) -> workspace-mismatch, no field, exact message':
			function stateJsonOfAnotherWorkspace() {
				const { paths, stateHome } = storedCase({
					state: (workspace) => wholeState({ ...workspace, root: `${workspace.root}-other` }),
					log: `${JSON.stringify(PRIOR)}\n`,
					render: 'old render\n',
				})
				const before = snapshotOf(stateHome)

				expect({
					refusal: refusalOf({ paths, event: INVALID_EVENT }),
					after: snapshotOf(stateHome),
				}).toEqual({
					refusal: {
						isError: true,
						name: 'OrchestratorFault',
						code: 'workspace-mismatch',
						field: undefined,
						message: `state.workspace.root must equal selected workspace root ${paths.workspace.root}`,
					},
					after: before,
				})
			},
		'state.json of another workspace key (and an invalid event) -> workspace-mismatch, no field, exact message':
			function stateJsonOfAnotherWorkspace2() {
				const { paths, stateHome } = storedCase({
					state: (workspace) => wholeState({ ...workspace, key: `${workspace.key}-other` }),
					log: `${JSON.stringify(PRIOR)}\n`,
					render: 'old render\n',
				})
				const before = snapshotOf(stateHome)

				expect({
					refusal: refusalOf({ paths, event: INVALID_EVENT }),
					after: snapshotOf(stateHome),
				}).toEqual({
					refusal: {
						isError: true,
						name: 'OrchestratorFault',
						code: 'workspace-mismatch',
						field: undefined,
						message: `state.workspace.key must equal selected workspace key ${paths.workspace.key}`,
					},
					after: before,
				})
			},
		'event without id and over the line limit -> event-invalid before the limit, the parser field and message after "event: "':
			function eventWithoutIdAndOver() {
				const { paths, stateHome } = storedCase({
					log: `${JSON.stringify(PRIOR)}\n`,
					render: 'old render\n',
				})
				const before = snapshotOf(stateHome)

				expect({
					refusal: refusalOf({ paths, event: INVALID_EVENT }),
					after: snapshotOf(stateHome),
				}).toEqual({
					refusal: {
						isError: true,
						name: 'OrchestratorFault',
						code: 'event-invalid',
						field: 'id',
						message: 'event: id: expected string',
					},
					after: before,
				})
			},
		'valid event over the 4 KiB line limit -> the exact limit message, nothing written':
			function validEventOverTheKib() {
				const { paths, stateHome } = storedCase({
					log: `${JSON.stringify(PRIOR)}\n`,
					render: 'old render\n',
				})
				const event: OrchestratorEvent = { ...EVENT, facts: { note: 'x'.repeat(EVENT_LINE_LIMIT) } }
				const bytes = Buffer.byteLength(`${JSON.stringify(event)}\n`, 'utf8')
				const before = snapshotOf(stateHome)

				expect({
					message: refusalOf({ paths, event })?.message,
					after: snapshotOf(stateHome),
				}).toEqual({
					message: `event line of ${String(bytes)} bytes is over the limit of ${String(EVENT_LINE_LIMIT)} bytes`,
					after: before,
				})
			},
	}

	it.each(Object.entries(CASES))('%s', function runsCase(_title, run) {
		run()
	})
})

describe('appendOrchestratorEvent, the append', function appendorchestratoreventTheAppend() {
	const CASES: Record<string, () => void> = {
		'a log ending in a newline and a stale render -> the line appended as is, STATE.md rendered from state.json on disk':
			function aLogEndingInA() {
				const { paths } = storedCase({
					log: `${JSON.stringify(PRIOR)}\n`,
					render: 'stale render\n',
				})

				expect({
					refusal: refusalOf({ paths, event: EVENT }),
					log: textAt(paths.log),
					render: textAt(paths.render),
				}).toEqual({
					refusal: undefined,
					log: `${JSON.stringify(PRIOR)}\n${JSON.stringify(EVENT)}\n`,
					render: renderWith([PRIOR_LINE, EVENT_LINE]),
				})
			},
		'no log yet -> a log of the one line, STATE.md rendered with it': function noLogYetALog() {
			const { paths } = storedCase({})

			expect({
				refusal: refusalOf({ paths, event: EVENT }),
				log: textAt(paths.log),
				render: textAt(paths.render),
			}).toEqual({
				refusal: undefined,
				log: `${JSON.stringify(EVENT)}\n`,
				render: renderWith([EVENT_LINE]),
			})
		},
		'a torn tail then an append -> the torn bytes sealed, the earlier record and the new one, one skipped, nothing damaged':
			function aTornTailThenAn() {
				const torn = '{"schema":1,"id":"event-'
				const { paths } = storedCase({ log: `${JSON.stringify(PRIOR)}\n${torn}` })

				expect({
					refusal: refusalOf({ paths, event: EVENT }),
					log: textAt(paths.log),
					reading: readOrchestratorLog({ path: paths.log }),
					render: textAt(paths.render),
				}).toEqual({
					refusal: undefined,
					log: `${JSON.stringify(PRIOR)}\n${torn}\n${JSON.stringify(EVENT)}\n`,
					reading: { records: [PRIOR, EVENT], damaged: 0, skipped: 1 },
					render: renderWith([PRIOR_LINE, EVENT_LINE]),
				})
			},
		'a log of torn bytes only then an append -> the new record, one skipped, nothing damaged':
			function aLogOfTornBytes() {
				const torn = '{"schema":1,"id":"event-'
				const { paths } = storedCase({ log: torn })

				expect({
					refusal: refusalOf({ paths, event: EVENT }),
					log: textAt(paths.log),
					reading: readOrchestratorLog({ path: paths.log }),
					render: textAt(paths.render),
				}).toEqual({
					refusal: undefined,
					log: `${torn}\n${JSON.stringify(EVENT)}\n`,
					reading: { records: [EVENT], damaged: 0, skipped: 1 },
					render: renderWith([EVENT_LINE]),
				})
			},
		'the same event appended twice -> two records, nothing damaged, nothing skipped':
			function theSameEventAppendedTwice() {
				const { paths } = storedCase({})

				expect({
					first: refusalOf({ paths, event: EVENT }),
					second: refusalOf({ paths, event: EVENT }),
					reading: readOrchestratorLog({ path: paths.log }),
				}).toEqual({
					first: undefined,
					second: undefined,
					reading: { records: [EVENT, EVENT], damaged: 0, skipped: 0 },
				})
			},
	}

	it.each(Object.entries(CASES))('%s', function runsCase(_title, run) {
		run()
	})
})
