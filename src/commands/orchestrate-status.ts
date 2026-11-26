import { readOrchestratorState } from '../lib/orchestrator/read-orchestrator-state.ts'
import { renderOrchestratorState } from '../lib/orchestrator/render-orchestrator-state.ts'
import { jsonOf, textOf } from '../lib/print/print.ts'

import type { CommandResult } from '../lib/command-result.types.ts'
import type { OrchestratorPaths } from '../lib/orchestrator/orchestrator.types.ts'
import type { OrchestrateStatusJson } from './orchestrate.types.ts'

/** The read-only status result for already resolved workspace paths. */
export function orchestrateStatus(params: {
	paths: OrchestratorPaths
	json: boolean
}): CommandResult {
	const reading = readOrchestratorState({ paths: params.paths })
	const missing =
		reading.state === null &&
		reading.damage.length === 1 &&
		reading.damage[0].source === 'state' &&
		reading.damage[0].message === 'state.json: missing'
	const outcome = missing ? 'missing' : reading.damage.length > 0 ? 'damaged' : 'present'
	const exitCode = outcome === 'present' ? 0 : 1
	const rendered =
		reading.state === null
			? undefined
			: renderOrchestratorState({ state: reading.state, records: reading.records })
	const statusLine =
		rendered?.split('\n')[0] ??
		`${missing ? 'no' : 'invalid'} orchestrator state for ${params.paths.workspace.key}`
	const status: OrchestrateStatusJson = {
		schema: 1,
		workspace: params.paths.workspace,
		outcome,
		state: reading.state,
		statusLine,
		damage: reading.damage,
	}
	const answer = outcome === 'present' ? {} : { answer: true as const }
	if (params.json) return { exitCode, output: jsonOf(status, 2), ...answer }
	if (missing) return { exitCode, output: textOf([statusLine]), ...answer }
	if (outcome !== 'present')
		return {
			exitCode,
			output: textOf(reading.damage.map((damage) => damage.message)),
			...answer,
		}
	if (rendered === undefined) throw new Error('present orchestrator state has no render')
	return { exitCode, output: textOf(rendered.slice(0, -1).split('\n')) }
}
