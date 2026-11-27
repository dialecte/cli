import { readFileSync } from 'node:fs'

import { OrchestratorFault } from './orchestrator-fault.ts'
import { orchestratorReadFailure } from './orchestrator-read-failure.ts'
import { orchestratorWorkspaceMismatch } from './orchestrator-workspace.ts'
import { parseStateJson } from './parse-state-json.ts'

import type { OrchestratorPaths, OrchestratorState } from './orchestrator.types.ts'

/**
 * The state `state.json` holds for the selected workspace, read from disk; an `OrchestratorFault` otherwise:
 * `state-missing`, `state-unreadable`, `state-invalid` (the parser's field and message, after `state.json: `) or
 * `workspace-mismatch` (a state of another workspace root or key).
 */
export function loadOrchestratorState(params: { paths: OrchestratorPaths }): OrchestratorState {
	const text = stateText({ path: params.paths.state })
	const state = parseStateJson({ text })
	const mismatch = orchestratorWorkspaceMismatch({ state, selected: params.paths.workspace })
	if (mismatch !== undefined)
		throw new OrchestratorFault({ code: 'workspace-mismatch', message: mismatch })
	return state
}

function stateText(params: { path: string }): string {
	try {
		return readFileSync(params.path, 'utf8')
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT')
			throw new OrchestratorFault({ code: 'state-missing', message: 'state.json: missing' })
		throw new OrchestratorFault({
			code: 'state-unreadable',
			message: `state.json: ${orchestratorReadFailure(error)}`,
		})
	}
}
