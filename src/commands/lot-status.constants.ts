import type { NextCheckName, NextStationKind } from '../lib/store/next-station.types.ts'

/** The flags `lot status` takes, without the dashes. */
export const STATUS_FLAGS: readonly string[] = ['json']

/** Why `lot status` is a usage error: `{extra}` the words beyond the id. */
export const STATUS_USAGE_REASONS = {
	noId: 'lot status takes one id: none given',
	extra: 'lot status takes one id, not also {extra}',
} as const

/** The most lines the text form of `lot status` prints. */
export const STATUS_MAX_LINES = 5

/**
 * The parts of the text form's station line (33L1 D20.2): `station <what> · round <r|->/<cap|-> · effort <level|->`;
 * a station to run is named `<station> step <k> of <n>`, `<station> round <r>` or `<station>`.
 */
export const STATION_LINE = {
	line: 'station {what} · round {round}/{cap} · effort {effort}',
	none: '-',
	station: '{station}',
	stationStep: '{station} step {step} of {of}',
	stationRound: '{station} round {round}',
} as const

/** `<what>` of the station line for each other kind of the walk's answer (`none` prints no line). */
export const STATION_WHAT: Readonly<Record<Exclude<NextStationKind, 'station'>, string>> = {
	check: '{check} ({why})',
	unknown: 'unknown ({why})',
	// the walk's why already reads `<station> running since <at> (run <run>)`: said once (D32)
	running: '{why}',
	snapshot: 'lot snapshot round {round}',
	question: 'question to the person ({why})',
	'handover-write': 'handover write ({why})',
	answer: 'answer {question}',
	none: '',
}

/** The words of each check in the station line. */
export const CHECK_WORDS: Readonly<Record<NextCheckName, string>> = {
	'tdd-red': 'tdd red',
	'tdd-green-and-gate-fast': 'tdd green and gate --fast',
	'gate-fast': 'gate --fast',
	'gate-full': 'gate --full',
	contrib: 'contrib',
}
