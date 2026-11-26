import type { OrchestratorFaultCode, OrchestratorFaultParams } from './orchestrator.types.ts'

/**
 * What the orchestrator's parsers and its append refuse: an Error whose `code` says what is wrong and whose `field`
 * names the first broken field (undefined when no field is to blame), so a caller decides on the code, never on the
 * message text.
 */
export class OrchestratorFault extends Error {
	override name = 'OrchestratorFault'
	readonly code: OrchestratorFaultCode
	readonly field: string | undefined

	constructor(params: OrchestratorFaultParams) {
		super(params.message)
		this.code = params.code
		this.field = params.field
	}
}
