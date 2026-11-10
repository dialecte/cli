import type { LotEvent } from '../lib/events/event.types.ts'
import type { StationRequest } from '../lib/events/station-event.types.ts'
import type { LotIdentity, LotStateName } from '../lib/store/store.types.ts'

/** What `lot station` is called with: the folder it runs in, its words, and the clock (injected by the tests only). */
export type LotStationParams = {
	cwd: string
	/** The words after `lot station`: `<id> start <station> ...`, `<id> end <station> ...` or `<id> --from <file>`. */
	argv: string[]
	now?: Date
}

/** What a call recorded: a new event or one already there, its run, the command to run next (an end's: none). */
export type StationOutcome = {
	recorded: 'new' | 'already'
	run: string
	next: string | null
	/** An end recorded with no start found (`started: null`). */
	alone: boolean
}

/** What deciding a call needs: the request, the lot and its state, the event it would write, the events in the file. */
export type StationCall = {
	request: StationRequest
	identity: LotIdentity
	state: LotStateName
	event: LotEvent
	events: LotEvent[]
}

/** A call decided: the event to write with its outcome, the outcome of one already there, or a refusal (exit 2). */
export type StationDecision =
	| { write: LotEvent; outcome: StationOutcome }
	| { outcome: StationOutcome }
	| { refusal: string }
