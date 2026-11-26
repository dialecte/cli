import { readOrchestratorState } from '../lib/orchestrator/read-orchestrator-state.ts'
import { renderOrchestratorState } from '../lib/orchestrator/render-orchestrator-state.ts'
import { jsonOf, textOf } from '../lib/print/print.ts'

import type { CommandResult } from '../lib/command-result.types.ts'
import type {
	OrchestratorDamageCode,
	OrchestratorPaths,
} from '../lib/orchestrator/orchestrator.types.ts'
import type { OrchestrateStatusJson, OrchestrateStatusOutcome } from './orchestrate.types.ts'

/**
 * The read-only status of resolved workspace paths: `present` (exit 0, notes included), `missing` (exit 1, only
 * `state-missing`) or `damaged` (exit 1), decided on the damage codes alone. JSON prints the versioned status; text
 * prints the render of a parsed state, then a `damage: ` line per damage row and a `note: ` line per note, or without a
 * parsed state the status line (missing) or the damage lines.
 */
export function orchestrateStatus(params: {
	paths: OrchestratorPaths
	json: boolean
}): CommandResult {
	const reading = readOrchestratorState({ paths: params.paths })
	const outcome = outcomeOf({ codes: reading.damage.map((damage) => damage.code) })
	const exitCode = outcome === 'present' ? 0 : 1
	const rendered =
		reading.state === null
			? undefined
			: renderOrchestratorState({ state: reading.state, records: reading.records })
	const statusLine =
		rendered?.split('\n')[0] ??
		statusLineWithoutState({ code: reading.damage[0]?.code, key: params.paths.workspace.key })
	const status: OrchestrateStatusJson = {
		schema: 1,
		workspace: params.paths.workspace,
		outcome,
		state: reading.state,
		statusLine,
		damage: reading.damage,
		notes: reading.notes,
	}
	const answer = outcome === 'present' ? {} : { answer: true as const }
	if (params.json) return { exitCode, output: jsonOf(status, 2), ...answer }
	if (rendered === undefined) {
		const lines =
			outcome === 'missing' ? [statusLine] : reading.damage.map((damage) => damage.message)
		return { exitCode, output: textOf(lines), ...answer }
	}
	const lines = [
		...rendered.slice(0, -1).split('\n'),
		...reading.damage.map((damage) => `damage: ${damage.message}`),
		...reading.notes.map((note) => `note: ${note.message}`),
	]
	return { exitCode, output: textOf(lines), ...answer }
}

/** `missing` when the only damage is a missing state.json, `damaged` for any other damage, else `present`. */
function outcomeOf(params: { codes: readonly OrchestratorDamageCode[] }): OrchestrateStatusOutcome {
	if (params.codes.length === 0) return 'present'
	if (params.codes.length === 1 && params.codes[0] === 'state-missing') return 'missing'
	return 'damaged'
}

/** The status line when no state was parsed, after the first damage code: missing, invalid, unreadable, another workspace. */
function statusLineWithoutState(params: {
	code: OrchestratorDamageCode | undefined
	key: string
}): string {
	if (params.code === 'state-missing') return `no orchestrator state for ${params.key}`
	if (params.code === 'state-unreadable') return `unreadable orchestrator state for ${params.key}`
	if (params.code === 'workspace-mismatch')
		return `orchestrator state of another workspace for ${params.key}`
	return `invalid orchestrator state for ${params.key}`
}
