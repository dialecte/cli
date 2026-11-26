import { OrchestratorFault } from './orchestrator-fault.ts'
import { parseOrchestratorState } from './parse-orchestrator-state.ts'

import type { OrchestratorState, ParseOrchestratorStateParams } from './orchestrator.types.ts'

/**
 * The state of a `state.json` text, or a `state-invalid` fault keeping the parser's field and its message after
 * `state.json: `: the one refusal of a state the reader, the append and the writer cannot parse.
 */
export function parseStateJson(params: ParseOrchestratorStateParams): OrchestratorState {
	try {
		return parseOrchestratorState(params)
	} catch (error) {
		if (!(error instanceof OrchestratorFault)) throw error
		throw new OrchestratorFault({
			code: 'state-invalid',
			field: error.field,
			message: `state.json: ${error.message}`,
		})
	}
}
