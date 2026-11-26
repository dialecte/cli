import { readFileSync } from 'node:fs'

import { orchestratorWorkspaceMismatch } from './orchestrator-workspace.ts'
import { parseOrchestratorState } from './parse-orchestrator-state.ts'
import { readOrchestratorLog } from './read-orchestrator-log.ts'
import { renderOrchestratorState } from './render-orchestrator-state.ts'

import type {
	OrchestratorDamage,
	ReadOrchestratorLogResult,
	ReadOrchestratorStateFileResult,
	ReadOrchestratorStateParams,
	ReadOrchestratorStateResult,
} from './orchestrator.types.ts'

export function readOrchestratorState(
	params: ReadOrchestratorStateParams,
): ReadOrchestratorStateResult {
	const read = readState({ path: params.paths.state })
	const damage: OrchestratorDamage[] = read.damage === undefined ? [] : [read.damage]
	const { state } = read
	if (state === null) return { state, records: [], damage }
	const mismatch = orchestratorWorkspaceMismatch({ state, selected: params.paths.workspace })
	if (mismatch !== undefined)
		return {
			state: null,
			records: [],
			damage: [{ source: 'state', message: `state.json: ${mismatch}` }],
		}
	const log = readLog({ path: params.paths.log })
	if (log.damage !== undefined) damage.push(log.damage)
	else if (log.result.damaged > 0)
		damage.push({
			source: 'log',
			message: `log.jsonl: ${String(log.result.damaged)} damaged ${log.result.damaged === 1 ? 'record' : 'records'}`,
		})
	const records = log.result.records
	if (log.damage === undefined) {
		const expected = renderOrchestratorState({ state, records })
		const render = readRender({ path: params.paths.render })
		if (render.damage !== undefined) damage.push(render.damage)
		else if (render.text !== expected)
			damage.push({
				source: 'render',
				message: 'STATE.md is stale for state.json and log.jsonl',
			})
	}
	return { state, records, damage }
}

function readState(params: { path: string }): ReadOrchestratorStateFileResult {
	let text: string
	try {
		text = readFileSync(params.path, 'utf8')
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT')
			return {
				state: null,
				damage: { source: 'state', message: 'state.json: missing' },
			}
		return {
			state: null,
			damage: { source: 'state', message: `state.json: ${(error as Error).message}` },
		}
	}
	try {
		return { state: parseOrchestratorState({ text }) }
	} catch (error) {
		return {
			state: null,
			damage: { source: 'state', message: `state.json: ${(error as Error).message}` },
		}
	}
}

function readLog(params: { path: string }): {
	result: ReadOrchestratorLogResult
	damage?: OrchestratorDamage
} {
	try {
		return { result: readOrchestratorLog({ path: params.path }) }
	} catch (error) {
		return {
			result: { records: [], damaged: 0 },
			damage: supportDamage({ source: 'log', name: 'log.jsonl', error }),
		}
	}
}

function readRender(params: { path: string }): { text?: string; damage?: OrchestratorDamage } {
	try {
		return { text: readFileSync(params.path, 'utf8') }
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {}
		return {
			damage: supportDamage({ source: 'render', name: 'STATE.md', error }),
		}
	}
}

function supportDamage(params: {
	source: OrchestratorDamage['source']
	name: string
	error: unknown
}): OrchestratorDamage {
	const code = (params.error as NodeJS.ErrnoException).code
	const message =
		code === 'EISDIR'
			? 'is a directory'
			: params.error instanceof Error
				? params.error.message
				: String(params.error)
	return { source: params.source, message: `${params.name}: ${message}` }
}
