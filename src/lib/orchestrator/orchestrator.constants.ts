/** The orchestrator's folder below the state folder. */
export const ORCHESTRATOR_FOLDER_SEGMENTS: readonly string[] = ['dialecte', 'orchestrator']

/** The number of hexadecimal characters identifying a real workspace path. */
export const ORCHESTRATOR_WORKSPACE_HASH_LENGTH = 12

/** The names below one orchestrator workspace folder. */
export const ORCHESTRATOR_PATH_NAMES = {
	state: 'state.json',
	render: 'STATE.md',
	log: 'log.jsonl',
	runs: 'runs',
	reviews: 'reviews',
	answers: 'answers',
} as const
