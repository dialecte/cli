/** The version of a `keep.jsonl` line. */
export const KEEP_SCHEMA = 1 as const

/** The ops a line may hold. */
export const KEEP_OPS = ['keep', 'unkeep'] as const

/** The keys a line holds, every one required (`keep-decision.schema.json`). */
export const KEEP_KEYS = ['schema', 'at', 'op', 'by', 'reason'] as const

/** The most bytes a `keep.jsonl` line may hold (one atomic append). */
export const KEEP_LINE_LIMIT = 4_096

/** The longest keep reason, in characters. */
export const KEEP_REASON_LIMIT = 200

/**
 * How every reader names a keep (`keptByDecision`, `keptByDecisionOf`, `keepNextOf`): a readable keep, a file with lines
 * that do not read, a file that cannot be read, a lot damaged or gone at the move, and the one next of a kept lot.
 */
export const KEEP_TEXTS = {
	kept: 'kept by decision: {reason} (by {by}, {day})',
	unreadableLines: 'kept: {file} holds {count} line(s) that do not read',
	unreadableFile: 'kept: {file} cannot be read ({code})',
	damaged: 'kept: lot {name} damaged ({damage})',
	gone: 'kept: lot {name} no longer in the store',
	throwawayStays: '{kept}: the throwaway stays with the lot',
	repairLinesNext: 'repair {file} by hand ({count} line(s) do not read), then: {next}',
	repairFileNext: 'repair {file} by hand ({code}), then: {next}',
} as const

/** The length of the day an `at` starts with (`YYYY-MM-DD`). */
export const KEEP_DAY_LENGTH = 10
