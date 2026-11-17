/** The words of `dialecte ci`. */

/** The verb the publish workflow runs: its lines keep their own streams. */
export const PUBLISH_DECISION_VERB = 'publish-decision'

/** The one flag of sync. */
export const DRY_RUN_FLAG = '--dry-run'

/** The usage line printed on a usage error. */
export const CI_USAGE = 'usage: dialecte ci sync [--dry-run] | ci check | ci publish-decision'

/** The printed lines; `{path}` and `{paths}` are filled in. */
export const CI_LINES = {
	created: 'ci: created {path}',
	updated: 'ci: updated {path}',
	deleted: 'ci: deleted {path}',
	differs: 'ci: {path} differs from the template',
	missing: 'ci: {path} is missing',
	extra: 'ci: {path} should be deleted: retired, or no job of this package calls it',
	fix: 'ci: run dialecte ci sync',
	inStep: 'ci: in step with the template',
	own: 'ci: own {paths}',
	contract: 'ci: {path} {finding}',
	dryRun: 'ci: --dry-run, nothing written',
	refused: 'ci: {reason}',
} as const
