/** Shared by the ask events' tests: an envelope, an outcome built by hand, the fields of an event beside its envelope. */
import { makeEnvelope } from '../src/lib/events/write-event.ts'
import {
	ENVELOPE_KEYS,
	EVENT_CLI,
	EVENT_NOW,
	EVENT_PID,
	SECRET_QUESTION,
} from './ask-events-fixtures.constants.ts'
import { requestOf } from './ask-ladder-fixtures.ts'

import type { LotEvent } from '../src/lib/events/event.types.ts'
import type { AskOutcome, AskRequest } from '../src/lib/knowledge/ask/ask.types.ts'

/** The envelope of an ask event of `kind`, its clock and process id fixed. */
export function askEnvelope(params: { kind: string; lot: string | null }): LotEvent {
	return makeEnvelope({
		lot: params.lot,
		kind: params.kind,
		by: 'cli',
		cli: EVENT_CLI,
		simulated: false,
		hostEvent: null,
		now: () => EVENT_NOW,
		pid: EVENT_PID,
	})
}

/** The members of an event beside its envelope. */
export function fieldsOf(event: LotEvent): Record<string, unknown> {
	return Object.fromEntries(
		Object.entries(event).filter(([key]) => !(ENVELOPE_KEYS as readonly string[]).includes(key)),
	)
}

/** The request of the events' cases: the question no event may hold. */
export function secretRequestOf(changes: Partial<AskRequest> = {}): AskRequest {
	return requestOf({ question: SECRET_QUESTION, ...changes })
}

/** An answered rung-1 outcome about `AA_1`; `changes` replace members whole. */
export function outcomeOf(changes: Partial<AskOutcome> = {}): AskOutcome {
	return {
		subject: {
			package: '@dialecte/core-test',
			tags: [{ tag: 'AA_1', parent: 'A' }],
			attributes: ['a'],
			codes: [],
			methods: [],
		},
		kind: 'children',
		decision: false,
		context: {
			package: '@dialecte/core-test',
			tags: [
				{
					tag: 'AA_1',
					parent: 'A',
					declarations: 1,
					resolved: true,
					packages: ['@dialecte/core-test'],
				},
			],
			resolved: true,
			decision: false,
		},
		rung: 1,
		state: 'answered',
		answer: { verdict: 'value', value: 'AAA_1', text: 'AA_1 may hold AAA_1.' },
		fact: null,
		candidates: [],
		methods: [],
		angles: [],
		slices: [],
		source: null,
		boundary: null,
		conflict: null,
		...changes,
	}
}
