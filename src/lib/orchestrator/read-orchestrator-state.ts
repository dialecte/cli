import { readFileSync } from 'node:fs'

import { loadOrchestratorState } from './load-orchestrator-state.ts'
import { OrchestratorFault } from './orchestrator-fault.ts'
import { orchestratorReadFailure } from './orchestrator-read-failure.ts'
import { readOrchestratorLog } from './read-orchestrator-log.ts'
import { renderOrchestratorState } from './render-orchestrator-state.ts'

import type {
	OrchestratorDamage,
	OrchestratorDamageCode,
	OrchestratorFaultCode,
	OrchestratorNote,
	OrchestratorPaths,
	OrchestratorState,
	ReadOrchestratorLogResult,
	ReadOrchestratorStateParams,
	ReadOrchestratorStateResult,
} from './orchestrator.types.ts'

/**
 * What the orchestrator folder holds for the selected workspace, read only: the state of `state.json` (null when it is
 * missing, unreadable, invalid or of another workspace), the log's valid records, the damage (`state-*`,
 * `workspace-mismatch`, `log-damaged`, `log-unreadable`) and the notes (a missing, stale or unreadable `STATE.md`, the
 * skipped log lines). `STATE.md` is only a render of `state.json`, so its faults are notes, never damage; nothing is
 * noted when no state was read.
 */
export function readOrchestratorState(
	params: ReadOrchestratorStateParams,
): ReadOrchestratorStateResult {
	const loaded = loadedState({ paths: params.paths })
	if ('damage' in loaded) return { state: null, records: [], damage: [loaded.damage], notes: [] }
	const { state } = loaded
	let log: ReadOrchestratorLogResult
	try {
		log = readOrchestratorLog({ path: params.paths.log })
	} catch (error) {
		return {
			state,
			records: [],
			damage: [
				{
					source: 'log',
					code: 'log-unreadable',
					message: `log.jsonl: ${orchestratorReadFailure(error)}`,
				},
			],
			notes: [],
		}
	}
	const damage: OrchestratorDamage[] =
		log.damaged === 0
			? []
			: [
					{
						source: 'log',
						code: 'log-damaged',
						message: `log.jsonl: ${String(log.damaged)} damaged ${log.damaged === 1 ? 'record' : 'records'}`,
					},
				]
	const renderNote = renderNoteOf({ paths: params.paths, state, log })
	const skippedNote: OrchestratorNote[] =
		log.skipped === 0
			? []
			: [
					{
						source: 'log',
						code: 'log-skipped',
						message: `log.jsonl: ${String(log.skipped)} unreadable ${log.skipped === 1 ? 'line' : 'lines'} skipped`,
					},
				]
	return {
		state,
		records: log.records,
		damage,
		notes: [...(renderNote === undefined ? [] : [renderNote]), ...skippedNote],
	}
}

/** The state of `state.json`, or its damage row (a workspace mismatch named after `state.json: ` like the others). */
function loadedState(params: {
	paths: OrchestratorPaths
}): { state: OrchestratorState } | { damage: OrchestratorDamage } {
	try {
		return { state: loadOrchestratorState(params) }
	} catch (error) {
		if (!(error instanceof OrchestratorFault)) throw error
		const code = stateDamageCodeOf(error.code)
		const message = code === 'workspace-mismatch' ? `state.json: ${error.message}` : error.message
		return { damage: { source: 'state', code, message } }
	}
}

/** The note on `STATE.md` against the render of the state and the log's records; none when it is that render. */
function renderNoteOf(params: {
	paths: OrchestratorPaths
	state: OrchestratorState
	log: ReadOrchestratorLogResult
}): OrchestratorNote | undefined {
	let text: string
	try {
		text = readFileSync(params.paths.render, 'utf8')
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT')
			return { source: 'render', code: 'render-missing', message: 'STATE.md: missing' }
		return {
			source: 'render',
			code: 'render-unreadable',
			message: `STATE.md: ${orchestratorReadFailure(error)}`,
		}
	}
	if (text === renderOrchestratorState({ state: params.state, records: params.log.records }))
		return undefined
	return {
		source: 'render',
		code: 'render-stale',
		message: 'STATE.md is stale for state.json and log.jsonl',
	}
}

// dialecte-allow duplicate-read: this narrows an orchestrator fault code, not a lot state
/** The damage code of a fault `loadOrchestratorState` throws: its four codes are damage codes as they are. */
function stateDamageCodeOf(code: OrchestratorFaultCode): OrchestratorDamageCode {
	if (
		code === 'state-missing' ||
		code === 'state-unreadable' ||
		code === 'state-invalid' ||
		code === 'workspace-mismatch'
	)
		return code
	throw new Error(`state.json: unexpected fault ${code}`)
}
