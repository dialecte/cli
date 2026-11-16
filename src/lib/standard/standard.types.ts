import type { STANDARD_STATES } from './standard.constants.ts'

/** What a station recorded about the standard check, as `standard.json` holds it. */
export type StandardRecord = {
	state: (typeof STANDARD_STATES)[number]
	note: string
	at: string
	/** For `outside`: whether a person confirmed every outside answer (written by the ask; by hand it is false). */
	confirmed?: boolean
}
