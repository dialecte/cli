/** The orchestrator's folder below the state folder. */
export const ORCHESTRATOR_FOLDER_SEGMENTS: readonly string[] = ['dialecte', 'orchestrator']

/** The number of hexadecimal characters identifying a real workspace path. */
export const ORCHESTRATOR_WORKSPACE_HASH_LENGTH = 12

/** The names below one orchestrator workspace folder. */
export const ORCHESTRATOR_PATH_NAMES = {
	state: 'state.json',
	render: 'STATE.md',
	log: 'log.jsonl',
} as const

/** The known fields of a state document, in schema order: the parser walks them in this order. */
export const ORCHESTRATOR_STATE_FIELDS: readonly string[] = [
	'schema',
	'workspace',
	'updatedAt',
	'lanes',
	'lots',
	'runs',
	'runners',
	'held',
	'waitingOnYou',
	'prs',
	'next',
	'seen',
]

/** The known fields of a log event, in schema order. */
export const ORCHESTRATOR_EVENT_FIELDS: readonly string[] = [
	'schema',
	'id',
	'at',
	'kind',
	'subject',
	'facts',
]

/** The lane modes, the holders of a held item and the kinds of a waiting item. */
export const ORCHESTRATOR_LANE_MODES = ['running', 'hold', 'paused'] as const
export const ORCHESTRATOR_HELD_BY = ['user', 'runner', 'overlap'] as const
export const ORCHESTRATOR_WAITING_KINDS = ['gate', 'question'] as const

/** How many of the last log records the render shows under Recent. */
export const ORCHESTRATOR_RECENT_RECORDS = 10
