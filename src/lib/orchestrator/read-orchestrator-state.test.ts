import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { temporaryFolder } from '../../../test/scratch-repository.ts'
import { orchestratorPaths } from './orchestrator-paths.ts'
import { readOrchestratorState } from './read-orchestrator-state.ts'

import { describe, expect, it } from 'vitest'

import type {
	OrchestratorEvent,
	OrchestratorPaths,
	OrchestratorState,
	OrchestratorWorkspace,
} from './orchestrator.types.ts'

type StoredFiles = {
	/** The state.json text, or a directory in its place; none when absent. */
	state?: string | { directory: true }
	log?: string | { directory: true }
	render?: string | { directory: true }
}

const EVENT: OrchestratorEvent = {
	schema: 1,
	id: 'event-a',
	at: '2026-11-26T09:01:00.000Z',
	kind: 'station',
	subject: 'lot-a',
	facts: { state: 'working' },
}

function emptyState(workspace: OrchestratorWorkspace): OrchestratorState {
	return {
		schema: 1,
		workspace,
		updatedAt: '2026-11-26T09:00:00.000Z',
		lanes: [],
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

/** The render of `emptyState` with `recent` as its Recent lines. */
function renderWith(recent: readonly string[]): string {
	return `Status: 0 runs, 0 waiting, 0 next

## Waiting on you
none

## Runners
none

## Lanes
none

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

const EVENT_LINE = '- 2026-11-26T09:01:00.000Z station lot-a event-a {"state":"working"}'

/** Orchestrator paths below a temporary state home, with an explicit temporary home. */
function casePaths(): OrchestratorPaths {
	const root = temporaryFolder('dialecte-orchestrator-read-state-')
	const workspace = join(root, 'workspace')
	mkdirSync(workspace)
	return orchestratorPaths({
		workspace,
		environment: { XDG_STATE_HOME: join(root, 'state-home') },
		home: join(root, 'home'),
	})
}

function writeEntry(params: {
	path: string
	entry: string | { directory: true } | undefined
}): void {
	if (params.entry === undefined) return
	if (typeof params.entry === 'string') writeFileSync(params.path, params.entry)
	else mkdirSync(params.path)
}

/** The reading of the folder holding `files`, or what the reader threw. */
function readingOf(params: { paths: OrchestratorPaths; files: StoredFiles }): unknown {
	const { paths, files } = params
	mkdirSync(paths.folder, { recursive: true })
	writeEntry({ path: paths.state, entry: files.state })
	writeEntry({ path: paths.log, entry: files.log })
	writeEntry({ path: paths.render, entry: files.render })
	try {
		return readOrchestratorState({ paths })
	} catch (error) {
		return { thrown: error instanceof Error ? error.message : String(error) }
	}
}

function stateText(state: unknown): string {
	return `${JSON.stringify(state, null, 2)}\n`
}

describe('readOrchestratorState', function readorchestratorstate() {
	const CASES: Record<
		string,
		(paths: OrchestratorPaths) => { files: StoredFiles; expected: unknown }
	> = {
		'valid state, its exact render and no log -> the state, no damage, no note':
			function validStateItsExactRender(paths) {
				return {
					files: { state: stateText(emptyState(paths.workspace)), render: renderWith([]) },
					expected: { state: emptyState(paths.workspace), records: [], damage: [], notes: [] },
				}
			},
		'valid state with stale STATE.md -> the state, a render-stale note, no damage':
			function validStateWithStaleState(paths) {
				return {
					files: { state: stateText(emptyState(paths.workspace)), render: 'stale render\n' },
					expected: {
						state: emptyState(paths.workspace),
						records: [],
						damage: [],
						notes: [
							{
								source: 'render',
								code: 'render-stale',
								message: 'STATE.md is stale for state.json and log.jsonl',
							},
						],
					},
				}
			},
		'valid state without STATE.md -> the state, a render-missing note, no damage':
			function validStateWithoutStateMd(paths) {
				return {
					files: { state: stateText(emptyState(paths.workspace)) },
					expected: {
						state: emptyState(paths.workspace),
						records: [],
						damage: [],
						notes: [{ source: 'render', code: 'render-missing', message: 'STATE.md: missing' }],
					},
				}
			},
		'valid state with a directory at STATE.md -> the state, a render-unreadable note, no damage':
			function validStateWithADirectory(paths) {
				return {
					files: { state: stateText(emptyState(paths.workspace)), render: { directory: true } },
					expected: {
						state: emptyState(paths.workspace),
						records: [],
						damage: [],
						notes: [
							{ source: 'render', code: 'render-unreadable', message: 'STATE.md: is a directory' },
						],
					},
				}
			},
		'valid state, a sealed torn line before a valid one, exact render -> the record, a log-skipped note of one line':
			function validStateASealedTorn(paths) {
				return {
					files: {
						state: stateText(emptyState(paths.workspace)),
						log: `{"schema":1,"id":"event-\n${JSON.stringify(EVENT)}\n`,
						render: renderWith([EVENT_LINE]),
					},
					expected: {
						state: emptyState(paths.workspace),
						records: [EVENT],
						damage: [],
						notes: [
							{
								source: 'log',
								code: 'log-skipped',
								message: 'log.jsonl: 1 unreadable line skipped',
							},
						],
					},
				}
			},
		'valid state, an empty line and a sealed torn line, exact render -> a log-skipped note of two lines':
			function validStateAnEmptyLine(paths) {
				return {
					files: {
						state: stateText(emptyState(paths.workspace)),
						log: `\n{"schema":1\n`,
						render: renderWith([]),
					},
					expected: {
						state: emptyState(paths.workspace),
						records: [],
						damage: [],
						notes: [
							{
								source: 'log',
								code: 'log-skipped',
								message: 'log.jsonl: 2 unreadable lines skipped',
							},
						],
					},
				}
			},
		'valid state, a valid line then a torn tail, exact render -> the record, log-damaged damage, no note':
			function validStateAValidLine(paths) {
				return {
					files: {
						state: stateText(emptyState(paths.workspace)),
						log: `${JSON.stringify(EVENT)}\n{"schema":1,"id":"event-`,
						render: renderWith([EVENT_LINE]),
					},
					expected: {
						state: emptyState(paths.workspace),
						records: [EVENT],
						damage: [
							{ source: 'log', code: 'log-damaged', message: 'log.jsonl: 1 damaged record' },
						],
						notes: [],
					},
				}
			},
		'valid state, a directory at log.jsonl -> log-unreadable damage, the render not judged':
			function validStateADirectoryAt(paths) {
				return {
					files: {
						state: stateText(emptyState(paths.workspace)),
						log: { directory: true },
						render: 'stale render\n',
					},
					expected: {
						state: emptyState(paths.workspace),
						records: [],
						damage: [
							{ source: 'log', code: 'log-unreadable', message: 'log.jsonl: is a directory' },
						],
						notes: [],
					},
				}
			},
		'state.json without updatedAt -> state-invalid damage with the parser message, no note, no fallback':
			function stateJsonWithoutUpdatedatState(paths) {
				return {
					files: {
						state: stateText(
							Object.fromEntries(
								Object.entries(emptyState(paths.workspace)).filter(([key]) => key !== 'updatedAt'),
							),
						),
						log: { directory: true },
					},
					expected: {
						state: null,
						records: [],
						damage: [
							{
								source: 'state',
								code: 'state-invalid',
								message: 'state.json: updatedAt: expected string',
							},
						],
						notes: [],
					},
				}
			},
		'state.json not JSON -> state-invalid damage, no note': function stateJsonNotJsonState() {
			return {
				files: { state: '{"schema":1,\n' },
				expected: {
					state: null,
					records: [],
					damage: [{ source: 'state', code: 'state-invalid', message: 'state.json: invalid JSON' }],
					notes: [],
				},
			}
		},
		'a directory at state.json -> state-unreadable damage, no note':
			function aDirectoryAtStateJson() {
				return {
					files: { state: { directory: true } },
					expected: {
						state: null,
						records: [],
						damage: [
							{ source: 'state', code: 'state-unreadable', message: 'state.json: is a directory' },
						],
						notes: [],
					},
				}
			},
		'missing state with damaged log -> only state-missing damage, no note':
			function missingStateWithDamagedLog() {
				return {
					files: { log: { directory: true } },
					expected: {
						state: null,
						records: [],
						damage: [{ source: 'state', code: 'state-missing', message: 'state.json: missing' }],
						notes: [],
					},
				}
			},
		'state with another workspace root -> workspace-mismatch damage, no note, no support reads':
			function stateWithAnotherWorkspaceRoot(paths) {
				return {
					files: {
						state: stateText(
							emptyState({ root: `${paths.workspace.root}-other`, key: paths.workspace.key }),
						),
						log: { directory: true },
					},
					expected: {
						state: null,
						records: [],
						damage: [
							{
								source: 'state',
								code: 'workspace-mismatch',
								message: `state.json: state.workspace.root must equal selected workspace root ${paths.workspace.root}`,
							},
						],
						notes: [],
					},
				}
			},
		'state with another workspace key -> workspace-mismatch damage, no note, no support reads':
			function stateWithAnotherWorkspaceKey(paths) {
				return {
					files: {
						state: stateText(
							emptyState({ root: paths.workspace.root, key: 'other-workspace-key' }),
						),
						log: { directory: true },
					},
					expected: {
						state: null,
						records: [],
						damage: [
							{
								source: 'state',
								code: 'workspace-mismatch',
								message: `state.json: state.workspace.key must equal selected workspace key ${paths.workspace.key}`,
							},
						],
						notes: [],
					},
				}
			},
	}

	it.each(Object.entries(CASES))('%s', function checksCase(_title, build) {
		const paths = casePaths()
		const { files, expected } = build(paths)

		expect(readingOf({ paths, files })).toEqual(expected)
	})
})
