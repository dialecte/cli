import { makeEnvelope } from '../../events/write-event.ts'
import { readCliVersion } from '../../read-cli-version.ts'
import { ASK_EVENT_KINDS } from './ask.constants.ts'

import type { LotEvent } from '../../events/event.types.ts'
import type { AskStateEventOfParams } from './ask.types.ts'

/**
 * The `ask.state` event of a verdict (D6): the ask, its state after the round, the rung (4 readers, 5 the
 * adjudicator) and whether a standard-vs-XSD conflict was flagged (D29: never what it named, nor any answer).
 */
export function askStateEventOf(params: AskStateEventOfParams): LotEvent {
	return {
		...makeEnvelope({
			lot: params.lot,
			kind: ASK_EVENT_KINDS.state,
			by: 'cli',
			cli: readCliVersion(),
			simulated: false,
			hostEvent: null,
			now: params.now,
		}),
		ask: params.ask,
		state: params.state,
		rung: params.rung,
		conflict: params.conflict,
	}
}
