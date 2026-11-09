/** The time the stops of these tests act at, and the reason they give. */
export const STOP_NOW = new Date('2026-11-08T14:00:00.000Z')
export const STOP_REASON = 'the brief changed'

/** A live process's run marker needs a start time; any works. */
export const RUN_STARTED_AT = '2026-11-08T13:30:00.000Z'

/** The answered question a result case holds: what it asked, what was answered, and by whom. */
export const ANSWERED = {
	id: 'q1',
	text: 'One question, one line.',
	answer: 'fix',
	by: 'caller',
} as const
