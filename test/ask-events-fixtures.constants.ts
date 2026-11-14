/** Constants of the ask events' tests: the clock, the envelope's members, the oversized event. */

/** The clock and the process id of the events the cases build. */
export const EVENT_NOW = new Date('2026-11-13T10:00:00.000Z')
export const EVENT_PID = 4242
export const EVENT_CLI = '0.0.0-test'

/** The members every event line carries (`makeEnvelope`'s); the rest are the kind's own fields. */
export const ENVELOPE_KEYS = [
	'schema',
	'id',
	'at',
	'lot',
	'kind',
	'by',
	'pid',
	'cli',
	'simulated',
	'hostEvent',
] as const

/** How many fields of how many characters make an event no cut brings under the line limit. */
export const OVERSIZED_FIELD_COUNT = 80
export const OVERSIZED_FIELD_LENGTH = 100

/** A string longer than the cut limit of a string, and its length after the cut. */
export const LONG_STRING_LENGTH = 450

/** A question and its words, which no event may hold; a slice's text likewise. */
export const SECRET_QUESTION = 'Does the zorbit element tolerate quuxness?'
export const SECRET_WORDS = ['zorbit', 'quuxness'] as const

/** The ask id and the lot name of the cases. */
export const EVENT_ASK = 'A-0001'
export const EVENT_LOT = '0001-repo-branch'

/** The fact ids of the cases. */
export const HIT_FACT = 'F-0001'
export const NEW_FACT = 'F-0002'
export const CANDIDATE_FACT = 'F-0003'
export const STALE_CANDIDATE_FACT = 'F-0004'
