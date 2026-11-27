import type { OrchestratorState, OrchestratorWorkspace } from './orchestrator.types.ts'

/** Why a state belongs to another workspace than the selected one (its root, then its key); undefined when it does not. */
export function orchestratorWorkspaceMismatch(params: {
	state: OrchestratorState
	selected: OrchestratorWorkspace
}): string | undefined {
	if (params.state.workspace.root !== params.selected.root)
		return `state.workspace.root must equal selected workspace root ${params.selected.root}`
	if (params.state.workspace.key !== params.selected.key)
		return `state.workspace.key must equal selected workspace key ${params.selected.key}`
	return undefined
}
