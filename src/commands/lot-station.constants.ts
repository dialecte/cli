import type { LotStateName } from '../lib/store/store.types.ts'

/** The lot states a station start is refused on; an end is accepted in every state (a late notice still counts). */
export const STATION_START_REFUSED_STATES: readonly LotStateName[] = [
	'committed',
	'canceled',
	'failed',
]

/**
 * The fields a retry or an `--event` repeat does not compare: the envelope the cli makes, the cli-made `run`,
 * `started` of an end recorded alone, and the state hash the cli reads at an end (D29). Every other field is
 * host-given.
 */
export const NOT_HOST_GIVEN_FIELDS: readonly string[] = [
	'schema',
	'id',
	'at',
	'pid',
	'cli',
	'worktreeCli',
	'simulated',
	'lot',
	'by',
	'run',
	'started',
	'stateHash',
]

/** The fields that pair an end without `--run` with its start, and a retry with the end it repeats. */
export const STATION_PAIRING_FIELDS: readonly string[] = ['station', 'step', 'round', 'attempt']

/** The skill file inside a synced skill folder. */
export const SKILL_FILE_NAME = 'SKILL.md'
