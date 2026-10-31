/**
 * The identity git passes to a hook: a scratch repository sets its own, the hook's must not
 * override it.
 */
export const IDENTITY_ENVIRONMENT_VARIABLES = [
	'GIT_AUTHOR_NAME',
	'GIT_AUTHOR_EMAIL',
	'GIT_AUTHOR_DATE',
	'GIT_COMMITTER_NAME',
	'GIT_COMMITTER_EMAIL',
	'GIT_COMMITTER_DATE',
] as const

/**
 * Stops a scratch repository's git from looking for a repository above its folder, or below a
 * ceiling.
 */
export const DISCOVERY_ENVIRONMENT_VARIABLES = [
	'GIT_CEILING_DIRECTORIES',
	'GIT_DISCOVERY_ACROSS_FILESYSTEM',
] as const

/**
 * Git config given in the environment (`git -c` options, GIT_CONFIG_COUNT): the cli keeps it, a
 * scratch repository must not take a hook's.
 */
export const CONFIG_ENVIRONMENT_VARIABLES = [
	'GIT_CONFIG',
	'GIT_CONFIG_PARAMETERS',
	'GIT_CONFIG_COUNT',
] as const
